-- Frotak Financeiro - Fase 1: fundacao de dominio e dados.
-- Esta migration nao altera a fonte operacional usada pelo Smart Flow e nao
-- gera receitas, contas a receber ou despesas a partir dos dados legados.

-- ---------------------------------------------------------------------------
-- Helpers de tenancy e autorizacao financeira
-- ---------------------------------------------------------------------------

create or replace function private.default_workspace_for_tenant(p_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select w.id
  from public.workspaces w
  where w.tenant_id = p_tenant_id
  order by w.is_default desc, (w.status = 'active') desc, w.created_at
  limit 1;
$$;

create or replace function private.can_read_financial_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_workspace_owner(p_workspace_id)
      or private.has_permission(p_workspace_id, 'financial.transactions.read')
      or private.has_permission(p_workspace_id, 'financial.dashboard.read');
$$;

create or replace function private.can_manage_financial_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_workspace_owner(p_workspace_id)
      or private.has_permission(p_workspace_id, 'financial.transactions.manage');
$$;

create or replace function private.can_configure_financial_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_workspace_owner(p_workspace_id)
      or private.has_permission(p_workspace_id, 'financial.settings.manage');
$$;

create or replace function private.can_read_financial_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.tenant_id = p_tenant_id
      and private.can_read_financial_workspace(w.id)
  );
$$;

create or replace function private.can_configure_financial_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.tenant_id = p_tenant_id
      and private.can_configure_financial_workspace(w.id)
  );
$$;

revoke all on function private.default_workspace_for_tenant(uuid) from public, anon, authenticated;
revoke all on function private.can_read_financial_workspace(uuid) from public, anon, authenticated;
revoke all on function private.can_manage_financial_workspace(uuid) from public, anon, authenticated;
revoke all on function private.can_configure_financial_workspace(uuid) from public, anon, authenticated;
revoke all on function private.can_read_financial_tenant(uuid) from public, anon, authenticated;
revoke all on function private.can_configure_financial_tenant(uuid) from public, anon, authenticated;

grant execute on function private.can_read_financial_workspace(uuid) to authenticated;
grant execute on function private.can_manage_financial_workspace(uuid) to authenticated;
grant execute on function private.can_configure_financial_workspace(uuid) to authenticated;
grant execute on function private.can_read_financial_tenant(uuid) to authenticated;
grant execute on function private.can_configure_financial_tenant(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Frete canonico. A operacao continua escrevendo em vehicles/freight_history.
-- Triggers passivos abaixo apenas espelham o estado sem mudar o Smart Flow.
-- ---------------------------------------------------------------------------

create table public.freights (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid references public.workspaces(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  primary_trailer_id uuid references public.trailers(id) on delete set null,
  trailer_ids uuid[] not null default '{}'::uuid[],
  sender_id uuid references public.senders(id) on delete set null,
  recipient_id uuid references public.recipients(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  freight_value numeric(18,2),
  currency char(3) not null default 'BRL',
  lifecycle_status text not null default 'active',
  operational_status text,
  freight_stage text,
  source_kind text not null default 'active_vehicle',
  legacy_history_id uuid references public.freight_history(id) on delete set null,
  started_at timestamptz,
  accepted_at timestamptz,
  loaded_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb,
  requires_review boolean not null default false,
  review_reasons text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint freights_currency_chk check (currency ~ '^[A-Z]{3}$'),
  constraint freights_value_chk check (freight_value is null or freight_value >= 0),
  constraint freights_lifecycle_status_chk check (
    lifecycle_status in ('planned', 'active', 'completed', 'cancelled')
  ),
  constraint freights_source_kind_chk check (
    source_kind in ('active_vehicle', 'freight_history', 'native')
  )
);

create unique index freights_tenant_id_id_uidx on public.freights(tenant_id, id);
create unique index freights_legacy_history_id_uidx
  on public.freights(legacy_history_id) where legacy_history_id is not null;
create index freights_workspace_status_idx on public.freights(workspace_id, lifecycle_status);
create index freights_tenant_completed_at_idx on public.freights(tenant_id, completed_at desc);
create index freights_vehicle_id_idx on public.freights(vehicle_id);
create index freights_sender_id_idx on public.freights(sender_id);
create index freights_recipient_id_idx on public.freights(recipient_id);
create index freights_requires_review_idx on public.freights(tenant_id, requires_review)
  where requires_review = true;

create trigger freights_set_updated_at
before update on public.freights
for each row execute function public.set_updated_at();

-- Historico primeiro: ele tem precedencia quando um UUID ja foi finalizado.
insert into public.freights (
  id, tenant_id, workspace_id, vehicle_id, driver_id, primary_trailer_id,
  trailer_ids, sender_id, recipient_id, product_id, freight_value,
  lifecycle_status, operational_status, freight_stage, source_kind,
  legacy_history_id, started_at, completed_at, snapshot,
  requires_review, review_reasons
)
select
  fh.freight_id,
  fh.tenant_id,
  private.default_workspace_for_tenant(fh.tenant_id),
  fh.vehicle_id,
  fh.driver_id,
  fh.trailer_id,
  case when fh.trailer_id is null then '{}'::uuid[] else array[fh.trailer_id] end,
  fh.sender_id,
  fh.recipient_id,
  fh.product_id,
  fh.freight_value,
  'completed',
  fh.final_status,
  fh.final_freight_stage,
  'freight_history',
  fh.id,
  fh.started_at,
  fh.finished_at,
  jsonb_strip_nulls(jsonb_build_object(
    'vehicle_plate', fh.vehicle_plate,
    'driver_name', fh.driver_name,
    'trailer_identifier', fh.trailer_identifier,
    'sender_name', fh.sender_name,
    'sender_city', fh.sender_city,
    'sender_state', fh.sender_state,
    'recipient_name', fh.recipient_name,
    'recipient_city', fh.recipient_city,
    'recipient_state', fh.recipient_state,
    'product_name', fh.product_name,
    'finish_reason', fh.finish_reason
  )),
  fh.freight_value is null
    or fh.started_at is null
    or (fh.driver_id is null and fh.driver_name is null)
    or (fh.sender_id is null and fh.sender_name is null)
    or (fh.recipient_id is null and fh.recipient_name is null)
    or (fh.product_id is null and fh.product_name is null)
    or private.default_workspace_for_tenant(fh.tenant_id) is null,
  array_remove(array[
    case when fh.freight_value is null then 'missing_freight_value' end,
    case when fh.started_at is null then 'missing_started_at' end,
    case when fh.driver_id is null and fh.driver_name is null then 'missing_driver' end,
    case when fh.sender_id is null and fh.sender_name is null then 'missing_sender' end,
    case when fh.recipient_id is null and fh.recipient_name is null then 'missing_recipient' end,
    case when fh.product_id is null and fh.product_name is null then 'missing_product' end,
    case when private.default_workspace_for_tenant(fh.tenant_id) is null then 'missing_workspace' end
  ], null)::text[]
from public.freight_history fh
where fh.freight_id is not null
on conflict (id) do nothing;

insert into public.freights (
  id, tenant_id, workspace_id, vehicle_id, driver_id, primary_trailer_id,
  trailer_ids, sender_id, recipient_id, product_id, freight_value,
  lifecycle_status, operational_status, freight_stage, source_kind,
  started_at, accepted_at, loaded_at, delivered_at, snapshot,
  requires_review, review_reasons
)
select
  v.current_freight_id,
  v.tenant_id,
  private.default_workspace_for_tenant(v.tenant_id),
  v.id,
  v.driver_id,
  v.trailer_id,
  coalesce((
    select array_agg(vt.trailer_id order by vt.position)
    from public.vehicle_trailers vt
    where vt.vehicle_id = v.id and vt.active = true
  ), case when v.trailer_id is null then '{}'::uuid[] else array[v.trailer_id] end),
  v.sender_id,
  v.recipient_id,
  v.product_id,
  v.freight_value,
  'active',
  v.status,
  v.freight_stage,
  'active_vehicle',
  (select min(fe.timestamp) from public.fleet_events fe where fe.freight_id = v.current_freight_id),
  (select min(fe.timestamp) from public.fleet_events fe
    where fe.freight_id = v.current_freight_id
      and (fe.event_type = 'driver_freight_accepted' or fe.freight_stage = 'EM_ROTA_CARREGAR')),
  (select min(fe.timestamp) from public.fleet_events fe
    where fe.freight_id = v.current_freight_id
      and fe.freight_stage in ('NOTA_EM_CONFERENCIA', 'NOTA_APROVADA_AG_CTE')),
  (select min(fe.timestamp) from public.fleet_events fe
    where fe.freight_id = v.current_freight_id
      and fe.freight_stage in ('ENTREGUE_AG_FINALIZACAO', 'ENTREGA_FINALIZADA')),
  jsonb_strip_nulls(jsonb_build_object(
    'vehicle_plate', v.plate,
    'driver_name', (select d.name from public.drivers d where d.id = v.driver_id),
    'sender_name', (select s.name from public.senders s where s.id = v.sender_id),
    'recipient_name', (select r.name from public.recipients r where r.id = v.recipient_id),
    'product_name', (select p.name from public.products p where p.id = v.product_id)
  )),
  v.freight_value is null or v.sender_id is null or v.recipient_id is null
    or v.product_id is null or v.driver_id is null
    or private.default_workspace_for_tenant(v.tenant_id) is null,
  array_remove(array[
    case when v.freight_value is null then 'missing_freight_value' end,
    case when v.driver_id is null then 'missing_driver' end,
    case when v.sender_id is null then 'missing_sender' end,
    case when v.recipient_id is null then 'missing_recipient' end,
    case when v.product_id is null then 'missing_product' end,
    case when private.default_workspace_for_tenant(v.tenant_id) is null then 'missing_workspace' end
  ], null)::text[]
from public.vehicles v
where v.current_freight_id is not null
on conflict (id) do nothing;

create or replace function private.sync_freight_from_vehicle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
  v_started_at timestamptz;
  v_review_reasons text[];
begin
  if new.current_freight_id is null then
    return new;
  end if;

  v_workspace_id := private.default_workspace_for_tenant(new.tenant_id);
  select min(fe.timestamp) into v_started_at
  from public.fleet_events fe where fe.freight_id = new.current_freight_id;
  v_review_reasons := array_remove(array[
    case when new.freight_value is null then 'missing_freight_value' end,
    case when new.driver_id is null then 'missing_driver' end,
    case when new.sender_id is null then 'missing_sender' end,
    case when new.recipient_id is null then 'missing_recipient' end,
    case when new.product_id is null then 'missing_product' end,
    case when v_workspace_id is null then 'missing_workspace' end
  ], null)::text[];

  insert into public.freights (
    id, tenant_id, workspace_id, vehicle_id, driver_id, primary_trailer_id,
    trailer_ids, sender_id, recipient_id, product_id, freight_value,
    lifecycle_status, operational_status, freight_stage, source_kind,
    started_at, accepted_at, loaded_at, delivered_at, completed_at,
    snapshot, requires_review, review_reasons
  ) values (
    new.current_freight_id, new.tenant_id, v_workspace_id, new.id, new.driver_id,
    new.trailer_id,
    coalesce((select array_agg(vt.trailer_id order by vt.position)
      from public.vehicle_trailers vt where vt.vehicle_id = new.id and vt.active = true),
      case when new.trailer_id is null then '{}'::uuid[] else array[new.trailer_id] end),
    new.sender_id, new.recipient_id, new.product_id, new.freight_value,
    'active', new.status, new.freight_stage, 'active_vehicle', v_started_at,
    case when new.freight_stage = 'EM_ROTA_CARREGAR' then now() end,
    case when new.freight_stage in ('NOTA_EM_CONFERENCIA', 'NOTA_APROVADA_AG_CTE') then now() end,
    case when new.freight_stage = 'ENTREGUE_AG_FINALIZACAO' then now() end,
    case when new.freight_stage = 'ENTREGA_FINALIZADA' then now() end,
    jsonb_strip_nulls(jsonb_build_object(
      'vehicle_plate', new.plate,
      'driver_name', (select d.name from public.drivers d where d.id = new.driver_id),
      'sender_name', (select s.name from public.senders s where s.id = new.sender_id),
      'recipient_name', (select r.name from public.recipients r where r.id = new.recipient_id),
      'product_name', (select p.name from public.products p where p.id = new.product_id)
    )),
    cardinality(v_review_reasons) > 0,
    v_review_reasons
  )
  on conflict (id) do update set
    workspace_id = excluded.workspace_id,
    vehicle_id = excluded.vehicle_id,
    driver_id = excluded.driver_id,
    primary_trailer_id = excluded.primary_trailer_id,
    trailer_ids = excluded.trailer_ids,
    sender_id = excluded.sender_id,
    recipient_id = excluded.recipient_id,
    product_id = excluded.product_id,
    freight_value = excluded.freight_value,
    operational_status = excluded.operational_status,
    freight_stage = excluded.freight_stage,
    started_at = coalesce(public.freights.started_at, excluded.started_at),
    accepted_at = coalesce(public.freights.accepted_at, excluded.accepted_at),
    loaded_at = coalesce(public.freights.loaded_at, excluded.loaded_at),
    delivered_at = coalesce(public.freights.delivered_at, excluded.delivered_at),
    completed_at = coalesce(public.freights.completed_at, excluded.completed_at),
    snapshot = public.freights.snapshot || excluded.snapshot,
    requires_review = excluded.requires_review,
    review_reasons = excluded.review_reasons
  where public.freights.lifecycle_status <> 'completed';

  return new;
end;
$$;

create trigger vehicles_sync_canonical_freight
after insert or update of current_freight_id, driver_id, trailer_id, sender_id,
  recipient_id, product_id, freight_value, status, freight_stage
on public.vehicles
for each row execute function private.sync_freight_from_vehicle();

create or replace function private.sync_freight_from_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
  v_review_reasons text[];
begin
  if new.freight_id is null then
    return new;
  end if;

  v_workspace_id := private.default_workspace_for_tenant(new.tenant_id);
  v_review_reasons := array_remove(array[
    case when new.freight_value is null then 'missing_freight_value' end,
    case when new.started_at is null then 'missing_started_at' end,
    case when new.driver_id is null and new.driver_name is null then 'missing_driver' end,
    case when new.sender_id is null and new.sender_name is null then 'missing_sender' end,
    case when new.recipient_id is null and new.recipient_name is null then 'missing_recipient' end,
    case when new.product_id is null and new.product_name is null then 'missing_product' end,
    case when v_workspace_id is null then 'missing_workspace' end
  ], null)::text[];

  insert into public.freights (
    id, tenant_id, workspace_id, vehicle_id, driver_id, primary_trailer_id,
    trailer_ids, sender_id, recipient_id, product_id, freight_value,
    lifecycle_status, operational_status, freight_stage, source_kind,
    legacy_history_id, started_at, completed_at, snapshot,
    requires_review, review_reasons
  ) values (
    new.freight_id, new.tenant_id, v_workspace_id, new.vehicle_id, new.driver_id,
    new.trailer_id,
    case when new.trailer_id is null then '{}'::uuid[] else array[new.trailer_id] end,
    new.sender_id, new.recipient_id, new.product_id, new.freight_value,
    'completed', new.final_status, new.final_freight_stage, 'freight_history',
    new.id, new.started_at, new.finished_at,
    jsonb_strip_nulls(jsonb_build_object(
      'vehicle_plate', new.vehicle_plate,
      'driver_name', new.driver_name,
      'trailer_identifier', new.trailer_identifier,
      'sender_name', new.sender_name,
      'sender_city', new.sender_city,
      'sender_state', new.sender_state,
      'recipient_name', new.recipient_name,
      'recipient_city', new.recipient_city,
      'recipient_state', new.recipient_state,
      'product_name', new.product_name,
      'finish_reason', new.finish_reason
    )),
    cardinality(v_review_reasons) > 0,
    v_review_reasons
  )
  on conflict (id) do update set
    workspace_id = excluded.workspace_id,
    vehicle_id = excluded.vehicle_id,
    driver_id = excluded.driver_id,
    primary_trailer_id = excluded.primary_trailer_id,
    trailer_ids = excluded.trailer_ids,
    sender_id = excluded.sender_id,
    recipient_id = excluded.recipient_id,
    product_id = excluded.product_id,
    freight_value = excluded.freight_value,
    lifecycle_status = 'completed',
    operational_status = excluded.operational_status,
    freight_stage = excluded.freight_stage,
    source_kind = 'freight_history',
    legacy_history_id = excluded.legacy_history_id,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    snapshot = public.freights.snapshot || excluded.snapshot,
    requires_review = excluded.requires_review,
    review_reasons = excluded.review_reasons;

  return new;
end;
$$;

create trigger freight_history_sync_canonical_freight
after insert or update on public.freight_history
for each row execute function private.sync_freight_from_history();

-- ---------------------------------------------------------------------------
-- Parceiros unificados. Senders e recipients permanecem intocados.
-- ---------------------------------------------------------------------------

create table public.business_partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  legal_name text,
  trade_name text not null,
  tax_id text,
  tax_id_type text,
  active boolean not null default true,
  requires_review boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_partners_trade_name_chk check (btrim(trade_name) <> ''),
  constraint business_partners_tax_id_chk check (tax_id is null or tax_id ~ '^[0-9]{11}([0-9]{3})?$'),
  constraint business_partners_tax_id_type_chk check (
    tax_id_type is null or tax_id_type in ('cpf', 'cnpj', 'other')
  )
);

create unique index business_partners_tenant_tax_id_uidx
  on public.business_partners(tenant_id, tax_id) where tax_id is not null;
create unique index business_partners_tenant_id_id_uidx
  on public.business_partners(tenant_id, id);
create index business_partners_tenant_name_idx
  on public.business_partners(tenant_id, lower(trade_name));

create trigger business_partners_set_updated_at
before update on public.business_partners
for each row execute function public.set_updated_at();

create table public.business_partner_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  partner_id uuid not null references public.business_partners(id) on delete cascade,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint business_partner_roles_role_chk check (
    role in ('customer', 'supplier', 'sender', 'recipient')
  ),
  constraint business_partner_roles_partner_role_uidx unique(partner_id, role)
);

create index business_partner_roles_tenant_role_idx
  on public.business_partner_roles(tenant_id, role);

create table public.legacy_partner_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  partner_id uuid not null references public.business_partners(id) on delete cascade,
  legacy_table text not null,
  legacy_id uuid not null,
  created_at timestamptz not null default now(),
  constraint legacy_partner_links_table_chk check (legacy_table in ('senders', 'recipients')),
  constraint legacy_partner_links_source_uidx unique(tenant_id, legacy_table, legacy_id)
);

create index legacy_partner_links_partner_id_idx on public.legacy_partner_links(partner_id);

create or replace function private.sync_legacy_partner_row(
  p_tenant_id uuid,
  p_legacy_table text,
  p_legacy_id uuid,
  p_name text,
  p_cnpj text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tax_digits text;
  v_tax_id text;
  v_partner_id uuid;
  v_role text;
begin
  if p_legacy_table not in ('senders', 'recipients') then
    raise exception 'unsupported legacy partner table: %', p_legacy_table;
  end if;

  v_tax_digits := nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), '');
  v_tax_id := case when length(v_tax_digits) in (11, 14) then v_tax_digits end;
  v_role := case when p_legacy_table = 'senders' then 'sender' else 'recipient' end;

  select l.partner_id into v_partner_id
  from public.legacy_partner_links l
  where l.tenant_id = p_tenant_id
    and l.legacy_table = p_legacy_table
    and l.legacy_id = p_legacy_id;

  if v_partner_id is null and v_tax_id is not null then
    select bp.id into v_partner_id
    from public.business_partners bp
    where bp.tenant_id = p_tenant_id and bp.tax_id = v_tax_id;
  end if;

  if v_partner_id is null then
    insert into public.business_partners (
      tenant_id, trade_name, tax_id, tax_id_type, active, requires_review, metadata
    ) values (
      p_tenant_id,
      p_name,
      v_tax_id,
      case length(v_tax_id) when 11 then 'cpf' when 14 then 'cnpj' else null end,
      p_active,
      v_tax_digits is not null and v_tax_id is null,
      case when v_tax_digits is not null and v_tax_id is null
        then jsonb_build_object('invalid_legacy_tax_id', p_cnpj)
        else '{}'::jsonb end
    ) returning id into v_partner_id;
  else
    update public.business_partners
    set active = active or p_active,
        trade_name = case when btrim(trade_name) = '' then p_name else trade_name end
    where id = v_partner_id;
  end if;

  insert into public.business_partner_roles (tenant_id, partner_id, role, active)
  values (p_tenant_id, v_partner_id, v_role, p_active)
  on conflict (partner_id, role) do update set active = excluded.active;

  insert into public.legacy_partner_links (tenant_id, partner_id, legacy_table, legacy_id)
  values (p_tenant_id, v_partner_id, p_legacy_table, p_legacy_id)
  on conflict (tenant_id, legacy_table, legacy_id)
  do update set partner_id = excluded.partner_id;

  return v_partner_id;
end;
$$;

create or replace function private.sync_legacy_partner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.sync_legacy_partner_row(
    new.tenant_id, tg_table_name, new.id, new.name, new.cnpj, new.active
  );
  return new;
end;
$$;

create trigger senders_sync_business_partner
after insert or update of name, cnpj, active on public.senders
for each row execute function private.sync_legacy_partner();

create trigger recipients_sync_business_partner
after insert or update of name, cnpj, active on public.recipients
for each row execute function private.sync_legacy_partner();

do $$
declare
  v_sender public.senders;
  v_recipient public.recipients;
begin
  for v_sender in select * from public.senders loop
    perform private.sync_legacy_partner_row(
      v_sender.tenant_id, 'senders', v_sender.id, v_sender.name, v_sender.cnpj, v_sender.active
    );
  end loop;
  for v_recipient in select * from public.recipients loop
    perform private.sync_legacy_partner_row(
      v_recipient.tenant_id, 'recipients', v_recipient.id, v_recipient.name,
      v_recipient.cnpj, v_recipient.active
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Plano de contas e centros de custo
-- ---------------------------------------------------------------------------

create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  parent_id uuid references public.chart_of_accounts(id) on delete restrict,
  code text not null,
  name text not null,
  account_type text not null,
  normal_balance text not null,
  dre_group text,
  is_postable boolean not null default true,
  is_system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chart_of_accounts_code_chk check (btrim(code) <> ''),
  constraint chart_of_accounts_name_chk check (btrim(name) <> ''),
  constraint chart_of_accounts_type_chk check (
    account_type in ('asset', 'liability', 'equity', 'revenue', 'expense', 'contra_revenue')
  ),
  constraint chart_of_accounts_balance_chk check (normal_balance in ('debit', 'credit')),
  constraint chart_of_accounts_dre_group_chk check (
    dre_group is null or dre_group in (
      'gross_revenue', 'revenue_deduction', 'variable_cost', 'operating_expense',
      'depreciation_amortization', 'financial_result', 'income_tax', 'other_result'
    )
  ),
  constraint chart_of_accounts_tenant_code_uidx unique(tenant_id, code)
);

create unique index chart_of_accounts_tenant_id_id_uidx
  on public.chart_of_accounts(tenant_id, id);
create index chart_of_accounts_parent_id_idx on public.chart_of_accounts(parent_id);
create index chart_of_accounts_tenant_dre_idx on public.chart_of_accounts(tenant_id, dre_group);

create trigger chart_of_accounts_set_updated_at
before update on public.chart_of_accounts
for each row execute function public.set_updated_at();

insert into public.chart_of_accounts (
  tenant_id, code, name, account_type, normal_balance, dre_group, is_postable, is_system
)
select t.id, seed.code, seed.name, seed.account_type, seed.normal_balance,
       seed.dre_group, seed.is_postable, true
from public.tenants t
cross join (values
  ('3', 'Receitas', 'revenue', 'credit', null, false),
  ('4', 'Custos variaveis', 'expense', 'debit', null, false),
  ('5', 'Despesas operacionais', 'expense', 'debit', null, false),
  ('6', 'Depreciacao e amortizacao', 'expense', 'debit', null, false),
  ('7', 'Resultado financeiro', 'expense', 'debit', null, false),
  ('8', 'Impostos sobre resultado', 'expense', 'debit', null, false)
) as seed(code, name, account_type, normal_balance, dre_group, is_postable)
on conflict (tenant_id, code) do nothing;

insert into public.chart_of_accounts (
  tenant_id, parent_id, code, name, account_type, normal_balance,
  dre_group, is_postable, is_system
)
select t.id, parent.id, seed.code, seed.name, seed.account_type, seed.normal_balance,
       seed.dre_group, true, true
from public.tenants t
join (values
  ('3.01', '3', 'Receitas operacionais de fretes', 'revenue', 'credit', 'gross_revenue'),
  ('3.02', '3', 'Outras receitas', 'revenue', 'credit', 'other_result'),
  ('3.09', '3', 'Impostos e deducoes sobre receita', 'contra_revenue', 'debit', 'revenue_deduction'),
  ('4.01', '4', 'Combustivel', 'expense', 'debit', 'variable_cost'),
  ('4.02', '4', 'ARLA', 'expense', 'debit', 'variable_cost'),
  ('4.03', '4', 'Pedagio', 'expense', 'debit', 'variable_cost'),
  ('4.04', '4', 'Comissoes operacionais', 'expense', 'debit', 'variable_cost'),
  ('5.01', '5', 'Manutencao', 'expense', 'debit', 'operating_expense'),
  ('5.02', '5', 'Pneus', 'expense', 'debit', 'operating_expense'),
  ('5.03', '5', 'Salarios operacionais', 'expense', 'debit', 'operating_expense'),
  ('5.04', '5', 'Seguros', 'expense', 'debit', 'operating_expense'),
  ('5.05', '5', 'Despesas administrativas', 'expense', 'debit', 'operating_expense'),
  ('5.06', '5', 'Despesas comerciais', 'expense', 'debit', 'operating_expense'),
  ('6.01', '6', 'Depreciacao', 'expense', 'debit', 'depreciation_amortization'),
  ('7.01', '7', 'Despesas financeiras', 'expense', 'debit', 'financial_result'),
  ('7.02', '7', 'Financiamentos', 'expense', 'debit', 'financial_result'),
  ('8.01', '8', 'Impostos sobre resultado', 'expense', 'debit', 'income_tax'),
  ('8.99', '8', 'Outras receitas e despesas', 'expense', 'debit', 'other_result')
) as seed(code, parent_code, name, account_type, normal_balance, dre_group) on true
join public.chart_of_accounts parent
  on parent.tenant_id = t.id and parent.code = seed.parent_code
on conflict (tenant_id, code) do nothing;

create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid references public.workspaces(id) on delete restrict,
  parent_id uuid references public.cost_centers(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_centers_code_chk check (btrim(code) <> ''),
  constraint cost_centers_name_chk check (btrim(name) <> ''),
  constraint cost_centers_tenant_code_uidx unique(tenant_id, code)
);

create unique index cost_centers_tenant_id_id_uidx on public.cost_centers(tenant_id, id);
create index cost_centers_parent_id_idx on public.cost_centers(parent_id);
create index cost_centers_workspace_id_idx on public.cost_centers(workspace_id);

create trigger cost_centers_set_updated_at
before update on public.cost_centers
for each row execute function public.set_updated_at();

insert into public.cost_centers (tenant_id, workspace_id, code, name, is_system)
select t.id, private.default_workspace_for_tenant(t.id), 'EMPRESA', 'Empresa', true
from public.tenants t
on conflict (tenant_id, code) do nothing;

insert into public.cost_centers (tenant_id, workspace_id, parent_id, code, name, is_system)
select t.id, private.default_workspace_for_tenant(t.id), root.id, seed.code, seed.name, true
from public.tenants t
join public.cost_centers root on root.tenant_id = t.id and root.code = 'EMPRESA'
cross join (values
  ('OPERACAO', 'Operacao'),
  ('ADMINISTRATIVO', 'Administrativo'),
  ('OFICINA', 'Oficina')
) as seed(code, name)
on conflict (tenant_id, code) do nothing;

insert into public.cost_centers (tenant_id, workspace_id, parent_id, code, name, is_system)
select w.tenant_id, w.id, root.id, 'UNIDADE-' || upper(w.slug), w.name, true
from public.workspaces w
join public.cost_centers root on root.tenant_id = w.tenant_id and root.code = 'EMPRESA'
on conflict (tenant_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Documento financeiro, parcelas e alocacoes
-- ---------------------------------------------------------------------------

create table public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  direction text not null,
  partner_id uuid references public.business_partners(id) on delete restrict,
  document_type text not null,
  source_type text,
  source_id uuid,
  source_event text,
  description text not null,
  original_amount numeric(18,2) not null,
  competence_date date,
  issue_date date,
  currency char(3) not null default 'BRL',
  status text not null default 'draft',
  chart_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  posted_by uuid references auth.users(id) on delete set null,
  voided_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_documents_direction_chk check (direction in ('receivable', 'payable')),
  constraint financial_documents_amount_chk check (original_amount > 0),
  constraint financial_documents_currency_chk check (currency ~ '^[A-Z]{3}$'),
  constraint financial_documents_status_chk check (
    status in ('draft', 'posted', 'partially_settled', 'settled', 'voided')
  ),
  constraint financial_documents_source_complete_chk check (
    (source_type is null and source_id is null and source_event is null)
    or (source_type is not null and source_id is not null and source_event is not null)
  )
);

create unique index financial_documents_source_idempotency_uidx
  on public.financial_documents(tenant_id, source_type, source_id, source_event)
  where source_type is not null and source_id is not null and source_event is not null;
create unique index financial_documents_tenant_workspace_id_uidx
  on public.financial_documents(tenant_id, workspace_id, id);
create index financial_documents_workspace_status_idx
  on public.financial_documents(workspace_id, status);
create index financial_documents_competence_idx
  on public.financial_documents(tenant_id, competence_date);
create index financial_documents_partner_id_idx on public.financial_documents(partner_id);

create or replace function private.prepare_financial_document_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if old.status = 'draft' and new.status = 'posted' then
    new.posted_at := coalesce(new.posted_at, now());
    new.posted_by := coalesce(new.posted_by, auth.uid());
  end if;
  if old.status <> 'voided' and new.status = 'voided' then
    new.voided_at := coalesce(new.voided_at, now());
    new.voided_by := coalesce(new.voided_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger financial_documents_prepare_audit
before update on public.financial_documents
for each row execute function private.prepare_financial_document_audit();

create or replace function private.protect_posted_financial_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.status <> 'draft' then
    raise exception 'posted financial documents cannot be physically deleted';
  end if;
  return old;
end;
$$;

create trigger financial_documents_prevent_posted_delete
before delete on public.financial_documents
for each row execute function private.protect_posted_financial_document();

create table public.financial_installments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  document_id uuid not null references public.financial_documents(id) on delete cascade,
  installment_number integer not null,
  amount numeric(18,2) not null,
  due_date date not null,
  status text not null default 'open',
  settled_amount numeric(18,2) not null default 0,
  balance numeric(18,2) generated always as (amount - settled_amount) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_installments_number_chk check (installment_number > 0),
  constraint financial_installments_amount_chk check (amount > 0),
  constraint financial_installments_settled_chk check (
    settled_amount >= 0 and settled_amount <= amount
  ),
  constraint financial_installments_status_chk check (
    status in ('open', 'partially_settled', 'settled', 'voided')
  ),
  constraint financial_installments_document_number_uidx unique(document_id, installment_number)
);

create index financial_installments_due_status_idx
  on public.financial_installments(workspace_id, due_date, status);
create index financial_installments_document_id_idx
  on public.financial_installments(document_id);

create trigger financial_installments_set_updated_at
before update on public.financial_installments
for each row execute function public.set_updated_at();

create table public.financial_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  document_id uuid not null references public.financial_documents(id) on delete cascade,
  freight_id uuid references public.freights(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  business_partner_id uuid references public.business_partners(id) on delete restrict,
  cost_center_id uuid references public.cost_centers(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  chart_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  amount numeric(18,2) not null,
  percentage numeric(7,4),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_allocations_amount_chk check (amount > 0),
  constraint financial_allocations_percentage_chk check (
    percentage is null or (percentage > 0 and percentage <= 100)
  ),
  constraint financial_allocations_dimension_chk check (
    freight_id is not null or vehicle_id is not null or business_partner_id is not null
    or cost_center_id is not null or product_id is not null
  )
);

create index financial_allocations_document_id_idx on public.financial_allocations(document_id);
create index financial_allocations_freight_id_idx on public.financial_allocations(freight_id);
create index financial_allocations_vehicle_id_idx on public.financial_allocations(vehicle_id);
create index financial_allocations_partner_id_idx on public.financial_allocations(business_partner_id);
create index financial_allocations_cost_center_id_idx on public.financial_allocations(cost_center_id);

create trigger financial_allocations_set_updated_at
before update on public.financial_allocations
for each row execute function public.set_updated_at();

create or replace function private.validate_financial_installment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_document public.financial_documents;
begin
  select * into v_document from public.financial_documents where id = new.document_id;
  if not found or v_document.tenant_id <> new.tenant_id
    or v_document.workspace_id <> new.workspace_id then
    raise exception 'financial installment must belong to the same tenant/workspace as its document';
  end if;
  return new;
end;
$$;

create or replace function private.validate_financial_allocation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_document public.financial_documents;
  v_allocated numeric(18,2);
begin
  select * into v_document from public.financial_documents where id = new.document_id;
  if not found or v_document.tenant_id <> new.tenant_id
    or v_document.workspace_id <> new.workspace_id then
    raise exception 'financial allocation must belong to the same tenant/workspace as its document';
  end if;

  if new.freight_id is not null and not exists (
    select 1 from public.freights f where f.id = new.freight_id and f.tenant_id = new.tenant_id
  ) then raise exception 'allocation freight belongs to another tenant'; end if;
  if new.vehicle_id is not null and not exists (
    select 1 from public.vehicles v where v.id = new.vehicle_id and v.tenant_id = new.tenant_id
  ) then raise exception 'allocation vehicle belongs to another tenant'; end if;
  if new.business_partner_id is not null and not exists (
    select 1 from public.business_partners bp
    where bp.id = new.business_partner_id and bp.tenant_id = new.tenant_id
  ) then raise exception 'allocation partner belongs to another tenant'; end if;
  if new.cost_center_id is not null and not exists (
    select 1 from public.cost_centers cc
    where cc.id = new.cost_center_id and cc.tenant_id = new.tenant_id
  ) then raise exception 'allocation cost center belongs to another tenant'; end if;
  if new.product_id is not null and not exists (
    select 1 from public.products p where p.id = new.product_id and p.tenant_id = new.tenant_id
  ) then raise exception 'allocation product belongs to another tenant'; end if;

  select coalesce(sum(a.amount), 0) into v_allocated
  from public.financial_allocations a
  where a.document_id = new.document_id and a.id <> new.id;
  if v_allocated + new.amount > v_document.original_amount then
    raise exception 'financial allocations cannot exceed document amount';
  end if;
  return new;
end;
$$;

create trigger financial_installments_validate_tenant
before insert or update on public.financial_installments
for each row execute function private.validate_financial_installment();

create trigger financial_allocations_validate
before insert or update on public.financial_allocations
for each row execute function private.validate_financial_allocation();

create or replace function private.validate_installment_total()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_document_id uuid;
  v_total numeric(18,2);
  v_document_amount numeric(18,2);
begin
  v_document_id := case when tg_op = 'DELETE' then old.document_id else new.document_id end;
  select coalesce(sum(amount), 0) into v_total
  from public.financial_installments where document_id = v_document_id;
  select original_amount into v_document_amount
  from public.financial_documents where id = v_document_id;
  if v_total > v_document_amount then
    raise exception 'installment total cannot exceed document amount';
  end if;
  return null;
end;
$$;

create constraint trigger financial_installments_total_chk
after insert or update or delete on public.financial_installments
deferrable initially deferred
for each row execute function private.validate_installment_total();

-- ---------------------------------------------------------------------------
-- Razao contabil e periodos. Sem interface e sem lancamentos automaticos.
-- ---------------------------------------------------------------------------

create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open',
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounting_periods_dates_chk check (ends_on >= starts_on),
  constraint accounting_periods_status_chk check (status in ('open', 'closed', 'locked')),
  constraint accounting_periods_workspace_range_uidx unique(workspace_id, starts_on, ends_on)
);

create index accounting_periods_workspace_status_idx
  on public.accounting_periods(workspace_id, status);

create trigger accounting_periods_set_updated_at
before update on public.accounting_periods
for each row execute function public.set_updated_at();

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  financial_document_id uuid references public.financial_documents(id) on delete restrict,
  accounting_period_id uuid references public.accounting_periods(id) on delete restrict,
  reversal_of_id uuid references public.journal_entries(id) on delete restrict,
  entry_date date not null,
  competence_date date not null,
  description text not null,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  posted_by uuid references auth.users(id) on delete set null,
  reversed_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entries_status_chk check (status in ('draft', 'posted', 'reversed'))
);

create unique index journal_entries_document_uidx
  on public.journal_entries(financial_document_id)
  where financial_document_id is not null and reversal_of_id is null;
create index journal_entries_workspace_competence_idx
  on public.journal_entries(workspace_id, competence_date);

create trigger journal_entries_set_updated_at
before update on public.journal_entries
for each row execute function public.set_updated_at();

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  chart_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  freight_id uuid references public.freights(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  business_partner_id uuid references public.business_partners(id) on delete restrict,
  cost_center_id uuid references public.cost_centers(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  description text,
  created_at timestamptz not null default now(),
  constraint journal_lines_debit_credit_chk check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);

create index journal_lines_entry_id_idx on public.journal_lines(journal_entry_id);
create index journal_lines_account_id_idx on public.journal_lines(chart_account_id);
create index journal_lines_dimensions_idx on public.journal_lines(freight_id, vehicle_id, cost_center_id);

create or replace function private.validate_journal_line_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not exists (
    select 1 from public.journal_entries je
    where je.id = new.journal_entry_id
      and je.tenant_id = new.tenant_id
      and je.workspace_id = new.workspace_id
  ) then raise exception 'journal line must match entry tenant/workspace'; end if;
  if not exists (
    select 1 from public.chart_of_accounts coa
    where coa.id = new.chart_account_id and coa.tenant_id = new.tenant_id
  ) then raise exception 'journal account belongs to another tenant'; end if;
  return new;
end;
$$;

create trigger journal_lines_validate_tenant
before insert or update on public.journal_lines
for each row execute function private.validate_journal_line_tenant();

create or replace function private.validate_posted_journal_balance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_debit numeric(18,2);
  v_credit numeric(18,2);
begin
  if new.status = 'posted' and old.status is distinct from new.status then
    select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      into v_debit, v_credit
    from public.journal_lines where journal_entry_id = new.id;
    if v_debit = 0 or v_debit <> v_credit then
      raise exception 'posted journal entry must be balanced';
    end if;
    new.posted_at := coalesce(new.posted_at, now());
    new.posted_by := coalesce(new.posted_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger journal_entries_validate_posting
before update on public.journal_entries
for each row execute function private.validate_posted_journal_balance();

create table public.financial_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  financial_document_id uuid not null references public.financial_documents(id) on delete restrict,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  old_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index financial_audit_document_idx
  on public.financial_audit_events(financial_document_id, created_at desc);

create or replace function private.audit_financial_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.financial_audit_events (
    tenant_id, workspace_id, financial_document_id, action, actor_id, old_status, new_status
  ) values (
    new.tenant_id,
    new.workspace_id,
    new.id,
    case when tg_op = 'INSERT' then 'created'
      when old.status is distinct from new.status then 'status_changed'
      else 'updated' end,
    auth.uid(),
    case when tg_op = 'UPDATE' then old.status end,
    new.status
  );
  return new;
end;
$$;

create trigger financial_documents_audit_event
after insert or update on public.financial_documents
for each row execute function private.audit_financial_document();

-- ---------------------------------------------------------------------------
-- RLS e grants. Service role permanece exclusivamente no servidor.
-- ---------------------------------------------------------------------------

alter table public.freights enable row level security;
alter table public.business_partners enable row level security;
alter table public.business_partner_roles enable row level security;
alter table public.legacy_partner_links enable row level security;
alter table public.chart_of_accounts enable row level security;
alter table public.cost_centers enable row level security;
alter table public.financial_documents enable row level security;
alter table public.financial_installments enable row level security;
alter table public.financial_allocations enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.financial_audit_events enable row level security;

grant select on public.freights, public.business_partners, public.business_partner_roles,
  public.legacy_partner_links, public.chart_of_accounts, public.cost_centers,
  public.financial_documents, public.financial_installments, public.financial_allocations,
  public.accounting_periods, public.journal_entries, public.journal_lines,
  public.financial_audit_events to authenticated;

grant insert, update, delete on public.business_partners, public.business_partner_roles,
  public.chart_of_accounts, public.cost_centers, public.financial_documents,
  public.financial_installments, public.financial_allocations, public.accounting_periods
  to authenticated;

create policy freights_financial_read on public.freights for select to authenticated
using (workspace_id is not null and private.can_read_financial_workspace(workspace_id));

create policy business_partners_financial_read on public.business_partners for select to authenticated
using (private.can_read_financial_tenant(tenant_id));
create policy business_partners_financial_manage on public.business_partners for all to authenticated
using (private.can_configure_financial_tenant(tenant_id))
with check (private.can_configure_financial_tenant(tenant_id));

create policy business_partner_roles_financial_read on public.business_partner_roles for select to authenticated
using (private.can_read_financial_tenant(tenant_id));
create policy business_partner_roles_financial_manage on public.business_partner_roles for all to authenticated
using (private.can_configure_financial_tenant(tenant_id))
with check (private.can_configure_financial_tenant(tenant_id));

create policy legacy_partner_links_financial_read on public.legacy_partner_links for select to authenticated
using (private.can_read_financial_tenant(tenant_id));

create policy chart_of_accounts_financial_read on public.chart_of_accounts for select to authenticated
using (private.can_read_financial_tenant(tenant_id));
create policy chart_of_accounts_financial_manage on public.chart_of_accounts for all to authenticated
using (private.can_configure_financial_tenant(tenant_id))
with check (private.can_configure_financial_tenant(tenant_id));

create policy cost_centers_financial_read on public.cost_centers for select to authenticated
using (private.can_read_financial_tenant(tenant_id));
create policy cost_centers_financial_manage on public.cost_centers for all to authenticated
using (private.can_configure_financial_tenant(tenant_id))
with check (private.can_configure_financial_tenant(tenant_id));

create policy financial_documents_read on public.financial_documents for select to authenticated
using (private.can_read_financial_workspace(workspace_id));
create policy financial_documents_manage on public.financial_documents for all to authenticated
using (private.can_manage_financial_workspace(workspace_id))
with check (private.can_manage_financial_workspace(workspace_id));

create policy financial_installments_read on public.financial_installments for select to authenticated
using (private.can_read_financial_workspace(workspace_id));
create policy financial_installments_manage on public.financial_installments for all to authenticated
using (private.can_manage_financial_workspace(workspace_id))
with check (private.can_manage_financial_workspace(workspace_id));

create policy financial_allocations_read on public.financial_allocations for select to authenticated
using (private.can_read_financial_workspace(workspace_id));
create policy financial_allocations_manage on public.financial_allocations for all to authenticated
using (private.can_manage_financial_workspace(workspace_id))
with check (private.can_manage_financial_workspace(workspace_id));

create policy accounting_periods_read on public.accounting_periods for select to authenticated
using (private.can_read_financial_workspace(workspace_id));
create policy accounting_periods_manage on public.accounting_periods for all to authenticated
using (private.can_configure_financial_workspace(workspace_id))
with check (private.can_configure_financial_workspace(workspace_id));

create policy journal_entries_read on public.journal_entries for select to authenticated
using (private.can_read_financial_workspace(workspace_id));
create policy journal_lines_read on public.journal_lines for select to authenticated
using (private.can_read_financial_workspace(workspace_id));
create policy financial_audit_events_read on public.financial_audit_events for select to authenticated
using (private.can_read_financial_workspace(workspace_id));

comment on table public.freights is
  'Viagem canonica. Na Fase 1 e espelhada passivamente da operacao legada.';
comment on table public.financial_documents is
  'Fato economico canonico. Nenhuma receita ou despesa legada e criada nesta migration.';
comment on table public.journal_entries is
  'Fundacao do razao da DRE Gerencial Frotak; nao substitui contabilidade fiscal.';
