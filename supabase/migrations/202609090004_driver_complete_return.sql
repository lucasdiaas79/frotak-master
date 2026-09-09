-- Frotak - app motorista: finalizacao do retorno ao patio pelo proprio motorista.

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

  insert into public.freight_history (
    tenant_id, freight_id, vehicle_id, driver_id, trailer_id, sender_id,
    recipient_id, product_id, vehicle_plate, freight_value, freight_pricing_mode,
    freight_ton_price, unloaded_tons, finish_reason, final_status, final_freight_stage
  )
  values (
    v_vehicle.tenant_id, v_vehicle.current_freight_id, v_vehicle.id, v_vehicle.driver_id,
    v_vehicle.trailer_id, v_vehicle.sender_id, v_vehicle.recipient_id, v_vehicle.product_id,
    v_vehicle.plate, v_vehicle.freight_value, v_vehicle.freight_pricing_mode,
    v_vehicle.freight_ton_price, v_vehicle.unloaded_tons, 'retorno_confirmado_motorista',
    v_vehicle.status, v_vehicle.freight_stage
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
    'driver_app', jsonb_build_object('driver_id', v_driver.id, 'history_id', v_history_id)
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
