-- Frotak - Operacao com embarcador (Ambev SE), fase 5: rotas de entrega com varias paradas.
--
-- O que muda (atras do modulo delivery_routes):
--   1. Rota (mapa de carga) com paradas: origem (CDD ou fabrica), entregas nos pontos de
--      venda, destinos de transferencia e retorno. Cada parada tem janela, doca, notas,
--      vasilhame esperado e recebimento esperado.
--   2. Etapas da parada pelo app: chegada (motorista ou cerca), inicio da descarga e
--      termino (entregue, parcial ou recusada) com canhoto: quem recebeu, assinatura,
--      foto, caixas entregues, motivo da recusa, vasilhame recolhido e pagamento.
--   3. Cada etapa marca o ponto do motorista sozinha (espera, carga e descarga, direcao),
--      quando o modulo driver_journey esta ligado.
--   4. Linha do tempo da rota (delivery_route_events) para a central e o embarcador.
--   5. A central cria a rota com route_upsert (tela ou importacao do mapa de carga).
--
-- Nao mexe em fretes nem nas etapas antigas do veiculo (driver_app_advance_stage).

begin;

create table public.delivery_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete restrict,
  code text not null,
  kind text not null default 'distribuicao' check (kind in ('distribuicao', 'transferencia')),
  title text not null,
  shipper_name text,
  driver_id uuid references public.drivers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  freight_id uuid references public.freights(id) on delete set null,
  scheduled_at timestamptz not null default now(),
  status text not null default 'agendada' check (status in ('agendada', 'em_andamento', 'finalizada', 'cancelada')),
  started_at timestamptz,
  finished_at timestamptz,
  start_odometer numeric,
  end_odometer numeric,
  start_geo jsonb,
  end_geo jsonb,
  current_stop_index integer not null default 0,
  total_boxes integer not null default 0,
  total_weight_kg numeric(12, 1) not null default 0,
  distance_km numeric(10, 1),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index delivery_routes_driver_idx on public.delivery_routes (driver_id, status, scheduled_at desc);
create index delivery_routes_tenant_day_idx on public.delivery_routes (tenant_id, scheduled_at desc);

create table public.delivery_route_stops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  route_id uuid not null references public.delivery_routes(id) on delete cascade,
  seq integer not null,
  kind text not null check (kind in ('origem', 'entrega', 'destino', 'retorno')),
  name text not null,
  document text,
  address text,
  city text,
  lat double precision,
  lng double precision,
  radius_m integer not null default 150 check (radius_m between 30 and 5000),
  window_from time,
  window_to time,
  dock text,
  invoices jsonb not null default '[]'::jsonb,
  returnables_expected jsonb not null default '{}'::jsonb,
  payment_expected jsonb,
  status text not null default 'pendente'
    check (status in ('pendente', 'a_caminho', 'chegou', 'descarregando', 'entregue', 'parcial', 'recusada')),
  arrived_at timestamptz,
  arrival_source text check (arrival_source is null or arrival_source in ('motorista', 'cerca')),
  arrival_geo jsonb,
  unload_started_at timestamptz,
  finished_at timestamptz,
  departure_geo jsonb,
  boxes_delivered integer,
  refusal_reason text check (refusal_reason is null or refusal_reason in
    ('cliente_fechado', 'sem_pagamento', 'avaria', 'pedido_errado', 'sem_espaco', 'falta_produto', 'outro')),
  refusal_note text,
  receiver_name text,
  receiver_document text,
  signature_data text check (signature_data is null or length(signature_data) <= 300000),
  pod_photo_paths text[] not null default '{}',
  returnables_collected jsonb not null default '{}'::jsonb,
  payment_received jsonb,
  updated_at timestamptz not null default now(),
  unique (route_id, seq)
);

create index delivery_route_stops_route_idx on public.delivery_route_stops (route_id, seq);

create table public.delivery_route_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  route_id uuid not null references public.delivery_routes(id) on delete cascade,
  stop_id uuid references public.delivery_route_stops(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  kind text not null,
  detail text,
  geo jsonb,
  occurred_at timestamptz not null default now(),
  client_event_id text,
  created_at timestamptz not null default now()
);

create index delivery_route_events_route_idx on public.delivery_route_events (route_id, occurred_at);
create unique index delivery_route_events_client_uidx
  on public.delivery_route_events (driver_id, client_event_id) where client_event_id is not null;

create trigger delivery_routes_set_updated_at before update on public.delivery_routes
for each row execute function public.set_updated_at();
create trigger delivery_route_stops_set_updated_at before update on public.delivery_route_stops
for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['delivery_routes', 'delivery_route_stops', 'delivery_route_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (private.can_access_tenant(tenant_id)) with check (private.can_access_tenant(tenant_id))',
      t || '_tenant_access', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- Apoio ---------------------------------------------------------------------------------

-- Rota do motorista, travada para alteracao. Confere modulo, dono e evento repetido.
create or replace function private.route_for_driver(p_driver public.drivers, p_route_id uuid)
returns public.delivery_routes
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_route public.delivery_routes;
begin
  select * into v_route from public.delivery_routes
  where id = p_route_id and tenant_id = p_driver.tenant_id and driver_id = p_driver.id
  for update;
  if not found then
    raise exception 'ROUTE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_route;
end;
$$;

create or replace function private.route_event(
  p_route public.delivery_routes, p_stop_id uuid, p_driver_id uuid, p_kind text, p_detail text,
  p_geo jsonb, p_at timestamptz, p_client_event_id text
)
returns void
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  insert into public.delivery_route_events (tenant_id, route_id, stop_id, driver_id, kind, detail, geo, occurred_at, client_event_id)
  values (p_route.tenant_id, p_route.id, p_stop_id, p_driver_id, p_kind, p_detail, private.ops_clean_geo(p_geo), p_at, p_client_event_id);
$$;

create or replace function private.route_seen_event(p_driver_id uuid, p_client_event_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select p_client_event_id is not null and exists (
    select 1 from public.delivery_route_events where driver_id = p_driver_id and client_event_id = p_client_event_id
  );
$$;

-- Marca a jornada se o modulo estiver ligado e o dia aberto (ou se a etapa abre o dia).
create or replace function private.route_punch(
  p_driver public.drivers, p_activity text, p_reason text, p_at timestamptz, p_geo jsonb,
  p_route_id uuid, p_stop_id uuid, p_source text default 'etapa'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if private.tenant_has_module(p_driver.tenant_id, 'driver_journey') then
    perform private.journey_set_activity(p_driver, p_activity, p_source, p_reason, p_at, p_geo, p_route_id, p_stop_id, null);
  end if;
end;
$$;

revoke all on function private.route_for_driver(public.drivers, uuid) from public, anon, authenticated;
revoke all on function private.route_event(public.delivery_routes, uuid, uuid, text, text, jsonb, timestamptz, text) from public, anon, authenticated;
revoke all on function private.route_seen_event(uuid, text) from public, anon, authenticated;
revoke all on function private.route_punch(public.drivers, text, text, timestamptz, jsonb, uuid, uuid, text) from public, anon, authenticated;

-- Etapas pelo app -----------------------------------------------------------------------

create or replace function public.driver_route_start(
  p_route_id uuid,
  p_odometer numeric,
  p_geo jsonb default null,
  p_at timestamptz default null,
  p_client_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_route public.delivery_routes;
  v_origin public.delivery_route_stops;
  v_at timestamptz;
begin
  v_driver := private.current_driver_with_module('delivery_routes');
  v_at := private.ops_event_time(p_at);
  if private.route_seen_event(v_driver.id, p_client_event_id) then
    return public.get_driver_ops_context();
  end if;
  v_route := private.route_for_driver(v_driver, p_route_id);
  if v_route.status <> 'agendada' then
    raise exception 'ROUTE_ALREADY_STARTED' using errcode = '22023';
  end if;
  if coalesce(p_odometer, 0) <= 0 then
    raise exception 'ROUTE_ODOMETER_REQUIRED' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.delivery_routes
    where driver_id = v_driver.id and status = 'em_andamento' and id <> v_route.id
  ) then
    raise exception 'ROUTE_OTHER_IN_PROGRESS' using errcode = '22023';
  end if;

  -- Checklist de saida aprovado nas ultimas 12h, quando o tenant usa checklist.
  if private.tenant_has_module(v_driver.tenant_id, 'driver_safety')
    and exists (select 1 from public.vehicle_checklist_templates where tenant_id = v_driver.tenant_id and active)
    and not exists (
      select 1 from public.vehicle_checklists
      where driver_id = v_driver.id and moment = 'saida' and approved and performed_at > v_at - interval '12 hours'
    ) then
    raise exception 'ROUTE_CHECKLIST_REQUIRED' using errcode = '22023';
  end if;

  select * into v_origin from public.delivery_route_stops where route_id = v_route.id order by seq limit 1;

  update public.delivery_routes
  set status = 'em_andamento', started_at = v_at, start_odometer = p_odometer,
      start_geo = private.ops_clean_geo(p_geo), current_stop_index = 0,
      vehicle_id = coalesce(vehicle_id, v_driver.vehicle_id)
  where id = v_route.id
  returning * into v_route;

  if v_origin.id is not null then
    if v_route.kind = 'distribuicao' and v_origin.kind = 'origem' then
      update public.delivery_route_stops
      set status = 'chegou', arrived_at = v_at, arrival_source = 'cerca', arrival_geo = private.ops_clean_geo(p_geo)
      where id = v_origin.id;
      perform private.route_punch(v_driver, 'espera', 'Aguardando doca no ' || v_origin.name, v_at, p_geo, v_route.id, v_origin.id);
    else
      update public.delivery_route_stops set status = 'a_caminho' where id = v_origin.id;
      perform private.route_punch(v_driver, 'direcao', 'Saiu para ' || v_origin.name, v_at, p_geo, v_route.id, v_origin.id);
    end if;
  end if;

  perform private.route_event(v_route, null, v_driver.id, 'inicio', 'Viagem iniciada', p_geo, v_at, p_client_event_id);
  return public.get_driver_ops_context();
end;
$$;

create or replace function public.driver_route_arrive(
  p_stop_id uuid,
  p_source text default 'motorista',
  p_geo jsonb default null,
  p_at timestamptz default null,
  p_client_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_stop public.delivery_route_stops;
  v_route public.delivery_routes;
  v_at timestamptz;
  v_geo jsonb;
  v_source text;
begin
  v_driver := private.current_driver_with_module('delivery_routes');
  v_at := private.ops_event_time(p_at);
  if private.route_seen_event(v_driver.id, p_client_event_id) then
    return public.get_driver_ops_context();
  end if;
  select * into v_stop from public.delivery_route_stops where id = p_stop_id;
  if not found then
    raise exception 'STOP_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_route := private.route_for_driver(v_driver, v_stop.route_id);
  if v_route.status <> 'em_andamento' then
    raise exception 'ROUTE_NOT_IN_PROGRESS' using errcode = '22023';
  end if;
  if v_stop.status not in ('pendente', 'a_caminho') then
    return public.get_driver_ops_context();
  end if;

  v_geo := private.ops_clean_geo(p_geo);
  v_source := case when p_source = 'cerca' then 'cerca' else 'motorista' end;
  -- Cerca so vale com posicao dentro do raio; senao vira chegada manual.
  if v_source = 'cerca' and (v_geo is null or v_stop.lat is null
    or private.geo_km(v_stop.lat, v_stop.lng, (v_geo->>'lat')::float8, (v_geo->>'lng')::float8) * 1000 > v_stop.radius_m * 1.5) then
    v_source := 'motorista';
  end if;

  update public.delivery_route_stops
  set status = 'chegou', arrived_at = v_at, arrival_source = v_source, arrival_geo = v_geo
  where id = v_stop.id;
  update public.delivery_routes
  set current_stop_index = (select count(*) from public.delivery_route_stops where route_id = v_route.id and seq < v_stop.seq)
  where id = v_route.id;

  perform private.route_punch(v_driver, 'espera', 'Chegou: ' || v_stop.name, v_at, p_geo, v_route.id, v_stop.id, case when v_source = 'cerca' then 'cerca' else 'etapa' end);
  perform private.route_event(v_route, v_stop.id, v_driver.id, 'chegada',
    v_stop.name || case when v_source = 'cerca' then ' (cerca)' else '' end, p_geo, v_at, p_client_event_id);
  return public.get_driver_ops_context();
end;
$$;

create or replace function public.driver_route_start_unload(
  p_stop_id uuid,
  p_geo jsonb default null,
  p_at timestamptz default null,
  p_client_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_stop public.delivery_route_stops;
  v_route public.delivery_routes;
  v_at timestamptz;
begin
  v_driver := private.current_driver_with_module('delivery_routes');
  v_at := private.ops_event_time(p_at);
  if private.route_seen_event(v_driver.id, p_client_event_id) then
    return public.get_driver_ops_context();
  end if;
  select * into v_stop from public.delivery_route_stops where id = p_stop_id;
  if not found then
    raise exception 'STOP_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_route := private.route_for_driver(v_driver, v_stop.route_id);
  if v_stop.status <> 'chegou' then
    raise exception 'STOP_NOT_ARRIVED' using errcode = '22023';
  end if;

  update public.delivery_route_stops set status = 'descarregando', unload_started_at = v_at where id = v_stop.id;

  perform private.route_punch(v_driver,
    case when v_stop.kind = 'retorno' then 'trabalho' else 'carga_descarga' end,
    case v_stop.kind when 'origem' then 'Carregamento: ' || v_stop.name
      when 'retorno' then 'Prestacao de contas' else 'Descarga: ' || v_stop.name end,
    v_at, p_geo, v_route.id, v_stop.id);
  perform private.route_event(v_route, v_stop.id, v_driver.id,
    case when v_stop.kind = 'origem' then 'inicio_carga' else 'inicio_descarga' end, v_stop.name, p_geo, v_at, p_client_event_id);
  return public.get_driver_ops_context();
end;
$$;

-- p_result: entregue | parcial | recusada
-- p_pod: { boxes_delivered, refusal_reason, refusal_note, receiver_name, receiver_document,
--          signature, pod_photo_paths[], returnables{}, payment{method, amount, received} }
create or replace function public.driver_route_finish_stop(
  p_stop_id uuid,
  p_result text,
  p_pod jsonb default '{}'::jsonb,
  p_geo jsonb default null,
  p_at timestamptz default null,
  p_client_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_stop public.delivery_route_stops;
  v_next public.delivery_route_stops;
  v_route public.delivery_routes;
  v_at timestamptz;
  v_pod jsonb := coalesce(p_pod, '{}'::jsonb);
  v_expected_boxes integer;
begin
  v_driver := private.current_driver_with_module('delivery_routes');
  v_at := private.ops_event_time(p_at);
  if private.route_seen_event(v_driver.id, p_client_event_id) then
    return public.get_driver_ops_context();
  end if;
  if p_result not in ('entregue', 'parcial', 'recusada') then
    raise exception 'STOP_RESULT_INVALID' using errcode = '22023';
  end if;
  select * into v_stop from public.delivery_route_stops where id = p_stop_id;
  if not found then
    raise exception 'STOP_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_route := private.route_for_driver(v_driver, v_stop.route_id);
  if v_stop.status not in ('chegou', 'descarregando') then
    raise exception 'STOP_NOT_ARRIVED' using errcode = '22023';
  end if;

  select coalesce(sum((i->>'boxes')::int), 0) into v_expected_boxes from jsonb_array_elements(v_stop.invoices) i;

  if v_stop.kind = 'entrega' then
    if p_result in ('parcial', 'recusada') and coalesce(v_pod->>'refusal_reason', '') = '' then
      raise exception 'STOP_REFUSAL_REASON_REQUIRED' using errcode = '22023';
    end if;
    if p_result <> 'recusada' and btrim(coalesce(v_pod->>'receiver_name', '')) = '' then
      raise exception 'STOP_RECEIVER_REQUIRED' using errcode = '22023';
    end if;
  end if;

  update public.delivery_route_stops
  set status = p_result,
      finished_at = v_at,
      departure_geo = private.ops_clean_geo(p_geo),
      boxes_delivered = case
        when p_result = 'recusada' then 0
        when p_result = 'entregue' and v_pod->>'boxes_delivered' is null then v_expected_boxes
        else (v_pod->>'boxes_delivered')::int end,
      refusal_reason = nullif(v_pod->>'refusal_reason', ''),
      refusal_note = nullif(btrim(coalesce(v_pod->>'refusal_note', '')), ''),
      receiver_name = nullif(btrim(coalesce(v_pod->>'receiver_name', '')), ''),
      receiver_document = nullif(btrim(coalesce(v_pod->>'receiver_document', '')), ''),
      signature_data = nullif(v_pod->>'signature', ''),
      pod_photo_paths = coalesce(array(select jsonb_array_elements_text(v_pod->'pod_photo_paths')), '{}'),
      returnables_collected = coalesce(v_pod->'returnables', '{}'::jsonb),
      payment_received = v_pod->'payment'
  where id = v_stop.id;

  select * into v_next from public.delivery_route_stops
  where route_id = v_route.id and seq > v_stop.seq order by seq limit 1;

  if v_next.id is not null then
    update public.delivery_route_stops set status = 'a_caminho' where id = v_next.id and status = 'pendente';
    update public.delivery_routes
    set current_stop_index = (select count(*) from public.delivery_route_stops where route_id = v_route.id and seq < v_next.seq)
    where id = v_route.id;
    perform private.route_punch(v_driver, 'direcao', 'Saiu de ' || v_stop.name, v_at, p_geo, v_route.id, v_next.id);
  end if;

  perform private.route_event(v_route, v_stop.id, v_driver.id,
    case p_result when 'recusada' then 'recusa' when 'parcial' then 'entrega_parcial' else
      case when v_stop.kind = 'origem' then 'fim_carga' else 'entrega' end end,
    v_stop.name || coalesce(' - ' || nullif(v_pod->>'refusal_reason', ''), ''), p_geo, v_at, p_client_event_id);

  -- Recusa ou parcial avisa a central como ocorrencia.
  if p_result in ('parcial', 'recusada') and private.tenant_has_module(v_driver.tenant_id, 'driver_safety') then
    insert into public.driver_occurrences (tenant_id, driver_id, vehicle_id, route_id, stop_id, kind, severity, note, geo, occurred_at)
    values (v_driver.tenant_id, v_driver.id, v_route.vehicle_id, v_route.id, v_stop.id,
      case when v_pod->>'refusal_reason' = 'cliente_fechado' then 'cliente_fechado' else 'outro' end,
      'media',
      initcap(p_result) || ' em ' || v_stop.name || ': ' || coalesce(v_pod->>'refusal_reason', '') ||
        coalesce(' - ' || nullif(btrim(coalesce(v_pod->>'refusal_note', '')), ''), ''),
      private.ops_clean_geo(p_geo), v_at);
  end if;

  return public.get_driver_ops_context();
end;
$$;

create or replace function public.driver_route_finish(
  p_route_id uuid,
  p_end_odometer numeric,
  p_geo jsonb default null,
  p_at timestamptz default null,
  p_client_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_route public.delivery_routes;
  v_at timestamptz;
begin
  v_driver := private.current_driver_with_module('delivery_routes');
  v_at := private.ops_event_time(p_at);
  if private.route_seen_event(v_driver.id, p_client_event_id) then
    return public.get_driver_ops_context();
  end if;
  v_route := private.route_for_driver(v_driver, p_route_id);
  if v_route.status <> 'em_andamento' then
    raise exception 'ROUTE_NOT_IN_PROGRESS' using errcode = '22023';
  end if;
  if coalesce(p_end_odometer, 0) < coalesce(v_route.start_odometer, 0) then
    raise exception 'ROUTE_ODOMETER_LOWER:%', v_route.start_odometer using errcode = '22023';
  end if;
  if exists (
    select 1 from public.delivery_route_stops
    where route_id = v_route.id and kind in ('entrega', 'destino') and status not in ('entregue', 'parcial', 'recusada')
  ) then
    raise exception 'ROUTE_STOPS_PENDING' using errcode = '22023';
  end if;

  update public.delivery_route_stops
  set status = 'entregue', finished_at = v_at, departure_geo = private.ops_clean_geo(p_geo),
      arrived_at = coalesce(arrived_at, v_at)
  where route_id = v_route.id and kind in ('origem', 'retorno') and status not in ('entregue', 'parcial', 'recusada');

  update public.delivery_routes
  set status = 'finalizada', finished_at = v_at, end_odometer = p_end_odometer, end_geo = private.ops_clean_geo(p_geo),
      distance_km = coalesce(distance_km, p_end_odometer - start_odometer)
  where id = v_route.id
  returning * into v_route;

  perform private.route_punch(v_driver, 'trabalho', 'Viagem finalizada, conferencia final', v_at, p_geo, v_route.id, null);
  perform private.route_event(v_route, null, v_driver.id, 'fim', 'Viagem finalizada', p_geo, v_at, p_client_event_id);
  return public.get_driver_ops_context();
end;
$$;

-- Central: cria ou substitui uma rota agendada com as paradas.
-- p_route: { code, kind, title, shipper_name, driver_id, vehicle_id, freight_id, scheduled_at,
--            total_boxes, total_weight_kg, distance_km, notes,
--            stops: [{ kind, name, document, address, city, lat, lng, radius_m, window_from,
--                      window_to, dock, invoices[], returnables_expected{}, payment_expected{} }] }
create or replace function private.route_upsert_unchecked(p_tenant_id uuid, p_route jsonb)
returns public.delivery_routes
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_route public.delivery_routes;
  v_stop jsonb;
  v_seq integer := 0;
begin
  if btrim(coalesce(p_route->>'code', '')) = '' or jsonb_typeof(p_route->'stops') <> 'array' then
    raise exception 'ROUTE_INVALID' using errcode = '22023';
  end if;

  select * into v_route from public.delivery_routes where tenant_id = p_tenant_id and code = btrim(p_route->>'code') for update;
  if found and v_route.status <> 'agendada' then
    raise exception 'ROUTE_ALREADY_STARTED' using errcode = '22023';
  end if;

  insert into public.delivery_routes (
    tenant_id, code, kind, title, shipper_name, driver_id, vehicle_id, freight_id, scheduled_at,
    total_boxes, total_weight_kg, distance_km, notes, created_by
  )
  values (
    p_tenant_id, btrim(p_route->>'code'), coalesce(p_route->>'kind', 'distribuicao'),
    coalesce(nullif(p_route->>'title', ''), 'Rota ' || (p_route->>'code')), p_route->>'shipper_name',
    (p_route->>'driver_id')::uuid, (p_route->>'vehicle_id')::uuid, (p_route->>'freight_id')::uuid,
    coalesce((p_route->>'scheduled_at')::timestamptz, now()),
    coalesce((p_route->>'total_boxes')::int, 0), coalesce((p_route->>'total_weight_kg')::numeric, 0),
    (p_route->>'distance_km')::numeric, p_route->>'notes', auth.uid()
  )
  on conflict (tenant_id, code) do update
  set kind = excluded.kind, title = excluded.title, shipper_name = excluded.shipper_name,
      driver_id = excluded.driver_id, vehicle_id = excluded.vehicle_id, freight_id = excluded.freight_id,
      scheduled_at = excluded.scheduled_at, total_boxes = excluded.total_boxes,
      total_weight_kg = excluded.total_weight_kg, distance_km = excluded.distance_km, notes = excluded.notes
  returning * into v_route;

  delete from public.delivery_route_stops where route_id = v_route.id;
  for v_stop in select * from jsonb_array_elements(p_route->'stops') loop
    v_seq := v_seq + 1;
    insert into public.delivery_route_stops (
      tenant_id, route_id, seq, kind, name, document, address, city, lat, lng, radius_m,
      window_from, window_to, dock, invoices, returnables_expected, payment_expected
    )
    values (
      p_tenant_id, v_route.id, v_seq, coalesce(v_stop->>'kind', 'entrega'), v_stop->>'name', v_stop->>'document',
      v_stop->>'address', v_stop->>'city', (v_stop->>'lat')::float8, (v_stop->>'lng')::float8,
      coalesce((v_stop->>'radius_m')::int, 150), (v_stop->>'window_from')::time, (v_stop->>'window_to')::time,
      v_stop->>'dock', coalesce(v_stop->'invoices', '[]'::jsonb), coalesce(v_stop->'returnables_expected', '{}'::jsonb),
      v_stop->'payment_expected'
    );
  end loop;

  return v_route;
end;
$$;

revoke all on function private.route_upsert_unchecked(uuid, jsonb) from public, anon, authenticated;

create or replace function public.route_upsert(p_tenant_id uuid, p_route jsonb)
returns public.delivery_routes
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.can_access_tenant(p_tenant_id) then
    raise exception 'TENANT_ACCESS_DENIED' using errcode = '42501';
  end if;
  if not private.tenant_has_module(p_tenant_id, 'delivery_routes') then
    raise exception 'MODULE_DISABLED:delivery_routes' using errcode = '42501';
  end if;
  return private.route_upsert_unchecked(p_tenant_id, p_route);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.driver_route_start(uuid, numeric, jsonb, timestamptz, text)',
    'public.driver_route_arrive(uuid, text, jsonb, timestamptz, text)',
    'public.driver_route_start_unload(uuid, jsonb, timestamptz, text)',
    'public.driver_route_finish_stop(uuid, text, jsonb, jsonb, timestamptz, text)',
    'public.driver_route_finish(uuid, numeric, jsonb, timestamptz, text)',
    'public.route_upsert(uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;
