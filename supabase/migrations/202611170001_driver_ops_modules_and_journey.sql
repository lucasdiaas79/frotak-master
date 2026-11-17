-- Frotak - Operacao com embarcador (Ambev SE), fase 2: modulos novos e jornada do motorista.
--
-- O que muda:
--   1. Cinco modulos novos do TMS, desligados para todos os clientes. So o tenant da
--      operacao Ambev SE recebe os modulos (ver 202611170006). Nada muda para quem ja usa.
--   2. Jornada e ponto do motorista: dias de trabalho e marcacoes por atividade
--      (direcao, espera, carga e descarga, refeicao, descanso, outros trabalhos), com
--      posicao, origem da marcacao (motorista, etapa, cerca, voz, ajuste) e fila offline
--      idempotente (client_event_id).
--   3. Ajuste de marcacao com motivo, guardando o horario original, aprovado pela central.
--
-- Regras de lei (Lei 13.103/2015, CTB art. 67-C, STF ADI 5322) sao avaliadas no app e na
-- central a partir destas marcacoes. Isto nao e REP-P (Portaria MTE 671/2021): falta o
-- registro do programa e os arquivos AFD/AEJ.

begin;

-- 1. Modulos -------------------------------------------------------------------------

insert into public.modules (code, name, description, active, platform_product_id, is_core, sort_order)
select v.code, v.name, v.description, true, p.id, false, v.sort_order
from (
  values
    ('driver_journey', 'Jornada do motorista', 'Ponto e jornada pelo app, ligados as etapas, com alertas da Lei 13.103 e espelho de ponto.', 70),
    ('driver_safety', 'Seguranca do motorista', 'Checklist do veiculo, ocorrencias, emergencia, documentos com vencimento e avisos com ciencia.', 80),
    ('fuel_control', 'Controle de combustivel', 'Postos com preco combinado, tanque cheio, conferencias de odometro, tanque, preco e rastreador.', 90),
    ('delivery_routes', 'Rotas de entrega', 'Rotas com varias paradas, janelas, canhoto, assinatura, recusa, vasilhame e recebimento.', 100),
    ('driver_performance', 'Desempenho do motorista', 'Nota do motorista, ranking e premiacao com dados de abastecimento, rastreador e etapas.', 110)
) as v(code, name, description, sort_order)
cross join public.platform_products p
where p.code = 'tms'
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  platform_product_id = excluded.platform_product_id,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Motorista atual com o modulo exigido ligado no tenant dele.
create or replace function private.current_driver_with_module(p_module_code text)
returns public.drivers
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
begin
  v_driver := private.current_driver();
  if not private.tenant_has_module(v_driver.tenant_id, p_module_code) then
    raise exception 'MODULE_DISABLED:%', p_module_code using errcode = '42501';
  end if;
  return v_driver;
end;
$$;

revoke all on function private.current_driver_with_module(text) from public, anon, authenticated;

-- Hora do evento: o app manda a hora do celular (para a fila offline). Aceita ate 72h
-- para tras; hora no futuro vira a hora do servidor.
create or replace function private.ops_event_time(p_at timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = pg_catalog
as $$
begin
  if p_at is null or p_at > now() + interval '2 minutes' then
    return now();
  end if;
  if p_at < now() - interval '72 hours' then
    raise exception 'OPS_EVENT_TOO_OLD' using errcode = '22023';
  end if;
  return p_at;
end;
$$;

-- Posicao: guarda so lat, lng, precisao e origem.
create or replace function private.ops_clean_geo(p_geo jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_geo is null or jsonb_typeof(p_geo) <> 'object' then null
    when (p_geo->>'lat') is null or (p_geo->>'lng') is null then null
    else jsonb_strip_nulls(jsonb_build_object(
      'lat', round((p_geo->>'lat')::numeric, 6),
      'lng', round((p_geo->>'lng')::numeric, 6),
      'accuracy', case when (p_geo->>'accuracy') ~ '^[0-9.]+$' then round((p_geo->>'accuracy')::numeric) end,
      'source', case when p_geo->>'source' in ('gps', 'simulado', 'rastreador') then p_geo->>'source' else 'gps' end
    ))
  end;
$$;

-- 2. Jornada --------------------------------------------------------------------------

create table public.driver_work_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  work_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_geo jsonb,
  end_geo jsonb,
  start_selfie boolean not null default false,
  confirmed_by_driver_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_work_days_end_chk check (ended_at is null or ended_at >= started_at)
);

comment on table public.driver_work_days is
  'Jornada diaria do motorista (inicio e fim). As atividades ficam em driver_punches.';

create unique index driver_work_days_one_open_uidx
  on public.driver_work_days (driver_id)
  where ended_at is null;
create index driver_work_days_tenant_date_idx on public.driver_work_days (tenant_id, work_date desc);
create index driver_work_days_driver_date_idx on public.driver_work_days (driver_id, work_date desc);

create trigger driver_work_days_set_updated_at
before update on public.driver_work_days
for each row execute function public.set_updated_at();

create table public.driver_punches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  work_day_id uuid not null references public.driver_work_days(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  activity text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  source text not null default 'motorista',
  reason text,
  geo jsonb,
  route_id uuid,
  stop_id uuid,
  client_event_id text,
  received_at timestamptz not null default now(),
  original_started_at timestamptz,
  adjustment_reason text,
  adjustment_status text,
  adjustment_requested_at timestamptz,
  adjustment_reviewed_by uuid references auth.users(id) on delete set null,
  adjustment_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_punches_activity_chk
    check (activity in ('direcao', 'espera', 'carga_descarga', 'refeicao', 'descanso', 'trabalho')),
  constraint driver_punches_source_chk
    check (source in ('motorista', 'etapa', 'cerca', 'voz', 'ajuste', 'central')),
  constraint driver_punches_end_chk check (ended_at is null or ended_at >= started_at),
  constraint driver_punches_adjustment_chk
    check (adjustment_status is null or adjustment_status in ('pendente', 'aprovado', 'recusado'))
);

comment on table public.driver_punches is
  'Marcacoes de ponto por atividade. Hora do celular aceita ate 72h para tras (fila offline).';

create unique index driver_punches_client_event_uidx
  on public.driver_punches (driver_id, client_event_id)
  where client_event_id is not null;
create index driver_punches_day_idx on public.driver_punches (work_day_id, started_at);
create index driver_punches_tenant_started_idx on public.driver_punches (tenant_id, started_at desc);
create index driver_punches_pending_adjust_idx
  on public.driver_punches (tenant_id)
  where adjustment_status = 'pendente';

create trigger driver_punches_set_updated_at
before update on public.driver_punches
for each row execute function public.set_updated_at();

alter table public.driver_work_days enable row level security;
alter table public.driver_punches enable row level security;

create policy driver_work_days_tenant_access on public.driver_work_days
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));

create policy driver_punches_tenant_access on public.driver_punches
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));

grant select, insert, update on public.driver_work_days to authenticated;
grant select, insert, update on public.driver_punches to authenticated;

-- Fecha a atividade aberta e abre a nova. Usado pelo app e pelas etapas de rota.
create or replace function private.journey_set_activity(
  p_driver public.drivers,
  p_activity text,
  p_source text,
  p_reason text,
  p_at timestamptz,
  p_geo jsonb,
  p_route_id uuid,
  p_stop_id uuid,
  p_client_event_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_day public.driver_work_days;
  v_open public.driver_punches;
  v_id uuid;
begin
  if p_client_event_id is not null then
    select id into v_id
    from public.driver_punches
    where driver_id = p_driver.id and client_event_id = p_client_event_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  select * into v_day
  from public.driver_work_days
  where driver_id = p_driver.id and ended_at is null
  for update;

  if not found then
    -- Etapa de rota sem jornada aberta: abre a jornada sozinho, para nao perder horas.
    if p_source in ('etapa', 'cerca') then
      insert into public.driver_work_days (tenant_id, driver_id, vehicle_id, work_date, started_at, start_geo)
      values (p_driver.tenant_id, p_driver.id, p_driver.vehicle_id, (p_at at time zone 'America/Sao_Paulo')::date, p_at, private.ops_clean_geo(p_geo))
      returning * into v_day;
    else
      raise exception 'JOURNEY_NOT_STARTED' using errcode = '22023';
    end if;
  end if;

  select * into v_open
  from public.driver_punches
  where work_day_id = v_day.id and ended_at is null
  order by started_at desc
  limit 1
  for update;

  if found then
    if v_open.activity = p_activity and p_source not in ('etapa', 'cerca') then
      return v_open.id;
    end if;
    update public.driver_punches
    set ended_at = greatest(p_at, started_at)
    where work_day_id = v_day.id and ended_at is null;
  end if;

  insert into public.driver_punches (
    tenant_id, work_day_id, driver_id, activity, started_at, source, reason, geo,
    route_id, stop_id, client_event_id
  )
  values (
    p_driver.tenant_id, v_day.id, p_driver.id, p_activity, greatest(p_at, v_day.started_at), p_source,
    nullif(btrim(coalesce(p_reason, '')), ''), private.ops_clean_geo(p_geo),
    p_route_id, p_stop_id, p_client_event_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.journey_set_activity(public.drivers, text, text, text, timestamptz, jsonb, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.driver_journey_start(
  p_at timestamptz default null,
  p_geo jsonb default null,
  p_selfie boolean default false,
  p_client_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_at timestamptz;
  v_day public.driver_work_days;
  v_last_end timestamptz;
begin
  v_driver := private.current_driver_with_module('driver_journey');
  v_at := private.ops_event_time(p_at);

  if p_client_event_id is not null and exists (
    select 1 from public.driver_punches where driver_id = v_driver.id and client_event_id = p_client_event_id
  ) then
    return public.get_driver_ops_context();
  end if;

  select * into v_day from public.driver_work_days where driver_id = v_driver.id and ended_at is null;
  if found then
    return public.get_driver_ops_context();
  end if;

  select max(ended_at) into v_last_end from public.driver_work_days where driver_id = v_driver.id;

  insert into public.driver_work_days (tenant_id, driver_id, vehicle_id, work_date, started_at, start_geo, start_selfie)
  values (v_driver.tenant_id, v_driver.id, v_driver.vehicle_id, (v_at at time zone 'America/Sao_Paulo')::date, v_at, private.ops_clean_geo(p_geo), coalesce(p_selfie, false))
  returning * into v_day;

  insert into public.driver_punches (tenant_id, work_day_id, driver_id, activity, started_at, source, reason, geo, client_event_id)
  values (v_driver.tenant_id, v_day.id, v_driver.id, 'trabalho', v_at, 'motorista',
    case when v_last_end is not null and v_at - v_last_end < interval '11 hours'
      then 'Inicio de jornada (interjornada menor que 11h)' else 'Inicio de jornada' end,
    private.ops_clean_geo(p_geo), p_client_event_id);

  return public.get_driver_ops_context();
end;
$$;

create or replace function public.driver_journey_set_activity(
  p_activity text,
  p_source text default 'motorista',
  p_reason text default null,
  p_at timestamptz default null,
  p_geo jsonb default null,
  p_client_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
begin
  v_driver := private.current_driver_with_module('driver_journey');
  if p_source not in ('motorista', 'voz', 'cerca', 'etapa') then
    raise exception 'invalid punch source' using errcode = '22023';
  end if;
  perform private.journey_set_activity(
    v_driver, p_activity, p_source, p_reason, private.ops_event_time(p_at), p_geo, null, null, p_client_event_id
  );
  return public.get_driver_ops_context();
end;
$$;

create or replace function public.driver_journey_end(
  p_at timestamptz default null,
  p_geo jsonb default null,
  p_client_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_at timestamptz;
  v_day public.driver_work_days;
begin
  v_driver := private.current_driver_with_module('driver_journey');
  v_at := private.ops_event_time(p_at);

  select * into v_day from public.driver_work_days where driver_id = v_driver.id and ended_at is null for update;
  if not found then
    return public.get_driver_ops_context();
  end if;

  update public.driver_punches
  set ended_at = greatest(v_at, started_at)
  where work_day_id = v_day.id and ended_at is null;

  update public.driver_work_days
  set ended_at = greatest(v_at, started_at), end_geo = private.ops_clean_geo(p_geo)
  where id = v_day.id;

  return public.get_driver_ops_context();
end;
$$;

create or replace function public.driver_journey_request_adjustment(
  p_punch_id uuid,
  p_new_started_at timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_punch public.driver_punches;
begin
  v_driver := private.current_driver_with_module('driver_journey');
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_punch from public.driver_punches where id = p_punch_id and driver_id = v_driver.id for update;
  if not found then
    raise exception 'punch not found' using errcode = 'P0002';
  end if;
  if p_new_started_at > now() or p_new_started_at < v_punch.started_at - interval '24 hours' then
    raise exception 'ADJUSTMENT_TIME_INVALID' using errcode = '22023';
  end if;

  update public.driver_punches
  set
    original_started_at = coalesce(original_started_at, started_at),
    started_at = p_new_started_at,
    adjustment_reason = btrim(p_reason),
    adjustment_status = 'pendente',
    adjustment_requested_at = now()
  where id = v_punch.id;

  -- A marcacao anterior termina onde esta comeca.
  update public.driver_punches
  set ended_at = p_new_started_at
  where work_day_id = v_punch.work_day_id
    and id <> v_punch.id
    and started_at < p_new_started_at
    and ended_at = v_punch.started_at;

  return public.get_driver_ops_context();
end;
$$;

create or replace function public.driver_journey_confirm_day(p_work_day_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
begin
  v_driver := private.current_driver_with_module('driver_journey');
  update public.driver_work_days
  set confirmed_by_driver_at = now()
  where id = p_work_day_id and driver_id = v_driver.id and ended_at is not null;
  return public.get_driver_ops_context();
end;
$$;

-- Central aprova ou recusa ajuste. Recusa volta o horario original.
create or replace function public.journey_review_adjustment(p_punch_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_punch public.driver_punches;
begin
  select * into v_punch from public.driver_punches where id = p_punch_id for update;
  if not found or not private.can_access_tenant(v_punch.tenant_id) then
    raise exception 'punch not found' using errcode = 'P0002';
  end if;
  if v_punch.adjustment_status is distinct from 'pendente' then
    return;
  end if;
  if p_approve then
    update public.driver_punches
    set adjustment_status = 'aprovado', adjustment_reviewed_by = auth.uid(), adjustment_reviewed_at = now()
    where id = p_punch_id;
  else
    update public.driver_punches
    set ended_at = original_started_at
    where work_day_id = v_punch.work_day_id and id <> v_punch.id and ended_at = v_punch.started_at;
    update public.driver_punches
    set started_at = original_started_at, adjustment_status = 'recusado',
        adjustment_reviewed_by = auth.uid(), adjustment_reviewed_at = now()
    where id = p_punch_id;
  end if;
end;
$$;

revoke all on function public.driver_journey_start(timestamptz, jsonb, boolean, text) from public, anon;
revoke all on function public.driver_journey_set_activity(text, text, text, timestamptz, jsonb, text) from public, anon;
revoke all on function public.driver_journey_end(timestamptz, jsonb, text) from public, anon;
revoke all on function public.driver_journey_request_adjustment(uuid, timestamptz, text) from public, anon;
revoke all on function public.driver_journey_confirm_day(uuid) from public, anon;
revoke all on function public.journey_review_adjustment(uuid, boolean) from public, anon;
grant execute on function public.driver_journey_start(timestamptz, jsonb, boolean, text) to authenticated;
grant execute on function public.driver_journey_set_activity(text, text, text, timestamptz, jsonb, text) to authenticated;
grant execute on function public.driver_journey_end(timestamptz, jsonb, text) to authenticated;
grant execute on function public.driver_journey_request_adjustment(uuid, timestamptz, text) to authenticated;
grant execute on function public.driver_journey_confirm_day(uuid) to authenticated;
grant execute on function public.journey_review_adjustment(uuid, boolean) to authenticated;

commit;
