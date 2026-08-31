create or replace function public.driver_app_advance_stage(
  p_vehicle_id uuid,
  p_target_stage text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_from_status text;
  v_from_stage text;
  v_next_stage text;
  v_next_status text;
  v_next_situation text;
  v_event_type text;
  v_description text;
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

  v_from_status := v_vehicle.status;
  v_from_stage := coalesce(v_vehicle.freight_stage, 'DISPONIVEL');

  if p_target_stage is not null then
    case p_target_stage
      when 'EM_ROTA_CARREGAR' then
        if v_from_stage <> 'DISPONIVEL' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      when 'AGUARDANDO_NOTA' then
        if v_from_stage <> 'EM_ROTA_CARREGAR' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      when 'NOTA_EM_CONFERENCIA' then
        if v_from_stage <> 'AGUARDANDO_NOTA' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      when 'EM_ROTA_ENTREGA' then
        if v_from_stage <> 'CTE_GERADA_AG_CONFIRMACAO_MOTORISTA' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      when 'ENTREGUE_AG_FINALIZACAO' then
        if v_from_stage <> 'EM_ROTA_ENTREGA' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      when 'ENTREGA_FINALIZADA' then
        if v_from_stage <> 'ENTREGUE_AG_FINALIZACAO' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      when 'DISPONIVEL' then
        if v_from_stage <> 'ENTREGA_FINALIZADA' or v_vehicle.status <> 'rota-retornando' then
          raise exception 'target stage not allowed for current driver stage';
        end if;
      else
        raise exception 'target stage not allowed for driver';
    end case;
  end if;

  v_next_stage := coalesce(
    p_target_stage,
    case v_from_stage
      when 'DISPONIVEL' then 'EM_ROTA_CARREGAR'
      when 'EM_ROTA_CARREGAR' then 'AGUARDANDO_NOTA'
      when 'AGUARDANDO_NOTA' then 'NOTA_EM_CONFERENCIA'
      when 'CTE_GERADA_AG_CONFIRMACAO_MOTORISTA' then 'EM_ROTA_ENTREGA'
      when 'EM_ROTA_ENTREGA' then 'ENTREGUE_AG_FINALIZACAO'
      when 'ENTREGUE_AG_FINALIZACAO' then 'ENTREGA_FINALIZADA'
      when 'ENTREGA_FINALIZADA' then
        case when v_vehicle.status = 'rota-retornando' then 'DISPONIVEL' else null end
      else null
    end
  );

  if v_next_stage is null then
    raise exception 'stage cannot be advanced by driver';
  end if;

  if v_next_stage = 'NOTA_EM_CONFERENCIA' and not exists (
    select 1
    from public.freight_documents fd
    where fd.tenant_id = v_vehicle.tenant_id
      and fd.vehicle_id = v_vehicle.id
      and fd.freight_id = v_vehicle.current_freight_id
      and fd.kind = 'nota_fiscal'
      and coalesce(fd.status, 'anexado') not in ('rejeitado', 'rejected', 'deleted', 'excluido')
  ) then
    raise exception 'nota fiscal required before advancing';
  end if;

  if v_next_stage = 'ENTREGA_FINALIZADA' and not exists (
    select 1
    from public.freight_documents fd
    where fd.tenant_id = v_vehicle.tenant_id
      and fd.vehicle_id = v_vehicle.id
      and fd.freight_id = v_vehicle.current_freight_id
      and fd.kind in ('comprovante_entrega', 'comprovante_descarga', 'canhoto', 'recibo')
      and coalesce(fd.status, 'anexado') not in ('rejeitado', 'rejected', 'deleted', 'excluido')
  ) then
    raise exception 'delivery receipt required before advancing';
  end if;

  if v_next_stage = 'DISPONIVEL' then
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
      'disponivel-patio',
      'DISPONIVEL',
      v_vehicle.city,
      v_vehicle.state,
      'Motorista',
      'Chegada ao patio confirmada pelo motorista',
      auth.uid(),
      'driver_arrived_yard',
      'driver_app',
      jsonb_build_object(
        'driver_id', v_driver.id,
        'from_status', v_from_status,
        'to_status', 'disponivel-patio',
        'from_freight_stage', v_from_stage,
        'to_freight_stage', 'DISPONIVEL'
      )
    );

    perform public.archive_vehicle_freight(v_vehicle.id, 'retorno_ao_patio_concluido', true);
    return public.get_driver_app_context();
  end if;

  v_next_status := case v_next_stage
    when 'EM_ROTA_CARREGAR' then 'rota-carregar'
    when 'AGUARDANDO_NOTA' then 'parado-aguardando-carga'
    when 'NOTA_EM_CONFERENCIA' then 'parado-aguardando-carga'
    when 'EM_ROTA_ENTREGA' then 'rota-descarregar'
    when 'ENTREGUE_AG_FINALIZACAO' then 'parado-descarregando'
    when 'ENTREGA_FINALIZADA' then 'parado-aguardando-comando'
    else v_vehicle.status
  end;

  v_next_situation := case
    when v_next_status in ('rota-carregar', 'rota-descarregar', 'rota-retornando') then 'em-rota'
    when v_next_status = 'parado-quebrado' then 'quebrado'
    when v_next_status in ('manutencao', 'disponivel-oficina') then 'manutencao'
    when v_next_status = 'disponivel-patio' then 'disponivel-patio'
    else 'parado'
  end;

  v_event_type := case v_next_stage
    when 'EM_ROTA_CARREGAR' then 'driver_freight_accepted'
    when 'AGUARDANDO_NOTA' then 'driver_arrived_sender'
    when 'NOTA_EM_CONFERENCIA' then 'driver_invoice_sent'
    when 'EM_ROTA_ENTREGA' then 'driver_documents_confirmed'
    when 'ENTREGUE_AG_FINALIZACAO' then 'driver_arrived_recipient'
    when 'ENTREGA_FINALIZADA' then 'driver_delivery_completed'
    else 'driver_stage_confirmed'
  end;

  v_description := case v_next_stage
    when 'EM_ROTA_CARREGAR' then 'Demanda aceita pelo motorista'
    when 'AGUARDANDO_NOTA' then 'Chegada ao remetente confirmada pelo motorista'
    when 'NOTA_EM_CONFERENCIA' then 'Carregamento confirmado e nota enviada pelo motorista'
    when 'EM_ROTA_ENTREGA' then 'Documentos confirmados pelo motorista'
    when 'ENTREGUE_AG_FINALIZACAO' then 'Chegada ao destinatario confirmada pelo motorista'
    when 'ENTREGA_FINALIZADA' then 'Descarga concluida pelo motorista'
    else 'Etapa confirmada pelo aplicativo do motorista'
  end;

  update public.vehicles
  set
    status = v_next_status,
    vehicle_situation = v_next_situation,
    freight_stage = v_next_stage,
    workflow_flags = case
      when v_next_stage = 'NOTA_EM_CONFERENCIA' then jsonb_set(
        coalesce(workflow_flags, '{}'::jsonb),
        '{pending_documents}',
        '["cte_mdfe"]'::jsonb,
        true
      )
      when v_next_stage = 'EM_ROTA_ENTREGA' then jsonb_set(
        coalesce(workflow_flags, '{}'::jsonb),
        '{pending_documents}',
        '[]'::jsonb,
        true
      )
      else coalesce(workflow_flags, '{}'::jsonb)
    end,
    last_transition_source = 'driver_app',
    last_transition_by = auth.uid(),
    last_transition_at = now(),
    updated_at = now()
  where id = v_vehicle.id
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
    v_description,
    auth.uid(),
    v_event_type,
    'driver_app',
    jsonb_build_object(
      'driver_id', v_driver.id,
      'from_status', v_from_status,
      'to_status', v_next_status,
      'from_freight_stage', v_from_stage,
      'to_freight_stage', v_next_stage
    )
  );

  return public.get_driver_app_context();
end;
$$;

grant execute on function public.driver_app_advance_stage(uuid, text) to authenticated;
grant execute on function public.driver_app_advance_stage(uuid, text) to service_role;
