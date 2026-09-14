-- Caixa operacional do motorista por frete.
-- Entradas registradas aqui alimentam o mini DRE do app motorista e nao alteram
-- a logica canonica de despesas/contas a pagar.

create table if not exists public.freight_cash_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id()
    references public.tenants(id) on delete restrict,
  freight_id uuid not null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id uuid references public.drivers(id) on delete set null,
  origin text not null,
  amount numeric not null default 0,
  notes text,
  source text not null default 'driver_app',
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint freight_cash_entries_amount_positive_chk check (amount > 0),
  constraint freight_cash_entries_source_chk check (source in ('driver_app', 'operator', 'system'))
);

create index if not exists freight_cash_entries_tenant_id_idx
  on public.freight_cash_entries(tenant_id);

create index if not exists freight_cash_entries_freight_id_idx
  on public.freight_cash_entries(freight_id);

create index if not exists freight_cash_entries_vehicle_id_idx
  on public.freight_cash_entries(vehicle_id);

create index if not exists freight_cash_entries_driver_id_idx
  on public.freight_cash_entries(driver_id);

drop trigger if exists freight_cash_entries_set_updated_at on public.freight_cash_entries;
create trigger freight_cash_entries_set_updated_at
before update on public.freight_cash_entries
for each row execute function public.set_updated_at();

alter table public.freight_cash_entries enable row level security;

drop policy if exists freight_cash_entries_tenant_access on public.freight_cash_entries;
create policy freight_cash_entries_tenant_access on public.freight_cash_entries
for all to authenticated
using (private.can_access_tenant(tenant_id))
with check (private.can_access_tenant(tenant_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.freight_cash_entries;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

create or replace function public.get_driver_app_context()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_profile public.profiles;
  v_payload jsonb;
begin
  v_driver := private.current_driver();

  select *
    into v_profile
  from public.profiles
  where id = auth.uid()
  limit 1;

  select *
    into v_vehicle
  from public.vehicles
  where tenant_id = v_driver.tenant_id
    and (
      driver_id = v_driver.id
      or id = v_driver.vehicle_id
    )
  order by
    (current_freight_id is not null) desc,
    updated_at desc
  limit 1;

  select jsonb_build_object(
    'driver', to_jsonb(v_driver),
    'profile', case when v_profile.id is null then null else jsonb_build_object(
      'id', v_profile.id,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone,
      'must_change_password', coalesce(v_profile.must_change_password, false)
    ) end,
    'vehicle', case when v_vehicle.id is null then null else to_jsonb(v_vehicle) end,
    'trailers', coalesce((
      select jsonb_agg(to_jsonb(t) order by coalesce(vt.position, 1), t.identifier)
      from public.vehicle_trailers vt
      join public.trailers t on t.id = vt.trailer_id
      where vt.tenant_id = v_driver.tenant_id
        and vt.vehicle_id = v_vehicle.id
        and vt.active = true
    ), (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.identifier), '[]'::jsonb)
      from public.trailers t
      where t.tenant_id = v_driver.tenant_id
        and t.id = v_vehicle.trailer_id
    ), '[]'::jsonb),
    'sender', case when v_vehicle.sender_id is null then null else (
      select to_jsonb(s)
      from public.senders s
      where s.tenant_id = v_driver.tenant_id
        and s.id = v_vehicle.sender_id
    ) end,
    'recipient', case when v_vehicle.recipient_id is null then null else (
      select to_jsonb(r)
      from public.recipients r
      where r.tenant_id = v_driver.tenant_id
        and r.id = v_vehicle.recipient_id
    ) end,
    'product', case when v_vehicle.product_id is null then null else (
      select to_jsonb(p)
      from public.products p
      where p.tenant_id = v_driver.tenant_id
        and p.id = v_vehicle.product_id
    ) end,
    'documents', coalesce((
      select jsonb_agg(to_jsonb(fd) order by fd.created_at desc)
      from public.freight_documents fd
      where fd.tenant_id = v_driver.tenant_id
        and fd.vehicle_id = v_vehicle.id
        and fd.freight_id is not distinct from v_vehicle.current_freight_id
    ), '[]'::jsonb),
    'cashEntries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'origin', ce.origin,
        'amount', ce.amount,
        'notes', ce.notes,
        'source', ce.source,
        'recordedAt', ce.recorded_at
      ) order by ce.recorded_at desc)
      from public.freight_cash_entries ce
      where ce.tenant_id = v_driver.tenant_id
        and ce.vehicle_id = v_vehicle.id
        and ce.freight_id is not distinct from v_vehicle.current_freight_id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fe.id,
        'category', fe.category,
        'description', fe.description,
        'amount', fe.amount,
        'notes', fe.notes,
        'fuelRecordId', fe.fuel_record_id,
        'recordedAt', fe.recorded_at
      ) order by fe.recorded_at desc)
      from public.freight_expenses fe
      where fe.tenant_id = v_driver.tenant_id
        and fe.vehicle_id = v_vehicle.id
        and fe.freight_id is not distinct from v_vehicle.current_freight_id
    ), '[]'::jsonb)
  ) into v_payload;

  return v_payload;
end;
$$;

revoke all on function public.get_driver_app_context() from public, anon, authenticated;
grant execute on function public.get_driver_app_context() to authenticated;

create or replace function public.driver_app_register_cash_entry(
  p_origin text,
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
  v_entry public.freight_cash_entries;
begin
  v_driver := private.current_driver();

  if p_amount is null or p_amount <= 0 then
    raise exception 'cash entry amount required';
  end if;

  if nullif(btrim(coalesce(p_origin, '')), '') is null then
    raise exception 'cash entry origin required';
  end if;

  select *
    into v_vehicle
  from public.vehicles
  where driver_id = v_driver.id
    and tenant_id = v_driver.tenant_id
  order by
    (current_freight_id is not null) desc,
    updated_at desc
  limit 1;

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;

  if v_vehicle.current_freight_id is null then
    raise exception 'active freight not found for authenticated driver';
  end if;

  insert into public.freight_cash_entries (
    tenant_id,
    freight_id,
    vehicle_id,
    driver_id,
    origin,
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
    btrim(p_origin),
    p_amount,
    nullif(btrim(p_notes), ''),
    'driver_app',
    auth.uid()
  )
  returning * into v_entry;

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
    'Entrada registrada pelo aplicativo do motorista',
    auth.uid(),
    'driver_cash_entry_registered',
    'driver_app',
    jsonb_build_object('driver_id', v_driver.id, 'cash_entry_id', v_entry.id)
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_register_cash_entry(text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.driver_app_register_cash_entry(text, numeric, text)
  to authenticated;
