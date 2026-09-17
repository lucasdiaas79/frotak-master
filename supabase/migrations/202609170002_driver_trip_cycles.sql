-- Frotak - Fase 3 JO Transportes: ciclos de viagem longa por motorista.
-- Mantem tenants single_freight sem mudanca operacional.

create table if not exists public.driver_trip_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid references public.workspaces(id) on delete set null,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  trailer_id uuid references public.trailers(id) on delete set null,
  status text not null default 'open',
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  close_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_trip_cycles_status_chk check (status in ('open', 'closed', 'cancelled')),
  constraint driver_trip_cycles_closed_at_chk check (
    (status = 'open' and closed_at is null)
    or (status <> 'open' and closed_at is not null)
  )
);

create unique index if not exists driver_trip_cycles_tenant_id_id_uidx
  on public.driver_trip_cycles(tenant_id, id);

create unique index if not exists driver_trip_cycles_one_open_driver_uidx
  on public.driver_trip_cycles(tenant_id, driver_id)
  where status = 'open';

create index if not exists driver_trip_cycles_workspace_status_idx
  on public.driver_trip_cycles(workspace_id, status);

create index if not exists driver_trip_cycles_driver_started_idx
  on public.driver_trip_cycles(tenant_id, driver_id, started_at desc);

drop trigger if exists driver_trip_cycles_set_updated_at on public.driver_trip_cycles;
create trigger driver_trip_cycles_set_updated_at
before update on public.driver_trip_cycles
for each row execute function public.set_updated_at();

alter table public.driver_trip_cycles enable row level security;

grant select on public.driver_trip_cycles to authenticated;

drop policy if exists driver_trip_cycles_tenant_access on public.driver_trip_cycles;
create policy driver_trip_cycles_tenant_access on public.driver_trip_cycles
for select to authenticated
using (private.can_access_tenant(tenant_id));

alter table public.freights
  add column if not exists trip_cycle_id uuid references public.driver_trip_cycles(id) on delete set null;

alter table public.freight_history
  add column if not exists trip_cycle_id uuid references public.driver_trip_cycles(id) on delete set null;

alter table public.freight_expenses
  add column if not exists trip_cycle_id uuid references public.driver_trip_cycles(id) on delete set null;

alter table public.freight_cash_entries
  add column if not exists trip_cycle_id uuid references public.driver_trip_cycles(id) on delete set null;

create index if not exists freights_trip_cycle_id_idx
  on public.freights(trip_cycle_id);

create index if not exists freight_history_trip_cycle_id_idx
  on public.freight_history(trip_cycle_id);

create index if not exists freight_expenses_trip_cycle_id_idx
  on public.freight_expenses(trip_cycle_id);

create index if not exists freight_cash_entries_trip_cycle_id_idx
  on public.freight_cash_entries(trip_cycle_id);

create or replace function private.tenant_driver_app_settings(p_tenant_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(t.settings->'driverApp', t.settings->'driver_app', '{}'::jsonb)
  from public.tenants t
  where t.id = p_tenant_id
  limit 1
$$;

create or replace function private.tenant_driver_app_mode(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_settings jsonb;
  v_mode text;
begin
  v_settings := coalesce(private.tenant_driver_app_settings(p_tenant_id), '{}'::jsonb);
  v_mode := coalesce(
    nullif(v_settings->>'mode', ''),
    nullif(v_settings->>'driverAppMode', ''),
    'single_freight'
  );

  if v_mode not in ('single_freight', 'long_trip_multi_freight') then
    return 'single_freight';
  end if;

  return v_mode;
end;
$$;

create or replace function private.ensure_open_driver_trip_cycle(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_trailer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_cycle_id uuid;
  v_workspace_id uuid;
begin
  if p_tenant_id is null
    or p_driver_id is null
    or private.tenant_driver_app_mode(p_tenant_id) <> 'long_trip_multi_freight' then
    return null;
  end if;

  v_workspace_id := coalesce(p_workspace_id, private.default_workspace_for_tenant(p_tenant_id));

  select id
    into v_cycle_id
  from public.driver_trip_cycles
  where tenant_id = p_tenant_id
    and driver_id = p_driver_id
    and status = 'open'
  for update;

  if found then
    update public.driver_trip_cycles
    set workspace_id = coalesce(workspace_id, v_workspace_id),
        vehicle_id = coalesce(p_vehicle_id, vehicle_id),
        trailer_id = coalesce(p_trailer_id, trailer_id),
        metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
          'lastVehicleId', p_vehicle_id,
          'lastTrailerId', p_trailer_id,
          'lastFreightLinkedAt', now()
        )),
        updated_at = now()
    where id = v_cycle_id;

    return v_cycle_id;
  end if;

  insert into public.driver_trip_cycles (
    tenant_id, workspace_id, driver_id, vehicle_id, trailer_id, metadata
  )
  values (
    p_tenant_id,
    v_workspace_id,
    p_driver_id,
    p_vehicle_id,
    p_trailer_id,
    jsonb_strip_nulls(jsonb_build_object(
      'openedBy', 'link_vehicle_operation',
      'lastVehicleId', p_vehicle_id,
      'lastTrailerId', p_trailer_id
    ))
  )
  returning id into v_cycle_id;

  return v_cycle_id;
end;
$$;

create or replace function private.close_open_driver_trip_cycle(
  p_tenant_id uuid,
  p_driver_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_cycle_id uuid;
begin
  if p_tenant_id is null or p_driver_id is null then
    return null;
  end if;

  update public.driver_trip_cycles
  set status = 'closed',
      closed_at = now(),
      close_reason = coalesce(nullif(btrim(p_reason), ''), 'driver_return_completed'),
      updated_at = now()
  where tenant_id = p_tenant_id
    and driver_id = p_driver_id
    and status = 'open'
  returning id into v_cycle_id;

  return v_cycle_id;
end;
$$;

create or replace function public.link_vehicle_operation(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_trailer_id uuid,
  p_trailer_ids uuid[],
  p_sender_id uuid,
  p_recipient_id uuid,
  p_product_id uuid,
  p_freight_value numeric,
  p_freight_payment_type text,
  p_payment_term_days integer default null,
  p_freight_pricing_mode text default 'fixed',
  p_freight_ton_price numeric default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_vehicle public.vehicles;
  v_billing_partner_id uuid;
  v_pricing_mode text;
  v_fixed_value numeric;
  v_ton_price numeric;
  v_workspace_id uuid;
  v_trip_cycle_id uuid;
begin
  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and private.can_access_tenant(tenant_id);
  if not found then raise exception 'vehicle not found or not accessible'; end if;

  if p_sender_id is null or p_recipient_id is null then
    raise exception 'FREIGHT_ORIGIN_AND_DESTINATION_REQUIRED';
  end if;
  if p_payment_term_days is not null and p_payment_term_days < 0 then
    raise exception 'FINANCIAL_INVALID_PAYMENT_TERM_DAYS';
  end if;

  v_pricing_mode := coalesce(nullif(btrim(p_freight_pricing_mode), ''), 'fixed');
  if v_pricing_mode not in ('fixed', 'per_ton') then
    raise exception 'FREIGHT_PRICING_MODE_INVALID';
  end if;

  v_fixed_value := case when v_pricing_mode = 'fixed' then p_freight_value else null end;
  v_ton_price := case when v_pricing_mode = 'per_ton' then p_freight_ton_price else null end;
  if v_pricing_mode = 'per_ton' and (v_ton_price is null or v_ton_price <= 0) then
    raise exception 'FREIGHT_TON_PRICE_REQUIRED';
  end if;

  v_billing_partner_id := private.resolve_freight_billing_partner(
    v_vehicle.tenant_id,
    upper(nullif(btrim(p_freight_payment_type), '')),
    p_sender_id,
    p_recipient_id
  );

  v_workspace_id := private.default_workspace_for_tenant(v_vehicle.tenant_id);

  v_vehicle := private.link_vehicle_operation_legacy_core(
    p_vehicle_id, p_driver_id, p_trailer_id, p_trailer_ids,
    p_sender_id, p_recipient_id, p_product_id, v_fixed_value
  );

  v_trip_cycle_id := private.ensure_open_driver_trip_cycle(
    v_vehicle.tenant_id,
    v_workspace_id,
    p_driver_id,
    v_vehicle.id,
    v_vehicle.trailer_id
  );

  update public.vehicles
  set freight_pricing_mode = v_pricing_mode,
      freight_ton_price = v_ton_price,
      unloaded_tons = null,
      updated_at = now()
  where id = v_vehicle.id
  returning * into v_vehicle;

  update public.freights
  set freight_payment_type = upper(p_freight_payment_type),
      billing_partner_id = v_billing_partner_id,
      payment_term_days = p_payment_term_days,
      freight_pricing_mode = v_pricing_mode,
      freight_ton_price = v_ton_price,
      unloaded_tons = null,
      trip_cycle_id = v_trip_cycle_id,
      snapshot = snapshot || jsonb_strip_nulls(jsonb_build_object(
        'freight_payment_type', upper(p_freight_payment_type),
        'billing_partner_id', v_billing_partner_id,
        'payment_term_days', p_payment_term_days,
        'freight_pricing_mode', v_pricing_mode,
        'freight_ton_price', v_ton_price,
        'trip_cycle_id', v_trip_cycle_id
      )),
      updated_at = now()
  where id = v_vehicle.current_freight_id
    and tenant_id = v_vehicle.tenant_id;

  if not found then raise exception 'CANONICAL_FREIGHT_NOT_CREATED'; end if;
  return v_vehicle;
end;
$$;

revoke all on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text, integer, text, numeric
) from public, anon, authenticated;
grant execute on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text, integer, text, numeric
) to authenticated;

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
  v_trip_cycle_id uuid;
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

  select f.trip_cycle_id
    into v_trip_cycle_id
  from public.freights f
  where f.tenant_id = v_vehicle.tenant_id
    and f.id = v_vehicle.current_freight_id
  limit 1;

  insert into public.freight_history (
    tenant_id, freight_id, trip_cycle_id, vehicle_id, driver_id, trailer_id, sender_id,
    recipient_id, product_id, vehicle_plate, freight_value, freight_pricing_mode,
    freight_ton_price, unloaded_tons, freight_tax_rate, finish_reason,
    final_status, final_freight_stage
  )
  values (
    v_vehicle.tenant_id, v_vehicle.current_freight_id, v_trip_cycle_id, v_vehicle.id, v_vehicle.driver_id,
    v_vehicle.trailer_id, v_vehicle.sender_id, v_vehicle.recipient_id, v_vehicle.product_id,
    v_vehicle.plate, v_vehicle.freight_value, v_vehicle.freight_pricing_mode,
    v_vehicle.freight_ton_price, v_vehicle.unloaded_tons, v_vehicle.freight_tax_rate,
    p_reason, v_vehicle.status, v_vehicle.freight_stage
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
      freight_pricing_mode = 'fixed',
      freight_ton_price = null,
      unloaded_tons = null,
      freight_tax_rate = 0,
      status = 'disponivel-patio',
      vehicle_situation = 'disponivel-patio',
      freight_stage = 'DISPONIVEL',
      updated_at = now()
    where id = p_vehicle_id;
  end if;

  return v_history_id;
end;
$$;

create or replace function public.driver_app_complete_return(
  p_vehicle_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_history_id uuid;
  v_trip_cycle_id uuid;
begin
  v_driver := private.current_driver();

  select *
    into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
    and tenant_id = v_driver.tenant_id
    and driver_id = v_driver.id
  for update;

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;

  if v_vehicle.current_freight_id is null then
    raise exception 'active freight not found for authenticated driver';
  end if;

  if coalesce(v_vehicle.freight_stage, '') <> 'ENTREGA_FINALIZADA'
    or v_vehicle.status <> 'rota-retornando' then
    raise exception 'return cannot be completed from current driver stage';
  end if;

  select f.trip_cycle_id
    into v_trip_cycle_id
  from public.freights f
  where f.tenant_id = v_vehicle.tenant_id
    and f.id = v_vehicle.current_freight_id
  limit 1;

  insert into public.freight_history (
    tenant_id, freight_id, trip_cycle_id, vehicle_id, driver_id, trailer_id, sender_id,
    recipient_id, product_id, vehicle_plate, freight_value, freight_pricing_mode,
    freight_ton_price, unloaded_tons, freight_tax_rate, finish_reason,
    final_status, final_freight_stage
  )
  values (
    v_vehicle.tenant_id, v_vehicle.current_freight_id, v_trip_cycle_id, v_vehicle.id, v_vehicle.driver_id,
    v_vehicle.trailer_id, v_vehicle.sender_id, v_vehicle.recipient_id, v_vehicle.product_id,
    v_vehicle.plate, v_vehicle.freight_value, v_vehicle.freight_pricing_mode,
    v_vehicle.freight_ton_price, v_vehicle.unloaded_tons, v_vehicle.freight_tax_rate,
    'retorno_confirmado_motorista', v_vehicle.status, v_vehicle.freight_stage
  )
  returning id into v_history_id;

  insert into public.fleet_events (
    tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
    source, description, created_by, event_type, action_origin, metadata
  )
  values (
    v_vehicle.tenant_id, v_vehicle.id, v_vehicle.current_freight_id, 'disponivel-patio',
    'DISPONIVEL', v_vehicle.city, v_vehicle.state, 'Motorista',
    'Retorno ao patio confirmado pelo motorista', auth.uid(), 'driver_return_completed',
    'driver_app', jsonb_build_object(
      'driver_id', v_driver.id,
      'history_id', v_history_id,
      'trip_cycle_id', v_trip_cycle_id
    )
  );

  perform private.close_open_driver_trip_cycle(
    v_vehicle.tenant_id,
    v_vehicle.driver_id,
    'retorno_confirmado_motorista'
  );

  update public.vehicles
  set
    current_freight_id = null,
    sender_id = null,
    recipient_id = null,
    product_id = null,
    freight_value = null,
    freight_pricing_mode = 'fixed',
    freight_ton_price = null,
    unloaded_tons = null,
    freight_tax_rate = 0,
    status = 'disponivel-patio',
    vehicle_situation = 'disponivel-patio',
    freight_stage = 'DISPONIVEL',
    workflow_flags = jsonb_set(coalesce(workflow_flags, '{}'::jsonb), '{pending_documents}', '[]'::jsonb, true),
    last_transition_source = 'driver_app',
    last_transition_by = auth.uid(),
    last_transition_at = now(),
    updated_at = now()
  where id = v_vehicle.id;

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_complete_return(uuid) from public, anon, authenticated;
grant execute on function public.driver_app_complete_return(uuid) to authenticated;

comment on table public.driver_trip_cycles is
  'Agrupador operacional para tenants com app motorista em modo viagem longa multi-frete.';

comment on column public.freights.trip_cycle_id is
  'Ciclo de viagem longa do motorista, usado quando o tenant permite varios fretes antes do retorno ao patio.';

notify pgrst, 'reload schema';
