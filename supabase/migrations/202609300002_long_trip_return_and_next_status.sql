-- Corrige fluxo do tiro longo:
-- 1. Proximo trecho planejado entra no fluxo normal de carregamento.
-- 2. Retorno ao patio fica explicito no contexto do app motorista apos comando da central.

create or replace function private.activate_next_long_trip_freight(
  p_tenant_id uuid,
  p_trip_cycle_id uuid,
  p_vehicle_id uuid,
  p_driver_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_next public.freights;
begin
  if p_tenant_id is null or p_trip_cycle_id is null or p_vehicle_id is null or p_driver_id is null then
    return null;
  end if;

  select *
    into v_next
  from public.freights
  where tenant_id = p_tenant_id
    and trip_cycle_id = p_trip_cycle_id
    and vehicle_id = p_vehicle_id
    and driver_id = p_driver_id
    and lifecycle_status = 'planned'
  order by coalesce(trip_sequence, 2147483647), created_at
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.freights
  set lifecycle_status = 'active',
      operational_status = 'rota-carregar',
      freight_stage = 'EM_ROTA_CARREGAR',
      started_at = coalesce(started_at, now()),
      activated_at = now(),
      snapshot = snapshot || jsonb_build_object('long_trip_kind', 'active_segment'),
      updated_at = now()
  where id = v_next.id
    and tenant_id = p_tenant_id;

  update public.vehicles
  set current_freight_id = v_next.id,
      driver_id = p_driver_id,
      trailer_id = v_next.primary_trailer_id,
      sender_id = v_next.sender_id,
      recipient_id = v_next.recipient_id,
      product_id = v_next.product_id,
      freight_value = v_next.freight_value,
      freight_pricing_mode = v_next.freight_pricing_mode,
      freight_ton_price = v_next.freight_ton_price,
      unloaded_tons = null,
      freight_tax_rate = v_next.freight_tax_rate,
      status = 'rota-carregar',
      vehicle_situation = 'em-rota',
      freight_stage = 'EM_ROTA_CARREGAR',
      workflow_flags = jsonb_set(coalesce(workflow_flags, '{}'::jsonb), '{pending_documents}', '[]'::jsonb, true),
      last_transition_source = 'system',
      last_transition_at = now(),
      updated_at = now()
  where id = p_vehicle_id
    and tenant_id = p_tenant_id;

  insert into public.fleet_events (
    tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
    source, description, event_type, action_origin, metadata
  )
  select
    v.tenant_id, v.id, v_next.id, v.status, v.freight_stage, v.city, v.state,
    'Sistema', 'Proximo frete do tiro longo iniciado em rota para carregamento.',
    'long_trip_next_freight_activated', 'system',
    jsonb_build_object('trip_cycle_id', p_trip_cycle_id, 'driver_id', p_driver_id)
  from public.vehicles v
  where v.id = p_vehicle_id;

  return v_next.id;
end;
$$;

do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('public.get_driver_app_context()'::regprocedure);

  if position('''returnToYard''' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      E'    ) end,\n    ''profile'',',
      E'    ) end,\n    ''returnToYard'', case\n      when v_driver_app_mode = ''long_trip_multi_freight''\n        and v_vehicle.id is not null\n        and v_vehicle.current_freight_id is null\n        and v_vehicle.status = ''rota-retornando''\n        and coalesce(v_vehicle.freight_stage, '''') = ''ENTREGA_FINALIZADA''\n        and v_trip_cycle.id is not null\n        and v_trip_cycle.status = ''open''\n      then jsonb_build_object(\n        ''available'', true,\n        ''vehicleId'', v_vehicle.id,\n        ''tripCycleId'', v_trip_cycle.id,\n        ''status'', v_vehicle.status,\n        ''freightStage'', v_vehicle.freight_stage,\n        ''label'', ''Cheguei no patio''\n      )\n      else jsonb_build_object(''available'', false)\n    end,\n    ''profile'','
    );
    execute v_definition;
  end if;
end;
$$;

do $$
declare
  v_row record;
begin
  for v_row in
    select tc.tenant_id, tc.id as trip_cycle_id, tc.driver_id, coalesce(tc.vehicle_id, d.vehicle_id) as vehicle_id
    from public.driver_trip_cycles tc
    join public.drivers d on d.id = tc.driver_id and d.tenant_id = tc.tenant_id
    join public.vehicles v
      on v.tenant_id = tc.tenant_id
     and v.id = coalesce(tc.vehicle_id, d.vehicle_id)
    where tc.status = 'open'
      and v.current_freight_id is null
      and v.status = 'parado-aguardando-comando'
      and exists (
        select 1
        from public.freights f
        where f.tenant_id = tc.tenant_id
          and f.trip_cycle_id = tc.id
          and f.vehicle_id = v.id
          and f.driver_id = tc.driver_id
          and f.lifecycle_status = 'planned'
      )
  loop
    perform private.activate_next_long_trip_freight(
      v_row.tenant_id,
      v_row.trip_cycle_id,
      v_row.vehicle_id,
      v_row.driver_id
    );
  end loop;
end;
$$;

revoke all on function private.activate_next_long_trip_freight(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
