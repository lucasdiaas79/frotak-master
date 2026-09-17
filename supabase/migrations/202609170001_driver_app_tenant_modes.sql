update public.tenants
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
  'driverApp',
  jsonb_build_object(
    'mode', 'single_freight',
    'assetAssignmentMode', 'fixed_vehicle',
    'expenseScope', 'freight'
  )
)
where not (coalesce(settings, '{}'::jsonb) ? 'driverApp');

update public.tenants
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
  'driverApp',
  jsonb_build_object(
    'mode', 'long_trip_multi_freight',
    'assetAssignmentMode', 'manual_per_freight',
    'expenseScope', 'trip'
  )
)
where slug = 'jo-transportes';

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
  v_driver_app_settings jsonb;
  v_driver_app_mode text;
  v_asset_assignment_mode text;
  v_expense_scope text;
  v_config jsonb;
  v_payload jsonb;
begin
  v_driver := private.current_driver();

  select *
    into v_tenant
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
    'tenant', case when v_tenant.id is null then null else jsonb_build_object(
      'id', v_tenant.id,
      'slug', v_tenant.slug,
      'tradeName', v_tenant.trade_name,
      'legalName', v_tenant.legal_name
    ) end,
    'config', v_config,
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
