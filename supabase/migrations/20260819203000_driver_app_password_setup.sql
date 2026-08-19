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
  where driver_id = v_driver.id
    and tenant_id = v_driver.tenant_id
  order by updated_at desc
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
      select jsonb_agg(to_jsonb(t) order by vt.position)
      from public.vehicle_trailers vt
      join public.trailers t on t.id = vt.trailer_id
      where vt.vehicle_id = v_vehicle.id
        and vt.active = true
    ), '[]'::jsonb),
    'sender', case when v_vehicle.sender_id is null then null else (
      select to_jsonb(s) from public.senders s where s.id = v_vehicle.sender_id
    ) end,
    'recipient', case when v_vehicle.recipient_id is null then null else (
      select to_jsonb(r) from public.recipients r where r.id = v_vehicle.recipient_id
    ) end,
    'product', case when v_vehicle.product_id is null then null else (
      select to_jsonb(p) from public.products p where p.id = v_vehicle.product_id
    ) end,
    'documents', coalesce((
      select jsonb_agg(to_jsonb(fd) order by fd.created_at desc)
      from public.freight_documents fd
      where fd.vehicle_id = v_vehicle.id
        and fd.freight_id is not distinct from v_vehicle.current_freight_id
    ), '[]'::jsonb)
  ) into v_payload;

  return v_payload;
end;
$$;

revoke all on function public.get_driver_app_context() from public, anon, authenticated;
grant execute on function public.get_driver_app_context() to authenticated;

create or replace function public.driver_app_complete_password_setup()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.current_driver();

  update public.profiles
  set
    must_change_password = false,
    updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'profile not found for authenticated driver';
  end if;

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_complete_password_setup() from public, anon, authenticated;
grant execute on function public.driver_app_complete_password_setup() to authenticated;
