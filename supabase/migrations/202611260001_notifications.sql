-- Notificacoes do TMS: regras criadas pela equipe FrotaK no Master; avisos para os usuarios do
-- cliente no sino, no historico e no Windows (Web Push).
--
-- - notification_rules: fonte (tabela do catalogo) + gatilho + condicoes + texto + publico.
--   Banco unico: o Master grava aqui direto. Banco por cliente: o Master grava no Central e o agente
--   copia para cada cliente com master_sync_notification_rules() (mesmos ids em todos os bancos).
-- - Gatilho insert/update: trigger nas tabelas do catalogo avalia as regras na hora da gravacao.
-- - Gatilho schedule ("dado no banco"): evaluate_scheduled_notification_rules(), a cada 15 min
--   (pg_cron no Supabase hospedado; agente na VPS). Cada registro avisa uma vez enquanto os campos
--   das condicoes nao mudam.
-- - notifications: um aviso por usuario. A tela escuta pelo Realtime (sino e popup). O aviso do
--   Windows sai de push_status = 'pending' pela rota /api/notifications/dispatch do TMS.
-- - Uma regra com erro nunca impede a gravacao do frete: vira aviso no log do banco.
--
-- Os nomes de campo das regras sao os do catalogo (etapa, placa, motorista...), iguais aos de
-- frotak-central/src/modules/notifications/domain/catalog.ts. Mudou um, mude o outro.

begin;

-- ---------------------------------------------------------------- tabelas

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  source text not null,
  trigger_kind text not null,
  watch_fields text[] not null default '{}'::text[],
  conditions jsonb not null default '[]'::jsonb,
  title_template text not null,
  body_template text not null default '',
  link_path text,
  audience_roles text[] not null default '{}'::text[],
  push_default boolean not null default true,
  active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_rules_name_chk check (char_length(btrim(name)) between 3 and 120),
  constraint notification_rules_description_chk check (description is null or char_length(description) <= 300),
  constraint notification_rules_source_chk check (
    source in ('freights', 'vehicles', 'fleet_events', 'driver_compliance_documents')
  ),
  constraint notification_rules_trigger_chk check (
    trigger_kind in ('insert', 'update', 'insert_or_update', 'schedule')
  ),
  -- Evento da operacao so existe na hora em que acontece.
  constraint notification_rules_events_insert_chk check (source <> 'fleet_events' or trigger_kind = 'insert'),
  constraint notification_rules_conditions_chk check (jsonb_typeof(conditions) = 'array'),
  constraint notification_rules_title_chk check (char_length(btrim(title_template)) between 1 and 140),
  constraint notification_rules_body_chk check (char_length(body_template) <= 500),
  constraint notification_rules_link_chk check (link_path is null or link_path ~ '^/[A-Za-z0-9/_.=&%-]*$'),
  constraint notification_rules_roles_chk check (
    audience_roles <@ array['OWNER', 'ADMIN', 'MANAGER', 'DISPATCHER', 'FINANCIAL', 'VIEWER']::text[]
  )
);

create index if not exists notification_rules_source_active_idx
  on public.notification_rules (source) where active;

drop trigger if exists notification_rules_touch_updated_at on public.notification_rules;
create trigger notification_rules_touch_updated_at before update on public.notification_rules
  for each row execute function public.touch_updated_at();

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid references public.notification_rules(id) on delete set null,
  title text not null,
  body text not null default '',
  link_path text,
  source text,
  source_id uuid,
  dedupe_key text,
  push_status text not null default 'pending',
  push_attempts integer not null default 0,
  pushed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_push_status_chk check (push_status in ('pending', 'sent', 'skipped', 'failed'))
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_push_pending_idx
  on public.notifications (created_at) where push_status = 'pending';
create unique index if not exists notifications_dedupe_uidx
  on public.notifications (rule_id, user_id, dedupe_key) where dedupe_key is not null;

create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid not null references public.notification_rules(id) on delete cascade,
  enabled boolean not null default true,
  push boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, rule_id)
);

drop trigger if exists notification_preferences_touch_updated_at on public.notification_preferences;
create trigger notification_preferences_touch_updated_at before update on public.notification_preferences
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- acesso
-- Regras: o usuario so le as ativas que valem para a empresa dele (tela de preferencias).
-- Quem grava e o Master (chave de servico) ou o agente.

alter table public.notification_rules enable row level security;
revoke all on public.notification_rules from anon, authenticated;
grant select on public.notification_rules to authenticated;
drop policy if exists notification_rules_tenant_select on public.notification_rules;
create policy notification_rules_tenant_select on public.notification_rules
for select to authenticated
using (active and (tenant_id is null or tenant_id = public.current_tenant_id()));

-- Avisos: cada um ve, marca como lido e apaga so os proprios. Quem cria e o banco.
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists notifications_own_select on public.notifications;
create policy notifications_own_select on public.notifications
for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_own_delete on public.notifications;
create policy notifications_own_delete on public.notifications
for delete to authenticated using (user_id = auth.uid());

-- Preferencias: cada usuario escolhe as proprias.
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- O sino e o popup chegam pelo Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- ---------------------------------------------------------------- textos

create or replace function private.notification_stage_label(p_code text)
returns text
language sql
immutable
as $$
  select case p_code
    when 'DISPONIVEL' then 'Disponível'
    when 'EM_ROTA_CARREGAR' then 'Em rota indo carregar'
    when 'AGUARDANDO_NOTA' then 'Parado esperando carga'
    when 'NOTA_EM_CONFERENCIA' then 'Nota em conferência'
    when 'NOTA_APROVADA_AG_CTE' then 'Aguardando CT-e/MDF-e'
    when 'CTE_GERADA_AG_CONFIRMACAO_MOTORISTA' then 'Aguardando confirmação do motorista'
    when 'EM_ROTA_ENTREGA' then 'Em rota indo descarregar'
    when 'ENTREGUE_AG_FINALIZACAO' then 'Parado esperando descarga'
    when 'ENTREGA_FINALIZADA' then 'Rota finalizada'
    else p_code
  end
$$;

create or replace function private.notification_vehicle_status_label(p_code text)
returns text
language sql
immutable
as $$
  select case p_code
    when 'disponivel-patio' then 'Disponível no pátio'
    when 'disponivel-oficina' then 'Disponível na oficina'
    when 'aguardando-motorista' then 'Aguardando motorista'
    when 'rota-carregar' then 'Em rota para carregar'
    when 'rota-descarregar' then 'Em rota para descarregar'
    when 'rota-retornando' then 'Retornando'
    when 'parado-aguardando-carga' then 'Parado aguardando carga'
    when 'aguardando-cte' then 'Aguardando CT-e'
    when 'aguardando-confirmacao' then 'Aguardando confirmação'
    when 'parado-aguardando-comando' then 'Parado aguardando comando'
    when 'parado-descarregando' then 'Descarregando'
    when 'parado-quebrado' then 'Parado quebrado'
    when 'manutencao' then 'Em manutenção'
    else p_code
  end
$$;

create or replace function private.notification_money(p_value jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_number numeric;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  v_number := (p_value #>> '{}')::numeric;
  return 'R$ ' || translate(to_char(v_number, 'FM999,999,999,990.00'), ',.', '.,');
exception when others then
  return p_value #>> '{}';
end;
$$;

create or replace function private.notification_when(p_value text)
returns text
language plpgsql
immutable
as $$
begin
  if p_value is null or p_value = '' then
    return null;
  end if;
  if length(p_value) = 10 then
    return to_char(p_value::date, 'DD/MM/YYYY');
  end if;
  return to_char(p_value::timestamptz at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
exception when others then
  return p_value;
end;
$$;

-- Registro de uma fonte do catalogo com os nomes amigaveis: valores crus para as condicoes e,
-- em _labels, o texto que aparece no aviso (etapa por extenso, valor em reais, data no padrao BR).
create or replace function private.notification_record(p_source text, p_row jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_values jsonb := '{}'::jsonb;
  v_labels jsonb := '{}'::jsonb;
  v_expires date;
begin
  if p_row is null then
    return null;
  end if;

  if p_source = 'freights' then
    v_values := jsonb_build_object(
      'etapa', p_row ->> 'freight_stage',
      'situacao', p_row ->> 'lifecycle_status',
      'valor', p_row -> 'freight_value',
      'origem_uf', p_row ->> 'origin_uf',
      'destino_uf', p_row ->> 'destination_uf',
      'iniciado_em', p_row ->> 'started_at',
      'entregue_em', p_row ->> 'delivered_at',
      'placa', (select v.plate from public.vehicles v where v.id = (p_row ->> 'vehicle_id')::uuid),
      'motorista', (select d.name from public.drivers d where d.id = (p_row ->> 'driver_id')::uuid),
      'remetente', (select s.name from public.senders s where s.id = (p_row ->> 'sender_id')::uuid),
      'destinatario', (select r.name from public.recipients r where r.id = (p_row ->> 'recipient_id')::uuid)
    );
    v_labels := jsonb_build_object(
      'etapa', private.notification_stage_label(p_row ->> 'freight_stage'),
      'situacao', case p_row ->> 'lifecycle_status'
        when 'planned' then 'Planejado'
        when 'active' then 'Em andamento'
        when 'completed' then 'Concluído'
        when 'cancelled' then 'Cancelado'
      end,
      'valor', private.notification_money(p_row -> 'freight_value'),
      'iniciado_em', private.notification_when(p_row ->> 'started_at'),
      'entregue_em', private.notification_when(p_row ->> 'delivered_at')
    );
  elsif p_source = 'vehicles' then
    v_values := jsonb_build_object(
      'placa', p_row ->> 'plate',
      'modelo', p_row ->> 'model',
      'etapa', p_row ->> 'freight_stage',
      'status', p_row ->> 'status',
      'motorista', (select d.name from public.drivers d where d.id = (p_row ->> 'driver_id')::uuid)
    );
    v_labels := jsonb_build_object(
      'etapa', private.notification_stage_label(p_row ->> 'freight_stage'),
      'status', private.notification_vehicle_status_label(p_row ->> 'status')
    );
  elsif p_source = 'fleet_events' then
    v_values := jsonb_build_object(
      'placa', (select v.plate from public.vehicles v where v.id = (p_row ->> 'vehicle_id')::uuid),
      'etapa', p_row ->> 'freight_stage',
      'status', p_row ->> 'status',
      'origem', p_row ->> 'source',
      'descricao', p_row ->> 'description',
      'cidade', p_row ->> 'city',
      'uf', p_row ->> 'state'
    );
    v_labels := jsonb_build_object(
      'etapa', private.notification_stage_label(p_row ->> 'freight_stage'),
      'status', private.notification_vehicle_status_label(p_row ->> 'status')
    );
  elsif p_source = 'driver_compliance_documents' then
    v_expires := (p_row ->> 'expires_at')::date;
    v_values := jsonb_build_object(
      'motorista', (select d.name from public.drivers d where d.id = (p_row ->> 'driver_id')::uuid),
      'tipo', p_row ->> 'kind',
      'documento', p_row ->> 'label',
      'numero', p_row ->> 'number',
      'vencimento', p_row ->> 'expires_at',
      'dias_para_vencer', v_expires - current_date,
      'situacao', p_row ->> 'status',
      'bloqueante', p_row -> 'blocking'
    );
    v_labels := jsonb_build_object(
      'tipo', case p_row ->> 'kind'
        when 'cnh' then 'CNH'
        when 'toxicologico' then 'Exame toxicológico'
        when 'aso' then 'ASO'
        when 'direcao_defensiva' then 'Direção defensiva'
        when 'nr11' then 'NR-11'
        when 'mopp' then 'MOPP'
        when 'integracao_cliente' then 'Integração do cliente'
        when 'outro' then 'Outro'
      end,
      'vencimento', private.notification_when(p_row ->> 'expires_at'),
      'situacao', case p_row ->> 'status'
        when 'valido' then 'Válido'
        when 'enviado' then 'Enviado'
        when 'recusado' then 'Recusado'
      end,
      'bloqueante', case p_row ->> 'blocking' when 'true' then 'Sim' when 'false' then 'Não' end
    );
  else
    return null;
  end if;

  return v_values || jsonb_build_object('_labels', jsonb_strip_nulls(v_labels));
end;
$$;

-- {{campo}} vira o texto do campo. [[ ... ]] e um trecho opcional: some inteiro quando algum campo
-- de dentro esta vazio (ex.: "[[Motorista {{motorista}}.]]" nao vira "Motorista .").
create or replace function private.notification_render(p_template text, p_record jsonb)
returns text
language plpgsql
stable
as $$
declare
  v_out text := coalesce(p_template, '');
  v_segment text;
  v_inner text;
  v_key text;
  v_text text;
  v_drop boolean;
begin
  for v_segment in select (regexp_matches(v_out, '\[\[(.*?)\]\]', 'g'))[1] loop
    v_inner := v_segment;
    v_drop := false;
    for v_key in select (regexp_matches(v_segment, '\{\{\s*([a-z_]+)\s*\}\}', 'g'))[1] loop
      v_text := coalesce(p_record -> '_labels' ->> v_key, p_record ->> v_key);
      if v_text is null or btrim(v_text) = '' then
        v_drop := true;
      end if;
    end loop;
    v_out := replace(v_out, '[[' || v_segment || ']]', case when v_drop then '' else v_inner end);
  end loop;

  for v_key in select distinct (regexp_matches(v_out, '\{\{\s*([a-z_]+)\s*\}\}', 'g'))[1] loop
    v_text := coalesce(p_record -> '_labels' ->> v_key, p_record ->> v_key, '');
    v_out := regexp_replace(v_out, '\{\{\s*' || v_key || '\s*\}\}', replace(v_text, '\', '\\'), 'g');
  end loop;

  return btrim(regexp_replace(v_out, '\s+', ' ', 'g'));
end;
$$;

create or replace function private.notification_default_link(p_source text)
returns text
language sql
immutable
as $$
  select case p_source
    when 'freights' then '/operacao'
    when 'vehicles' then '/veiculos'
    when 'fleet_events' then '/operacao'
    when 'driver_compliance_documents' then '/motoristas'
  end
$$;

-- ---------------------------------------------------------------- condicoes

-- Uma condicao: {"field": "etapa", "op": "eq", "value": "EM_ROTA_ENTREGA"}.
create or replace function private.notification_condition_match(p_condition jsonb, p_new jsonb, p_old jsonb)
returns boolean
language plpgsql
stable
as $$
declare
  v_field text := p_condition ->> 'field';
  v_op text := p_condition ->> 'op';
  v_value jsonb := p_condition -> 'value';
  v_expected text := p_condition ->> 'value';
  v_text text;
  v_number numeric;
  v_limit numeric;
  v_date date;
begin
  if v_field is null or v_op is null or p_new is null then
    return false;
  end if;
  v_text := p_new ->> v_field;

  if v_op in ('eq', 'neq') then
    -- Numero compara como numero (1500.50 = 1500.5); o resto, como texto.
    begin
      v_number := v_text::numeric;
      v_limit := v_expected::numeric;
    exception when others then
      v_number := null;
      v_limit := null;
    end;
    if v_number is not null and v_limit is not null then
      return (v_number = v_limit) = (v_op = 'eq');
    end if;
    return (v_text is not distinct from v_expected) = (v_op = 'eq');
  elsif v_op = 'in' then
    return jsonb_typeof(v_value) = 'array'
      and v_text in (select jsonb_array_elements_text(v_value));
  elsif v_op = 'not_in' then
    return jsonb_typeof(v_value) = 'array'
      and (v_text is null or v_text not in (select jsonb_array_elements_text(v_value)));
  elsif v_op = 'contains' then
    return v_text is not null and v_expected is not null
      and position(lower(v_expected) in lower(v_text)) > 0;
  elsif v_op = 'is_empty' then
    return v_text is null or btrim(v_text) = '';
  elsif v_op = 'not_empty' then
    return v_text is not null and btrim(v_text) <> '';
  elsif v_op = 'changed' then
    return p_old is not null and (p_new -> v_field) is distinct from (p_old -> v_field);
  elsif v_op = 'changed_to' then
    return p_old is not null
      and (p_new -> v_field) is distinct from (p_old -> v_field)
      and v_text is not distinct from v_expected;
  elsif v_op in ('gt', 'gte', 'lt', 'lte') then
    begin
      v_number := v_text::numeric;
      v_limit := v_expected::numeric;
    exception when others then
      return false;
    end;
    if v_number is null or v_limit is null then
      return false;
    end if;
    return case v_op
      when 'gt' then v_number > v_limit
      when 'gte' then v_number >= v_limit
      when 'lt' then v_number < v_limit
      else v_number <= v_limit
    end;
  elsif v_op = 'within_days' then
    begin
      v_date := left(v_text, 10)::date;
      v_limit := v_expected::numeric;
    exception when others then
      return false;
    end;
    return v_date is not null and v_limit is not null
      and v_date >= current_date and v_date <= current_date + v_limit::integer;
  elsif v_op = 'overdue' then
    begin
      v_date := left(v_text, 10)::date;
    exception when others then
      return false;
    end;
    return v_date is not null and v_date < current_date;
  end if;
  return false;
end;
$$;

-- Todas as condicoes precisam valer (E). Sem condicao: vale sempre.
create or replace function private.notification_conditions_match(p_conditions jsonb, p_new jsonb, p_old jsonb)
returns boolean
language sql
stable
as $$
  select coalesce(bool_and(private.notification_condition_match(c, p_new, p_old)), true)
  from jsonb_array_elements(coalesce(p_conditions, '[]'::jsonb)) as c
$$;

-- ---------------------------------------------------------------- quem recebe

-- Usuarios ativos da empresa; com papeis escolhidos, so quem tem um deles (dono conta como OWNER).
create or replace function private.notification_recipients(p_tenant uuid, p_roles text[])
returns table (user_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select distinct wm.user_id
  from public.workspace_memberships wm
  join public.workspaces w on w.id = wm.workspace_id
  join auth.users u on u.id = wm.user_id
  where w.tenant_id = p_tenant
    and w.status = 'active'
    and wm.status = 'active'
    and (
      coalesce(cardinality(p_roles), 0) = 0
      or (wm.is_owner and 'OWNER' = any(p_roles))
      or exists (
        select 1
        from public.membership_roles mr
        join public.workspace_roles r on r.id = mr.role_id and r.workspace_id = mr.workspace_id
        where mr.membership_id = wm.id
          and r.active
          and r.code = any(p_roles)
      )
    )
$$;

-- Grava o aviso para cada destinatario que nao desligou esta regra. Devolve quantos gravou.
create or replace function private.notification_emit(
  p_rule public.notification_rules,
  p_tenant uuid,
  p_record jsonb,
  p_source_id uuid,
  p_dedupe_key text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_title text := left(private.notification_render(p_rule.title_template, p_record), 140);
  v_body text := left(private.notification_render(p_rule.body_template, p_record), 500);
  v_count integer;
begin
  if p_tenant is null or coalesce(v_title, '') = '' then
    return 0;
  end if;
  insert into public.notifications (
    tenant_id, user_id, rule_id, title, body, link_path, source, source_id, dedupe_key, push_status
  )
  select
    p_tenant,
    r.user_id,
    p_rule.id,
    v_title,
    coalesce(v_body, ''),
    coalesce(p_rule.link_path, private.notification_default_link(p_rule.source)),
    p_rule.source,
    p_source_id,
    p_dedupe_key,
    case when coalesce(pref.push, p_rule.push_default) then 'pending' else 'skipped' end
  from private.notification_recipients(p_tenant, p_rule.audience_roles) r
  left join public.notification_preferences pref
    on pref.user_id = r.user_id and pref.rule_id = p_rule.id
  where coalesce(pref.enabled, true)
  on conflict (rule_id, user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------- gatilho "ao gravar"

create or replace function private.notification_on_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_record jsonb;
  v_old_record jsonb;
  v_tenant uuid;
  v_rule public.notification_rules;
begin
  -- Caminho rapido: tabela sem regra ativa de gravacao nao paga nada alem desta consulta.
  if not exists (
    select 1 from public.notification_rules r
    where r.active and r.source = tg_table_name and r.trigger_kind <> 'schedule'
  ) then
    return null;
  end if;

  begin
    v_new := to_jsonb(new);
    v_old := case when tg_op = 'UPDATE' then to_jsonb(old) end;
    v_tenant := (v_new ->> 'tenant_id')::uuid;
    if v_tenant is null then
      return null;
    end if;
    -- Regravacao sem mudanca de verdade (so updated_at) nao avisa ninguem.
    if tg_op = 'UPDATE' and (v_new - 'updated_at') = (v_old - 'updated_at') then
      return null;
    end if;

    v_record := private.notification_record(tg_table_name, v_new);
    v_old_record := private.notification_record(tg_table_name, v_old);

    for v_rule in
      select * from public.notification_rules r
      where r.active
        and r.source = tg_table_name
        and (r.tenant_id is null or r.tenant_id = v_tenant)
        and (r.trigger_kind = 'insert_or_update' or r.trigger_kind = lower(tg_op))
      order by r.created_at, r.id
    loop
      if tg_op = 'UPDATE' and cardinality(v_rule.watch_fields) > 0 and not exists (
        select 1 from unnest(v_rule.watch_fields) as f(field)
        where (v_record -> f.field) is distinct from (v_old_record -> f.field)
      ) then
        continue;
      end if;
      if not private.notification_conditions_match(v_rule.conditions, v_record, v_old_record) then
        continue;
      end if;
      perform private.notification_emit(v_rule, v_tenant, v_record, (v_new ->> 'id')::uuid, null);
    end loop;
  exception when others then
    raise warning 'notificacao nao gerada em %.% (%): %', tg_table_schema, tg_table_name, tg_op, sqlerrm;
  end;
  return null;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['freights', 'vehicles', 'fleet_events', 'driver_compliance_documents'] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists notification_rules_on_change on public.%I', v_table);
      execute format(
        'create trigger notification_rules_on_change after insert or update on public.%I '
        'for each row execute function private.notification_on_change()',
        v_table
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------- gatilho "dado no banco"

-- Avalia as regras agendadas e faz a limpeza: avisos com mais de 90 dias saem; aviso do Windows
-- que nao saiu em 1 dia nao sai mais. Devolve quantos avisos novos gravou.
create or replace function public.evaluate_scheduled_notification_rules()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_rule public.notification_rules;
  v_row jsonb;
  v_record jsonb;
  v_key text;
  v_total integer := 0;
begin
  delete from public.notifications where created_at < now() - interval '90 days';
  update public.notifications
  set push_status = 'skipped'
  where push_status = 'pending' and created_at < now() - interval '1 day';

  for v_rule in
    select * from public.notification_rules r
    where r.active and r.trigger_kind = 'schedule'
    order by r.created_at, r.id
  loop
    begin
      for v_row in execute format(
        'select to_jsonb(t) from public.%I t where ($1::uuid is null or t.tenant_id = $1) limit 5000',
        v_rule.source
      ) using v_rule.tenant_id
      loop
        v_record := private.notification_record(v_rule.source, v_row);
        if not private.notification_conditions_match(v_rule.conditions, v_record, null) then
          continue;
        end if;
        -- Uma vez por registro enquanto os campos das condicoes nao mudam (renovou o documento:
        -- avisa de novo quando o novo vencer). Contagem de dias usa a data, que nao muda por dia.
        select (v_row ->> 'id') || ':' || md5(coalesce(string_agg(
          coalesce(v_record ->> case when c.value ->> 'field' = 'dias_para_vencer' then 'vencimento'
                                     else c.value ->> 'field' end, ''),
          '|' order by c.ordinality
        ), ''))
        into v_key
        from jsonb_array_elements(v_rule.conditions) with ordinality as c(value, ordinality);
        v_total := v_total + private.notification_emit(
          v_rule, (v_row ->> 'tenant_id')::uuid, v_record, (v_row ->> 'id')::uuid, v_key
        );
      end loop;
    exception when others then
      raise warning 'regra de notificacao % nao avaliada: %', v_rule.id, sqlerrm;
    end;
  end loop;
  return v_total;
end;
$$;

revoke all on function public.evaluate_scheduled_notification_rules() from public, anon, authenticated;
grant execute on function public.evaluate_scheduled_notification_rules() to service_role;

-- ---------------------------------------------------------------- copia das regras (banco por cliente)

-- O agente chama com as regras que valem para o cliente (todas as gerais + as dele). Substitui o
-- conjunto: o que nao veio sai (e leva as preferencias), o que veio entra ou atualiza pelo id.
create or replace function public.master_sync_notification_rules(p_tenant uuid, p_rules jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if p_tenant is null or jsonb_typeof(p_rules) is distinct from 'array' then
    raise exception 'Regras de notificacao invalidas.' using errcode = '22023';
  end if;

  delete from public.notification_rules r
  where not exists (
    select 1 from jsonb_array_elements(p_rules) as x(rule) where (x.rule ->> 'id')::uuid = r.id
  );

  insert into public.notification_rules (
    id, tenant_id, name, description, source, trigger_kind, watch_fields, conditions,
    title_template, body_template, link_path, audience_roles, push_default, active
  )
  select
    (x.rule ->> 'id')::uuid,
    case when nullif(x.rule ->> 'tenant_id', '') is null then null else p_tenant end,
    x.rule ->> 'name',
    nullif(x.rule ->> 'description', ''),
    x.rule ->> 'source',
    x.rule ->> 'trigger_kind',
    coalesce(array(select jsonb_array_elements_text(coalesce(x.rule -> 'watch_fields', '[]'::jsonb))), '{}'::text[]),
    coalesce(x.rule -> 'conditions', '[]'::jsonb),
    x.rule ->> 'title_template',
    coalesce(x.rule ->> 'body_template', ''),
    nullif(x.rule ->> 'link_path', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(x.rule -> 'audience_roles', '[]'::jsonb))), '{}'::text[]),
    coalesce((x.rule ->> 'push_default')::boolean, true),
    coalesce((x.rule ->> 'active')::boolean, true)
  from jsonb_array_elements(p_rules) as x(rule)
  on conflict (id) do update set
    tenant_id = excluded.tenant_id,
    name = excluded.name,
    description = excluded.description,
    source = excluded.source,
    trigger_kind = excluded.trigger_kind,
    watch_fields = excluded.watch_fields,
    conditions = excluded.conditions,
    title_template = excluded.title_template,
    body_template = excluded.body_template,
    link_path = excluded.link_path,
    audience_roles = excluded.audience_roles,
    push_default = excluded.push_default,
    active = excluded.active;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.master_sync_notification_rules(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- agendador (Supabase hospedado)
-- Na VPS quem chama e o agente; aqui so ha pg_cron no banco do proprio cron.
-- Configurar em integration_cron_settings:
--   notification_dispatch_url = https://<dominio do TMS>/api/notifications/dispatch
--   frotak_push_token         = mesmo valor de FROTAK_PUSH_CRON_TOKEN no deploy (ja usado pela IA)

create or replace function public.invoke_notification_dispatch_cron()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_token text;
  v_request_id bigint;
begin
  if not exists (select 1 from public.notifications where push_status = 'pending') then
    return null;
  end if;
  select value into v_url from public.integration_cron_settings where key = 'notification_dispatch_url';
  select value into v_token from public.integration_cron_settings where key = 'frotak_push_token';
  if v_url is null or v_token is null then
    raise notice 'Envio de notificacoes nao configurado: notification_dispatch_url e frotak_push_token.';
    return null;
  end if;
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-frotak-push-token', v_token),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 55000
  )
  into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.invoke_notification_dispatch_cron() from public, anon, authenticated;

do $$
begin
  if to_regnamespace('cron') is null
    or current_database() <> coalesce(current_setting('cron.database_name', true), 'postgres') then
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'frotak-notificacoes-envio') then
    perform cron.unschedule('frotak-notificacoes-envio');
  end if;
  if exists (select 1 from cron.job where jobname = 'frotak-notificacoes-agendadas') then
    perform cron.unschedule('frotak-notificacoes-agendadas');
  end if;
  perform cron.schedule(
    'frotak-notificacoes-envio',
    '* * * * *',
    $job$select public.invoke_notification_dispatch_cron();$job$
  );
  perform cron.schedule(
    'frotak-notificacoes-agendadas',
    '*/15 * * * *',
    $job$select public.evaluate_scheduled_notification_rules();$job$
  );
end;
$$;

-- ---------------------------------------------------------------- regras iniciais
-- Pedido da historia: avisar a cada atualizacao de frete, em qualquer etapa. Ids fixos para serem
-- os mesmos no Central e em todos os clientes (as preferencias dos usuarios apontam para eles).

insert into public.notification_rules (
  id, tenant_id, name, description, source, trigger_kind, watch_fields, conditions,
  title_template, body_template, link_path, audience_roles, push_default, active
)
values
  (
    '6f1c2a3e-6d1f-4c0a-9b0e-0f5a1d000001',
    null,
    'Frete mudou de etapa',
    'Avisa sempre que um frete muda de etapa, em qualquer etapa.',
    'freights',
    'update',
    array['etapa'],
    '[]'::jsonb,
    'Frete {{placa}}: {{etapa}}',
    '[[{{remetente}} → {{destinatario}}. ]][[Motorista {{motorista}}.]]',
    '/operacao',
    '{}'::text[],
    true,
    true
  ),
  (
    '6f1c2a3e-6d1f-4c0a-9b0e-0f5a1d000002',
    null,
    'Novo frete',
    'Avisa quando um frete novo entra na operação.',
    'freights',
    'insert',
    '{}'::text[],
    '[]'::jsonb,
    'Novo frete[[ {{placa}}]]',
    '[[{{remetente}} → {{destinatario}}. ]][[Motorista {{motorista}}.]]',
    '/operacao',
    '{}'::text[],
    true,
    true
  )
on conflict (id) do nothing;

commit;
