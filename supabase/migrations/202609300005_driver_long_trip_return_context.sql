-- Garante que o app motorista receba a etapa de retorno ao patio no tiro longo
-- quando a central solicita retorno apos o ultimo frete e nao ha frete ativo.

do $$
declare
  v_definition text;
  v_marker text := E'    ''profile'',';
begin
  v_definition := pg_get_functiondef('public.get_driver_app_context()'::regprocedure);

  if position('''returnToYard''' in v_definition) = 0 then
    if position(v_marker in v_definition) = 0 then
      raise exception 'GET_DRIVER_APP_CONTEXT_PROFILE_MARKER_NOT_FOUND';
    end if;

    v_definition := replace(
      v_definition,
      v_marker,
      E'    ''returnToYard'', case\n'
      || E'      when v_driver_app_mode = ''long_trip_multi_freight''\n'
      || E'        and v_vehicle.id is not null\n'
      || E'        and v_vehicle.current_freight_id is null\n'
      || E'        and v_vehicle.status = ''rota-retornando''\n'
      || E'        and coalesce(v_vehicle.freight_stage, '''') = ''ENTREGA_FINALIZADA''\n'
      || E'        and v_trip_cycle.id is not null\n'
      || E'        and v_trip_cycle.status = ''open''\n'
      || E'      then jsonb_build_object(\n'
      || E'        ''available'', true,\n'
      || E'        ''vehicleId'', v_vehicle.id,\n'
      || E'        ''tripCycleId'', v_trip_cycle.id,\n'
      || E'        ''status'', v_vehicle.status,\n'
      || E'        ''freightStage'', v_vehicle.freight_stage,\n'
      || E'        ''label'', ''Cheguei no patio''\n'
      || E'      )\n'
      || E'      else jsonb_build_object(''available'', false)\n'
      || E'    end,\n'
      || v_marker
    );

    execute v_definition;
  end if;
end;
$$;

notify pgrst, 'reload schema';
