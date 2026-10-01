-- Stabilizes Central and driver-app synchronization without changing operational rows.
-- This migration is intentionally additive/idempotent and must run after 202609300001-005.

create or replace function private.driver_app_matches_driver(
  p_tenant_id uuid,
  p_driver_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.drivers d
    where d.auth_user_id = auth.uid()
      and d.active = true
      and d.tenant_id = p_tenant_id
      and d.id = p_driver_id
  )
$$;

create or replace function private.driver_app_can_access_vehicle(
  p_tenant_id uuid,
  p_vehicle_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.drivers d
    join public.vehicles v
      on v.tenant_id = d.tenant_id
     and v.id = p_vehicle_id
     and (v.driver_id = d.id or d.vehicle_id = v.id)
    where d.auth_user_id = auth.uid()
      and d.active = true
      and d.tenant_id = p_tenant_id
  )
$$;

create or replace function private.driver_app_can_access_freight(
  p_tenant_id uuid,
  p_freight_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.drivers d
    join public.freights f
      on f.tenant_id = d.tenant_id
     and f.id = p_freight_id
     and (
       f.driver_id = d.id
       or exists (
         select 1
         from public.vehicles v
         where v.tenant_id = d.tenant_id
           and v.id = f.vehicle_id
           and (v.driver_id = d.id or d.vehicle_id = v.id)
       )
     )
    where d.auth_user_id = auth.uid()
      and d.active = true
      and d.tenant_id = p_tenant_id
  )
$$;

revoke all on function private.driver_app_matches_driver(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.driver_app_can_access_vehicle(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.driver_app_can_access_freight(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.driver_app_matches_driver(uuid, uuid) to authenticated;
grant execute on function private.driver_app_can_access_vehicle(uuid, uuid) to authenticated;
grant execute on function private.driver_app_can_access_freight(uuid, uuid) to authenticated;

drop policy if exists drivers_driver_app_select on public.drivers;
create policy drivers_driver_app_select on public.drivers
for select to authenticated
using (private.driver_app_matches_driver(tenant_id, id));

drop policy if exists vehicles_driver_app_select on public.vehicles;
create policy vehicles_driver_app_select on public.vehicles
for select to authenticated
using (private.driver_app_can_access_vehicle(tenant_id, id));

drop policy if exists freights_driver_app_select on public.freights;
create policy freights_driver_app_select on public.freights
for select to authenticated
using (private.driver_app_can_access_freight(tenant_id, id));

drop policy if exists driver_trip_cycles_driver_app_select on public.driver_trip_cycles;
create policy driver_trip_cycles_driver_app_select on public.driver_trip_cycles
for select to authenticated
using (private.driver_app_matches_driver(tenant_id, driver_id));

drop policy if exists freight_documents_driver_app_select on public.freight_documents;
create policy freight_documents_driver_app_select on public.freight_documents
for select to authenticated
using (
  private.driver_app_matches_driver(tenant_id, driver_id)
  or private.driver_app_can_access_vehicle(tenant_id, vehicle_id)
  or private.driver_app_can_access_freight(tenant_id, freight_id)
);

drop policy if exists fuel_records_driver_app_select on public.fuel_records;
create policy fuel_records_driver_app_select on public.fuel_records
for select to authenticated
using (
  private.driver_app_matches_driver(tenant_id, driver_id)
  or private.driver_app_can_access_freight(tenant_id, freight_id)
);

drop policy if exists freight_expenses_driver_app_select on public.freight_expenses;
create policy freight_expenses_driver_app_select on public.freight_expenses
for select to authenticated
using (
  private.driver_app_matches_driver(tenant_id, driver_id)
  or private.driver_app_can_access_freight(tenant_id, freight_id)
);

drop policy if exists freight_cash_entries_driver_app_select on public.freight_cash_entries;
create policy freight_cash_entries_driver_app_select on public.freight_cash_entries
for select to authenticated
using (
  private.driver_app_matches_driver(tenant_id, driver_id)
  or private.driver_app_can_access_freight(tenant_id, freight_id)
);

drop policy if exists driver_trip_daily_allowances_driver_app_select
  on public.driver_trip_daily_allowances;
create policy driver_trip_daily_allowances_driver_app_select
on public.driver_trip_daily_allowances
for select to authenticated
using (private.driver_app_matches_driver(tenant_id, driver_id));

grant select on public.drivers, public.vehicles, public.freights, public.driver_trip_cycles,
  public.freight_documents, public.fuel_records, public.freight_expenses,
  public.freight_cash_entries, public.driver_trip_daily_allowances
to authenticated;

create or replace function private.storage_path_freight_id(p_name text)
returns uuid
language sql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
  select case
    when split_part(coalesce(p_name, ''), '/', 2)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 2)::uuid
    else null::uuid
  end
$$;

create or replace function private.driver_app_can_read_fuel_storage(p_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.drivers d
    join public.fuel_documents fd
      on fd.tenant_id = d.tenant_id
     and fd.driver_id = d.id
    join public.fuel_document_files fdf
      on fdf.fuel_document_id = fd.id
     and fdf.tenant_id = fd.tenant_id
     and fdf.storage_path = p_name
    where d.auth_user_id = auth.uid()
      and d.active = true
  )
$$;

revoke all on function private.storage_path_freight_id(text)
  from public, anon, authenticated;
revoke all on function private.driver_app_can_read_fuel_storage(text)
  from public, anon, authenticated;
grant execute on function private.storage_path_freight_id(text) to authenticated;
grant execute on function private.driver_app_can_read_fuel_storage(text) to authenticated;

drop policy if exists driver_fuel_documents_select on storage.objects;
drop policy if exists driver_fuel_documents_insert on storage.objects;
drop policy if exists driver_fuel_documents_update on storage.objects;
drop policy if exists driver_fuel_documents_delete on storage.objects;

create policy driver_fuel_documents_select on storage.objects
for select to authenticated
using (
  bucket_id = 'driver-fuel-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.driver_app_can_read_fuel_storage(name)
  )
);

create policy driver_fuel_documents_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'driver-fuel-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or (
      private.current_driver_tenant_id() = private.storage_path_tenant_id(name)
      and owner_id = auth.uid()::text
    )
  )
);

create policy driver_fuel_documents_update on storage.objects
for update to authenticated
using (
  bucket_id = 'driver-fuel-documents'
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.driver_app_can_read_fuel_storage(name)
  )
)
with check (
  bucket_id = 'driver-fuel-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or (
      private.current_driver_tenant_id() = private.storage_path_tenant_id(name)
      and owner_id = auth.uid()::text
    )
  )
);

create policy driver_fuel_documents_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'driver-fuel-documents'
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.driver_app_can_read_fuel_storage(name)
    or (
      private.current_driver_tenant_id() = private.storage_path_tenant_id(name)
      and owner_id = auth.uid()::text
    )
  )
);

drop policy if exists freight_documents_select on storage.objects;
drop policy if exists freight_documents_insert on storage.objects;
drop policy if exists freight_documents_update on storage.objects;
drop policy if exists freight_documents_delete on storage.objects;

create policy freight_documents_select on storage.objects
for select to authenticated
using (
  bucket_id = 'freight-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.driver_app_can_access_freight(
      private.storage_path_tenant_id(name),
      private.storage_path_freight_id(name)
    )
  )
);

create policy freight_documents_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'freight-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or (
      private.driver_app_can_access_freight(
        private.storage_path_tenant_id(name),
        private.storage_path_freight_id(name)
      )
      and owner_id = auth.uid()::text
    )
  )
);

create policy freight_documents_update on storage.objects
for update to authenticated
using (
  bucket_id = 'freight-documents'
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or private.driver_app_can_access_freight(
      private.storage_path_tenant_id(name),
      private.storage_path_freight_id(name)
    )
  )
)
with check (
  bucket_id = 'freight-documents'
  and private.storage_path_tenant_id(name) is not null
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or (
      private.driver_app_can_access_freight(
        private.storage_path_tenant_id(name),
        private.storage_path_freight_id(name)
      )
      and owner_id = auth.uid()::text
    )
  )
);

create policy freight_documents_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'freight-documents'
  and (
    private.can_access_tenant(private.storage_path_tenant_id(name))
    or (
      private.driver_app_can_access_freight(
        private.storage_path_tenant_id(name),
        private.storage_path_freight_id(name)
      )
      and owner_id = auth.uid()::text
    )
  )
);

-- Deterministic definition replacing the accumulated pg_get_functiondef/replace patches.
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
  v_tenant public.tenants;
  v_trip_cycle public.driver_trip_cycles;
  v_current_freight public.freights;
  v_driver_app_settings jsonb;
  v_driver_app_mode text;
  v_asset_assignment_mode text;
  v_expense_scope text;
  v_config jsonb;
  v_payload jsonb;
begin
  v_driver := private.current_driver();

  select * into v_tenant
  from public.tenants
  where id = v_driver.tenant_id
  limit 1;

  v_driver_app_settings := coalesce(
    v_tenant.settings->'driverApp',
    v_tenant.settings->'driver_app',
    '{}'::jsonb
  );
  v_driver_app_mode := coalesce(
    nullif(v_driver_app_settings->>'mode', ''),
    nullif(v_driver_app_settings->>'driverAppMode', ''),
    'single_freight'
  );
  if v_driver_app_mode not in ('single_freight', 'long_trip_multi_freight') then
    v_driver_app_mode := 'single_freight';
  end if;
  v_asset_assignment_mode := coalesce(
    nullif(v_driver_app_settings->>'assetAssignmentMode', ''),
    nullif(v_driver_app_settings->>'asset_assignment_mode', ''),
    'fixed_vehicle'
  );
  if v_asset_assignment_mode not in ('fixed_vehicle', 'manual_per_freight') then
    v_asset_assignment_mode := 'fixed_vehicle';
  end if;
  v_expense_scope := coalesce(
    nullif(v_driver_app_settings->>'expenseScope', ''),
    nullif(v_driver_app_settings->>'expense_scope', ''),
    'freight'
  );
  if v_expense_scope not in ('freight', 'trip') then
    v_expense_scope := 'freight';
  end if;
  v_config := jsonb_build_object(
    'driverAppMode', v_driver_app_mode,
    'assetAssignmentMode', v_asset_assignment_mode,
    'expenseScope', v_expense_scope
  );

  select * into v_profile
  from public.profiles
  where id = auth.uid()
  limit 1;

  select * into v_vehicle
  from public.vehicles
  where tenant_id = v_driver.tenant_id
    and (driver_id = v_driver.id or id = v_driver.vehicle_id)
  order by (current_freight_id is not null) desc, updated_at desc
  limit 1;

  if v_vehicle.current_freight_id is not null then
    select * into v_current_freight
    from public.freights f
    where f.tenant_id = v_driver.tenant_id
      and f.id = v_vehicle.current_freight_id
    limit 1;
  end if;

  if v_current_freight.trip_cycle_id is not null then
    select * into v_trip_cycle
    from public.driver_trip_cycles tc
    where tc.tenant_id = v_driver.tenant_id
      and tc.id = v_current_freight.trip_cycle_id
    limit 1;
  elsif v_driver_app_mode = 'long_trip_multi_freight' then
    select * into v_trip_cycle
    from public.driver_trip_cycles tc
    where tc.tenant_id = v_driver.tenant_id
      and tc.driver_id = v_driver.id
      and tc.status = 'open'
    order by tc.started_at desc
    limit 1;
  end if;

  select jsonb_build_object(
    'driver', to_jsonb(v_driver),
    'tenant', case when v_tenant.id is null then null else jsonb_build_object(
      'id', v_tenant.id,
      'slug', v_tenant.slug,
      'tradeName', v_tenant.trade_name,
      'legalName', v_tenant.legal_name
    ) end,
    'config', v_config,
    'tripCycle', case when v_trip_cycle.id is null then null else jsonb_build_object(
      'id', v_trip_cycle.id,
      'status', v_trip_cycle.status,
      'startedAt', v_trip_cycle.started_at,
      'closedAt', v_trip_cycle.closed_at,
      'startOdometer', v_trip_cycle.start_odometer,
      'endOdometer', v_trip_cycle.end_odometer,
      'odometerStartedAt', v_trip_cycle.odometer_started_at,
      'odometerEndedAt', v_trip_cycle.odometer_ended_at,
      'freightCount', (
        select count(*) from public.freights f
        where f.tenant_id = v_driver.tenant_id and f.trip_cycle_id = v_trip_cycle.id
      ),
      'completedFreightCount', (
        select count(*) from public.freights f
        where f.tenant_id = v_driver.tenant_id
          and f.trip_cycle_id = v_trip_cycle.id
          and f.lifecycle_status = 'completed'
      )
    ) end,
    'returnToYard', case
      when v_driver_app_mode = 'long_trip_multi_freight'
        and v_vehicle.id is not null
        and v_vehicle.current_freight_id is null
        and v_vehicle.status = 'rota-retornando'
        and coalesce(v_vehicle.freight_stage, '') = 'ENTREGA_FINALIZADA'
        and v_trip_cycle.id is not null
        and v_trip_cycle.status = 'open'
      then jsonb_build_object(
        'available', true,
        'vehicleId', v_vehicle.id,
        'tripCycleId', v_trip_cycle.id,
        'status', v_vehicle.status,
        'freightStage', v_vehicle.freight_stage,
        'label', 'Cheguei no patio'
      )
      else jsonb_build_object('available', false)
    end,
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
      where t.tenant_id = v_driver.tenant_id and t.id = v_vehicle.trailer_id
    ), '[]'::jsonb),
    'sender', case when v_vehicle.sender_id is null then null else (
      select to_jsonb(s) from public.senders s
      where s.tenant_id = v_driver.tenant_id and s.id = v_vehicle.sender_id
    ) end,
    'recipient', case when v_vehicle.recipient_id is null then null else (
      select to_jsonb(r) from public.recipients r
      where r.tenant_id = v_driver.tenant_id and r.id = v_vehicle.recipient_id
    ) end,
    'product', case when v_vehicle.product_id is null then null else (
      select to_jsonb(p) from public.products p
      where p.tenant_id = v_driver.tenant_id and p.id = v_vehicle.product_id
    ) end,
    'documents', coalesce((
      select jsonb_agg(
        to_jsonb(fd) || jsonb_build_object(
          'fileName', fd.file_name,
          'storageBucket', fd.storage_bucket,
          'storagePath', fd.storage_path,
          'mimeType', fd.mime_type,
          'sizeBytes', fd.size_bytes,
          'createdAt', fd.created_at,
          'updatedAt', fd.updated_at
        ) order by fd.created_at desc
      )
      from public.freight_documents fd
      where fd.tenant_id = v_driver.tenant_id
        and fd.vehicle_id = v_vehicle.id
        and fd.freight_id is not distinct from v_vehicle.current_freight_id
    ), '[]'::jsonb),
    'cashEntries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'origin', ce.origin,
        'businessPartnerId', ce.business_partner_id,
        'stationName', coalesce((
          select bp.trade_name from public.business_partners bp
          where bp.id = ce.business_partner_id and bp.tenant_id = ce.tenant_id
        ), ce.origin),
        'amount', ce.amount,
        'notes', ce.notes,
        'source', ce.source,
        'recordedAt', ce.recorded_at,
        'tripCycleId', ce.trip_cycle_id
      ) order by ce.recorded_at desc)
      from public.freight_cash_entries ce
      where ce.tenant_id = v_driver.tenant_id
        and (
          (v_expense_scope = 'trip' and v_trip_cycle.id is not null and ce.trip_cycle_id = v_trip_cycle.id)
          or (
            not (v_expense_scope = 'trip' and v_trip_cycle.id is not null)
            and ce.vehicle_id = v_vehicle.id
            and ce.freight_id is not distinct from v_vehicle.current_freight_id
          )
        )
    ), '[]'::jsonb),
    'dailyAllowance', public.get_driver_daily_allowance_context(),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fe.id,
        'category', fe.category,
        'description', fe.description,
        'amount', fe.amount,
        'notes', fe.notes,
        'fuelRecordId', fe.fuel_record_id,
        'paymentSource', fe.payment_source,
        'recordedAt', fe.recorded_at,
        'tripCycleId', fe.trip_cycle_id
      ) order by fe.recorded_at desc)
      from public.freight_expenses fe
      where fe.tenant_id = v_driver.tenant_id
        and fe.payment_source = 'trip_cash'
        and (
          (v_expense_scope = 'trip' and v_trip_cycle.id is not null and fe.trip_cycle_id = v_trip_cycle.id)
          or (
            not (v_expense_scope = 'trip' and v_trip_cycle.id is not null)
            and fe.vehicle_id = v_vehicle.id
            and fe.freight_id is not distinct from v_vehicle.current_freight_id
          )
        )
    ), '[]'::jsonb)
  ) into v_payload;

  return v_payload;
end;
$$;

revoke all on function public.get_driver_app_context() from public, anon, authenticated;
grant execute on function public.get_driver_app_context() to authenticated;

do $$
declare
  v_table text;
  v_tables constant text[] := array[
    'vehicles', 'drivers', 'trailers', 'senders', 'recipients', 'products',
    'vehicle_trailers', 'fleet_events', 'vehicle_positions', 'freight_documents',
    'manual_workflow_overrides', 'freights', 'driver_trip_cycles', 'fuel_records',
    'freight_expenses', 'driver_trip_daily_allowances', 'freight_cash_entries',
    'financial_documents', 'financial_integration_jobs'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array v_tables loop
      if to_regclass(format('public.%I', v_table)) is not null
        and not exists (
          select 1
          from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = v_table
        ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;

notify pgrst, 'reload schema';
