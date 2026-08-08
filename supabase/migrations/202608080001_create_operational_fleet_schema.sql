create or replace function public.normalize_plate(p_value text)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select upper(regexp_replace(coalesce(p_value, ''), '[^A-Z0-9]', '', 'g'));
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select w.tenant_id
  from public.workspace_memberships wm
  join public.workspaces w on w.id = wm.workspace_id
  join public.tenants t on t.id = w.tenant_id
  where wm.user_id = auth.uid()
    and wm.status = 'active'
    and w.status = 'active'
    and t.status in ('active', 'trial')
  order by w.is_default desc, wm.created_at asc
  limit 1;
$$;

revoke all on function public.current_tenant_id() from public, anon, authenticated;
grant execute on function public.current_tenant_id() to authenticated;

create or replace function private.can_access_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_platform_user()
    or exists (
      select 1
      from public.workspace_memberships wm
      join public.workspaces w on w.id = wm.workspace_id
      join public.tenants t on t.id = w.tenant_id
      where w.tenant_id = p_tenant_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and w.status = 'active'
        and t.status in ('active', 'trial')
    );
$$;

revoke all on function private.can_access_tenant(uuid) from public, anon, authenticated;
grant execute on function private.can_access_tenant(uuid) to authenticated;

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  name text not null,
  phone text,
  cnh text,
  fleet_seq integer,
  partner_role text,
  active boolean not null default true,
  vehicle_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drivers_name_not_blank_chk check (btrim(name) <> '')
);

create table public.trailers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  identifier text not null,
  type text not null,
  fleet_seq integer,
  fleet_kind text,
  brand text,
  model text,
  manufacture_year integer,
  renavam text,
  implement_type text,
  implement_model text,
  vehicle_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trailers_identifier_not_blank_chk check (btrim(identifier) <> ''),
  constraint trailers_identifier_tenant_uidx unique (tenant_id, identifier)
);

create table public.senders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  name text not null,
  cnpj text,
  city text,
  state text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint senders_name_not_blank_chk check (btrim(name) <> '')
);

create table public.recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  name text not null,
  cnpj text,
  city text,
  state text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipients_name_not_blank_chk check (btrim(name) <> '')
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank_chk check (btrim(name) <> ''),
  constraint products_tenant_name_uidx unique (tenant_id, name)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  current_freight_id uuid,
  workflow_version integer not null default 0,
  workflow_flags jsonb not null default '{"pending_documents":[]}'::jsonb,
  last_transition_source text,
  last_transition_by uuid references auth.users(id) on delete set null,
  last_transition_at timestamptz,
  plate text not null,
  type text not null,
  fleet_seq integer,
  fleet_kind text,
  brand text,
  model text,
  manufacture_year integer,
  renavam text,
  status text not null default 'disponivel-patio',
  vehicle_situation text not null default 'disponivel-patio',
  freight_stage text not null default 'DISPONIVEL',
  driver_id uuid references public.drivers(id) on delete set null,
  trailer_id uuid references public.trailers(id) on delete set null,
  sender_id uuid references public.senders(id) on delete set null,
  recipient_id uuid references public.recipients(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  freight_value numeric,
  city text,
  state text,
  lat double precision,
  lng double precision,
  sascar_id text,
  last_position_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_plate_not_blank_chk check (btrim(plate) <> ''),
  constraint vehicles_status_chk check (status in (
    'disponivel-patio',
    'disponivel-oficina',
    'aguardando-motorista',
    'rota-carregar',
    'rota-descarregar',
    'rota-retornando',
    'parado-aguardando-carga',
    'aguardando-cte',
    'aguardando-confirmacao',
    'parado-aguardando-comando',
    'parado-descarregando',
    'parado-quebrado',
    'manutencao'
  )),
  constraint vehicles_situation_chk check (vehicle_situation in (
    'disponivel-patio',
    'disponivel-oficina',
    'em-rota',
    'parado',
    'quebrado',
    'manutencao'
  )),
  constraint vehicles_freight_stage_chk check (freight_stage in (
    'DISPONIVEL',
    'EM_ROTA_CARREGAR',
    'AGUARDANDO_NOTA',
    'NOTA_EM_CONFERENCIA',
    'NOTA_APROVADA_AG_CTE',
    'CTE_GERADA_AG_CONFIRMACAO_MOTORISTA',
    'EM_ROTA_ENTREGA',
    'ENTREGUE_AG_FINALIZACAO',
    'ENTREGA_FINALIZADA'
  )),
  constraint vehicles_tenant_plate_uidx unique (tenant_id, plate)
);

alter table public.drivers
  add constraint drivers_vehicle_id_fkey
  foreign key (vehicle_id) references public.vehicles(id) on delete set null;

alter table public.trailers
  add constraint trailers_vehicle_id_fkey
  foreign key (vehicle_id) references public.vehicles(id) on delete set null;

create table public.vehicle_trailers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  trailer_id uuid not null references public.trailers(id) on delete restrict,
  position integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_trailers_position_chk check (position > 0),
  constraint vehicle_trailers_vehicle_trailer_uidx unique (vehicle_id, trailer_id)
);

create table public.fleet_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  freight_id uuid,
  status text not null,
  freight_stage text,
  city text,
  state text,
  source text not null default 'Sistema',
  description text,
  created_by uuid references auth.users(id) on delete set null,
  event_type text,
  action_origin text,
  metadata jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now(),
  constraint fleet_events_source_chk check (source in ('Telemetria', 'Motorista', 'Operador', 'Sistema', 'Manutencao', 'Manutenção'))
);

create table public.vehicle_positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  city text,
  state text,
  speed numeric,
  direction numeric,
  source text not null default 'manual',
  raw_payload jsonb,
  recorded_at timestamptz not null default now()
);

create table public.freight_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  freight_id uuid,
  driver_id uuid references public.drivers(id) on delete set null,
  kind text not null,
  source text not null,
  file_name text not null,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  status text not null default 'anexado',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.freight_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  freight_id uuid,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  trailer_id uuid references public.trailers(id) on delete set null,
  sender_id uuid references public.senders(id) on delete set null,
  recipient_id uuid references public.recipients(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  vehicle_plate text not null,
  driver_name text,
  trailer_identifier text,
  sender_name text,
  sender_city text,
  sender_state text,
  recipient_name text,
  recipient_city text,
  recipient_state text,
  product_name text,
  freight_value numeric,
  started_at timestamptz,
  finished_at timestamptz not null default now(),
  finish_reason text not null,
  final_status text,
  final_freight_stage text,
  events jsonb not null default '[]'::jsonb,
  stage_timeline jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fuel_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  vehicle_plate text not null,
  driver_name text,
  station text not null,
  fuel_type text not null default 'diesel_s10',
  liters numeric not null default 0,
  amount numeric not null default 0,
  odometer numeric not null default 0,
  notes text,
  invoice_file_name text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fuel_records_fuel_type_chk check (fuel_type in ('diesel_s10', 'arla'))
);

create table public.manual_workflow_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  target_code text not null,
  reason text,
  information_source text,
  occurred_at timestamptz,
  recorded_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create table public.integration_sync_state (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  integration text not null,
  scope text not null,
  synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_sync_state_tenant_scope_uidx unique (tenant_id, integration, scope)
);

create index drivers_tenant_id_idx on public.drivers(tenant_id);
create index drivers_vehicle_id_idx on public.drivers(vehicle_id);
create index trailers_tenant_id_idx on public.trailers(tenant_id);
create index trailers_vehicle_id_idx on public.trailers(vehicle_id);
create index senders_tenant_id_idx on public.senders(tenant_id);
create index recipients_tenant_id_idx on public.recipients(tenant_id);
create index products_tenant_id_idx on public.products(tenant_id);
create index vehicles_tenant_id_idx on public.vehicles(tenant_id);
create index vehicles_status_idx on public.vehicles(status);
create index vehicles_situation_idx on public.vehicles(vehicle_situation);
create index vehicles_driver_id_idx on public.vehicles(driver_id);
create index vehicles_plate_idx on public.vehicles(plate);
create index vehicle_trailers_tenant_id_idx on public.vehicle_trailers(tenant_id);
create index vehicle_trailers_vehicle_id_idx on public.vehicle_trailers(vehicle_id);
create index vehicle_trailers_trailer_id_idx on public.vehicle_trailers(trailer_id);
create index fleet_events_tenant_id_idx on public.fleet_events(tenant_id);
create index fleet_events_vehicle_id_idx on public.fleet_events(vehicle_id);
create index fleet_events_timestamp_idx on public.fleet_events(timestamp desc);
create index vehicle_positions_tenant_id_idx on public.vehicle_positions(tenant_id);
create index vehicle_positions_vehicle_id_idx on public.vehicle_positions(vehicle_id);
create index vehicle_positions_recorded_at_idx on public.vehicle_positions(recorded_at desc);
create index freight_documents_tenant_id_idx on public.freight_documents(tenant_id);
create index freight_history_tenant_id_idx on public.freight_history(tenant_id);
create index fuel_records_tenant_id_idx on public.fuel_records(tenant_id);
create index manual_workflow_overrides_tenant_id_idx on public.manual_workflow_overrides(tenant_id);

create trigger drivers_set_updated_at before update on public.drivers
for each row execute function public.set_updated_at();
create trigger trailers_set_updated_at before update on public.trailers
for each row execute function public.set_updated_at();
create trigger senders_set_updated_at before update on public.senders
for each row execute function public.set_updated_at();
create trigger recipients_set_updated_at before update on public.recipients
for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles
for each row execute function public.set_updated_at();
create trigger vehicle_trailers_set_updated_at before update on public.vehicle_trailers
for each row execute function public.set_updated_at();
create trigger freight_documents_set_updated_at before update on public.freight_documents
for each row execute function public.set_updated_at();
create trigger freight_history_set_updated_at before update on public.freight_history
for each row execute function public.set_updated_at();
create trigger fuel_records_set_updated_at before update on public.fuel_records
for each row execute function public.set_updated_at();
create trigger integration_sync_state_set_updated_at before update on public.integration_sync_state
for each row execute function public.set_updated_at();

alter table public.drivers enable row level security;
alter table public.trailers enable row level security;
alter table public.senders enable row level security;
alter table public.recipients enable row level security;
alter table public.products enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_trailers enable row level security;
alter table public.fleet_events enable row level security;
alter table public.vehicle_positions enable row level security;
alter table public.freight_documents enable row level security;
alter table public.freight_history enable row level security;
alter table public.fuel_records enable row level security;
alter table public.manual_workflow_overrides enable row level security;
alter table public.integration_sync_state enable row level security;

grant select, insert, update, delete on table
  public.drivers,
  public.trailers,
  public.senders,
  public.recipients,
  public.products,
  public.vehicles,
  public.vehicle_trailers,
  public.fleet_events,
  public.vehicle_positions,
  public.freight_documents,
  public.freight_history,
  public.fuel_records,
  public.manual_workflow_overrides,
  public.integration_sync_state
to authenticated;

create policy drivers_tenant_access on public.drivers
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy trailers_tenant_access on public.trailers
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy senders_tenant_access on public.senders
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy recipients_tenant_access on public.recipients
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy products_tenant_access on public.products
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy vehicles_tenant_access on public.vehicles
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy vehicle_trailers_tenant_access on public.vehicle_trailers
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy fleet_events_tenant_access on public.fleet_events
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy vehicle_positions_tenant_access on public.vehicle_positions
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy freight_documents_tenant_access on public.freight_documents
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy freight_history_tenant_access on public.freight_history
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy fuel_records_tenant_access on public.fuel_records
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy manual_workflow_overrides_tenant_access on public.manual_workflow_overrides
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));
create policy integration_sync_state_tenant_access on public.integration_sync_state
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));

create or replace function public.set_vehicle_status(
  p_vehicle_id uuid,
  p_status text,
  p_source text default 'Operador',
  p_description text default null,
  p_freight_stage text default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_vehicle public.vehicles;
  v_situation text;
begin
  select *
    into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
    and private.can_access_tenant(tenant_id)
  for update;

  if not found then
    raise exception 'vehicle not found or not accessible';
  end if;

  v_situation := case
    when p_status in ('rota-carregar', 'rota-descarregar', 'rota-retornando') then 'em-rota'
    when p_status = 'parado-quebrado' then 'quebrado'
    when p_status in ('manutencao', 'disponivel-oficina') then 'manutencao'
    when p_status = 'disponivel-patio' then 'disponivel-patio'
    else 'parado'
  end;

  update public.vehicles
  set
    status = p_status,
    vehicle_situation = v_situation,
    freight_stage = coalesce(p_freight_stage, freight_stage),
    last_transition_source = p_source,
    last_transition_by = auth.uid(),
    last_transition_at = now(),
    updated_at = now()
  where id = p_vehicle_id
  returning * into v_vehicle;

  insert into public.fleet_events (
    tenant_id,
    vehicle_id,
    freight_id,
    status,
    freight_stage,
    city,
    state,
    source,
    description,
    created_by,
    event_type,
    action_origin
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_vehicle.current_freight_id,
    v_vehicle.status,
    v_vehicle.freight_stage,
    v_vehicle.city,
    v_vehicle.state,
    coalesce(p_source, 'Operador'),
    p_description,
    auth.uid(),
    'status_updated',
    'app'
  );

  return v_vehicle;
end;
$$;

create or replace function public.link_vehicle_operation(
  p_vehicle_id uuid,
  p_driver_id uuid default null,
  p_trailer_id uuid default null,
  p_trailer_ids uuid[] default null,
  p_sender_id uuid default null,
  p_recipient_id uuid default null,
  p_product_id uuid default null,
  p_freight_value numeric default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_vehicle public.vehicles;
  v_tenant_id uuid;
  v_trailer_ids uuid[];
  v_trailer_id uuid;
  v_position integer := 1;
begin
  select *
    into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
    and private.can_access_tenant(tenant_id)
  for update;

  if not found then
    raise exception 'vehicle not found or not accessible';
  end if;

  v_tenant_id := v_vehicle.tenant_id;
  v_trailer_ids := coalesce(p_trailer_ids, case when p_trailer_id is null then array[]::uuid[] else array[p_trailer_id] end);

  update public.drivers
  set vehicle_id = null
  where tenant_id = v_tenant_id and vehicle_id = p_vehicle_id;

  update public.trailers
  set vehicle_id = null
  where tenant_id = v_tenant_id and vehicle_id = p_vehicle_id;

  update public.vehicle_trailers
  set active = false, updated_at = now()
  where tenant_id = v_tenant_id and vehicle_id = p_vehicle_id;

  if p_driver_id is not null then
    update public.drivers
    set vehicle_id = p_vehicle_id, updated_at = now()
    where id = p_driver_id and tenant_id = v_tenant_id;
  end if;

  foreach v_trailer_id in array v_trailer_ids loop
    if v_trailer_id is not null then
      insert into public.vehicle_trailers (tenant_id, vehicle_id, trailer_id, position, active)
      values (v_tenant_id, p_vehicle_id, v_trailer_id, v_position, true)
      on conflict (vehicle_id, trailer_id) do update
      set position = excluded.position,
          active = true,
          updated_at = now();

      update public.trailers
      set vehicle_id = p_vehicle_id, updated_at = now()
      where id = v_trailer_id and tenant_id = v_tenant_id;

      v_position := v_position + 1;
    end if;
  end loop;

  update public.vehicles
  set
    driver_id = p_driver_id,
    trailer_id = nullif(v_trailer_ids[1], null),
    sender_id = p_sender_id,
    recipient_id = p_recipient_id,
    product_id = p_product_id,
    freight_value = p_freight_value,
    current_freight_id = coalesce(current_freight_id, gen_random_uuid()),
    updated_at = now()
  where id = p_vehicle_id
  returning * into v_vehicle;

  insert into public.fleet_events (
    tenant_id,
    vehicle_id,
    freight_id,
    status,
    freight_stage,
    city,
    state,
    source,
    description,
    created_by,
    event_type,
    action_origin
  )
  values (
    v_tenant_id,
    p_vehicle_id,
    v_vehicle.current_freight_id,
    v_vehicle.status,
    v_vehicle.freight_stage,
    v_vehicle.city,
    v_vehicle.state,
    'Operador',
    'Vinculacao operacional atualizada',
    auth.uid(),
    'operation_linked',
    'app'
  );

  return v_vehicle;
end;
$$;

create or replace function public.archive_vehicle_freight(
  p_vehicle_id uuid,
  p_reason text default 'pronto_para_novo_frete',
  p_clear_vehicle boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_vehicle public.vehicles;
  v_history_id uuid;
begin
  select *
    into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
    and private.can_access_tenant(tenant_id)
  for update;

  if not found then
    raise exception 'vehicle not found or not accessible';
  end if;

  insert into public.freight_history (
    tenant_id,
    freight_id,
    vehicle_id,
    driver_id,
    trailer_id,
    sender_id,
    recipient_id,
    product_id,
    vehicle_plate,
    freight_value,
    finish_reason,
    final_status,
    final_freight_stage
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.current_freight_id,
    v_vehicle.id,
    v_vehicle.driver_id,
    v_vehicle.trailer_id,
    v_vehicle.sender_id,
    v_vehicle.recipient_id,
    v_vehicle.product_id,
    v_vehicle.plate,
    v_vehicle.freight_value,
    p_reason,
    v_vehicle.status,
    v_vehicle.freight_stage
  )
  returning id into v_history_id;

  if p_clear_vehicle then
    update public.vehicles
    set
      current_freight_id = null,
      sender_id = null,
      recipient_id = null,
      product_id = null,
      freight_value = null,
      status = 'disponivel-patio',
      vehicle_situation = 'disponivel-patio',
      freight_stage = 'DISPONIVEL',
      updated_at = now()
    where id = p_vehicle_id;
  end if;

  return v_history_id;
end;
$$;

create or replace function public.register_vehicle_position(
  p_vehicle_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_city text default null,
  p_state text default null,
  p_speed numeric default null,
  p_direction numeric default null,
  p_source text default 'manual',
  p_raw_payload jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tenant_id uuid;
  v_position_id uuid;
begin
  select tenant_id
    into v_tenant_id
  from public.vehicles
  where id = p_vehicle_id
    and private.can_access_tenant(tenant_id);

  if v_tenant_id is null then
    raise exception 'vehicle not found or not accessible';
  end if;

  insert into public.vehicle_positions (
    tenant_id,
    vehicle_id,
    lat,
    lng,
    city,
    state,
    speed,
    direction,
    source,
    raw_payload
  )
  values (
    v_tenant_id,
    p_vehicle_id,
    p_lat,
    p_lng,
    p_city,
    p_state,
    p_speed,
    p_direction,
    p_source,
    p_raw_payload
  )
  returning id into v_position_id;

  update public.vehicles
  set lat = p_lat,
      lng = p_lng,
      city = coalesce(p_city, city),
      state = coalesce(p_state, state),
      last_position_at = now(),
      updated_at = now()
  where id = p_vehicle_id;

  return v_position_id;
end;
$$;

create or replace function public.get_master_tenant_overview()
returns table (
  tenant_id uuid,
  slug text,
  name text,
  cnpj text,
  subscription_period text,
  truck_limit integer,
  status text,
  metadata jsonb,
  users_count bigint,
  drivers_count bigint,
  trailers_count bigint,
  vehicles_count bigint,
  senders_count bigint,
  recipients_count bigint,
  products_count bigint,
  in_route_vehicles_count bigint,
  maintenance_vehicles_count bigint,
  broken_vehicles_count bigint
)
language sql
security definer
set search_path = pg_catalog, public, private
stable
as $$
  select
    t.id,
    t.slug,
    coalesce(t.trade_name, t.legal_name),
    t.cnpj,
    coalesce(ts.billing_metadata ->> 'period', t.settings ->> 'subscriptionPeriod'),
    coalesce((t.settings ->> 'maxVehicles')::integer, 0),
    t.status,
    coalesce(t.settings, '{}'::jsonb),
    coalesce(users.count, 0),
    coalesce(drivers.count, 0),
    coalesce(trailers.count, 0),
    coalesce(vehicles.count, 0),
    coalesce(senders.count, 0),
    coalesce(recipients.count, 0),
    coalesce(products.count, 0),
    coalesce(vehicles.in_route_count, 0),
    coalesce(vehicles.maintenance_count, 0),
    coalesce(vehicles.broken_count, 0)
  from public.tenants t
  left join lateral (
    select billing_metadata
    from public.tenant_subscriptions
    where tenant_id = t.id
    order by created_at desc
    limit 1
  ) ts on true
  left join lateral (
    select count(*)::bigint
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where w.tenant_id = t.id and wm.status = 'active'
  ) users on true
  left join lateral (select count(*)::bigint from public.drivers where tenant_id = t.id) drivers on true
  left join lateral (select count(*)::bigint from public.trailers where tenant_id = t.id) trailers on true
  left join lateral (
    select
      count(*)::bigint,
      count(*) filter (where vehicle_situation = 'em-rota')::bigint as in_route_count,
      count(*) filter (where vehicle_situation = 'manutencao')::bigint as maintenance_count,
      count(*) filter (where vehicle_situation = 'quebrado')::bigint as broken_count
    from public.vehicles
    where tenant_id = t.id
  ) vehicles on true
  left join lateral (select count(*)::bigint from public.senders where tenant_id = t.id) senders on true
  left join lateral (select count(*)::bigint from public.recipients where tenant_id = t.id) recipients on true
  left join lateral (select count(*)::bigint from public.products where tenant_id = t.id) products on true
  where private.is_platform_user();
$$;

revoke all on function public.get_master_tenant_overview() from public, anon, authenticated;
grant execute on function public.get_master_tenant_overview() to authenticated;

grant execute on function public.set_vehicle_status(uuid, text, text, text, text) to authenticated;
grant execute on function public.link_vehicle_operation(uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric) to authenticated;
grant execute on function public.archive_vehicle_freight(uuid, text, boolean) to authenticated;
grant execute on function public.register_vehicle_position(uuid, double precision, double precision, text, text, numeric, numeric, text, jsonb) to authenticated;
