create table if not exists public.freight_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  freight_id uuid not null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  fuel_record_id uuid references public.fuel_records(id) on delete set null,
  category text not null,
  description text not null,
  amount numeric not null default 0,
  notes text,
  source text not null default 'driver_app',
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint freight_expenses_amount_positive_chk check (amount > 0),
  constraint freight_expenses_category_chk check (
    category in (
      'diesel_s10',
      'arla',
      'pedagio',
      'alimentacao',
      'estacionamento',
      'manutencao',
      'outros'
    )
  ),
  constraint freight_expenses_source_chk check (source in ('driver_app', 'operator', 'system'))
);

create index if not exists freight_expenses_tenant_id_idx
  on public.freight_expenses(tenant_id);

create index if not exists freight_expenses_freight_id_idx
  on public.freight_expenses(freight_id);

create index if not exists freight_expenses_vehicle_id_idx
  on public.freight_expenses(vehicle_id);

create index if not exists freight_expenses_driver_id_idx
  on public.freight_expenses(driver_id);

drop trigger if exists freight_expenses_set_updated_at on public.freight_expenses;
create trigger freight_expenses_set_updated_at
before update on public.freight_expenses
for each row
execute function public.set_updated_at();

alter table public.freight_expenses enable row level security;

drop policy if exists freight_expenses_tenant_access on public.freight_expenses;
create policy freight_expenses_tenant_access on public.freight_expenses
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.freight_expenses;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

create or replace function public.driver_app_register_expense(
  p_category text,
  p_description text,
  p_amount numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_expense public.freight_expenses;
begin
  v_driver := private.current_driver();

  select *
    into v_vehicle
  from public.vehicles
  where driver_id = v_driver.id
    and tenant_id = v_driver.tenant_id
  order by updated_at desc
  limit 1;

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;

  if v_vehicle.current_freight_id is null then
    raise exception 'active freight not found for authenticated driver';
  end if;

  insert into public.freight_expenses (
    tenant_id,
    freight_id,
    vehicle_id,
    driver_id,
    category,
    description,
    amount,
    notes,
    source,
    recorded_by
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.current_freight_id,
    v_vehicle.id,
    v_driver.id,
    p_category,
    coalesce(nullif(btrim(p_description), ''), 'Despesa'),
    p_amount,
    nullif(btrim(p_notes), ''),
    'driver_app',
    auth.uid()
  )
  returning * into v_expense;

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
    action_origin,
    metadata
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_vehicle.current_freight_id,
    v_vehicle.status,
    v_vehicle.freight_stage,
    v_vehicle.city,
    v_vehicle.state,
    'Motorista',
    'Despesa registrada pelo aplicativo do motorista',
    auth.uid(),
    'driver_expense_registered',
    'driver_app',
    jsonb_build_object('driver_id', v_driver.id, 'expense_id', v_expense.id)
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_register_expense(text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.driver_app_register_expense(text, text, numeric, text)
  to authenticated;

create or replace function public.driver_app_register_fuel(
  p_station text,
  p_fuel_type text,
  p_liters numeric,
  p_amount numeric,
  p_odometer numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_record public.fuel_records;
  v_expense public.freight_expenses;
begin
  v_driver := private.current_driver();

  select *
    into v_vehicle
  from public.vehicles
  where driver_id = v_driver.id
    and tenant_id = v_driver.tenant_id
  order by updated_at desc
  limit 1;

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;

  if v_vehicle.current_freight_id is null then
    raise exception 'active freight not found for authenticated driver';
  end if;

  insert into public.fuel_records (
    tenant_id,
    vehicle_id,
    driver_id,
    vehicle_plate,
    driver_name,
    station,
    fuel_type,
    liters,
    amount,
    odometer,
    notes
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_driver.id,
    v_vehicle.plate,
    v_driver.name,
    p_station,
    p_fuel_type,
    p_liters,
    p_amount,
    p_odometer,
    p_notes
  )
  returning * into v_record;

  insert into public.freight_expenses (
    tenant_id,
    freight_id,
    vehicle_id,
    driver_id,
    fuel_record_id,
    category,
    description,
    amount,
    notes,
    source,
    recorded_by
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.current_freight_id,
    v_vehicle.id,
    v_driver.id,
    v_record.id,
    p_fuel_type,
    case
      when p_fuel_type = 'arla' then 'Arla'
      else 'Diesel S10'
    end,
    p_amount,
    p_notes,
    'driver_app',
    auth.uid()
  )
  returning * into v_expense;

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
    action_origin,
    metadata
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_vehicle.current_freight_id,
    v_vehicle.status,
    v_vehicle.freight_stage,
    v_vehicle.city,
    v_vehicle.state,
    'Motorista',
    'Abastecimento registrado pelo aplicativo do motorista',
    auth.uid(),
    'driver_fuel_registered',
    'driver_app',
    jsonb_build_object(
      'driver_id',
      v_driver.id,
      'fuel_record_id',
      v_record.id,
      'expense_id',
      v_expense.id
    )
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_register_fuel(text, text, numeric, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.driver_app_register_fuel(text, text, numeric, numeric, numeric, text)
  to authenticated;
