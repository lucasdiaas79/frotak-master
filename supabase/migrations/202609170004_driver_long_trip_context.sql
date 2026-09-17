-- Frotak - Fase 4 JO Transportes: app motorista consome viagem longa multi-frete.

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

  if v_vehicle.current_freight_id is not null then
    select *
      into v_current_freight
    from public.freights f
    where f.tenant_id = v_vehicle.tenant_id
      and f.id = v_vehicle.current_freight_id
    limit 1;
  end if;

  if v_current_freight.trip_cycle_id is not null then
    select *
      into v_trip_cycle
    from public.driver_trip_cycles tc
    where tc.tenant_id = v_driver.tenant_id
      and tc.id = v_current_freight.trip_cycle_id
    limit 1;
  elsif v_driver_app_mode = 'long_trip_multi_freight' then
    select *
      into v_trip_cycle
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
      'freightCount', (
        select count(*)
        from public.freights f
        where f.tenant_id = v_driver.tenant_id
          and f.trip_cycle_id = v_trip_cycle.id
      ),
      'completedFreightCount', (
        select count(*)
        from public.freights f
        where f.tenant_id = v_driver.tenant_id
          and f.trip_cycle_id = v_trip_cycle.id
          and f.lifecycle_status = 'completed'
      )
    ) end,
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
        'recordedAt', ce.recorded_at,
        'tripCycleId', ce.trip_cycle_id
      ) order by ce.recorded_at desc)
      from public.freight_cash_entries ce
      where ce.tenant_id = v_driver.tenant_id
        and (
          (
            v_expense_scope = 'trip'
            and v_trip_cycle.id is not null
            and ce.trip_cycle_id = v_trip_cycle.id
          )
          or (
            not (v_expense_scope = 'trip' and v_trip_cycle.id is not null)
            and ce.vehicle_id = v_vehicle.id
            and ce.freight_id is not distinct from v_vehicle.current_freight_id
          )
        )
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fe.id,
        'category', fe.category,
        'description', fe.description,
        'amount', fe.amount,
        'notes', fe.notes,
        'fuelRecordId', fe.fuel_record_id,
        'recordedAt', fe.recorded_at,
        'tripCycleId', fe.trip_cycle_id
      ) order by fe.recorded_at desc)
      from public.freight_expenses fe
      where fe.tenant_id = v_driver.tenant_id
        and (
          (
            v_expense_scope = 'trip'
            and v_trip_cycle.id is not null
            and fe.trip_cycle_id = v_trip_cycle.id
          )
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

create or replace function public.driver_app_advance_stage(
  p_vehicle_id uuid,
  p_target_stage text default null,
  p_unloaded_tons numeric default null
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
  v_unloaded_tons numeric;
  v_calculated_value numeric;
  v_trip_cycle_id uuid;
  v_history_id uuid;
  v_is_long_trip boolean;
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

  v_is_long_trip := private.tenant_driver_app_mode(v_vehicle.tenant_id) = 'long_trip_multi_freight';

  select f.trip_cycle_id
    into v_trip_cycle_id
  from public.freights f
  where f.tenant_id = v_vehicle.tenant_id
    and f.id = v_vehicle.current_freight_id
  limit 1;

  v_from_status := v_vehicle.status;
  v_from_stage := coalesce(v_vehicle.freight_stage, 'DISPONIVEL');

  if p_target_stage is not null then
    case p_target_stage
      when 'EM_ROTA_CARREGAR' then
        if v_from_stage <> 'DISPONIVEL' then raise exception 'target stage not allowed for current driver stage'; end if;
      when 'AGUARDANDO_NOTA' then
        if v_from_stage <> 'EM_ROTA_CARREGAR' then raise exception 'target stage not allowed for current driver stage'; end if;
      when 'NOTA_EM_CONFERENCIA' then
        if v_from_stage <> 'AGUARDANDO_NOTA' then raise exception 'target stage not allowed for current driver stage'; end if;
      when 'EM_ROTA_ENTREGA' then
        if v_from_stage <> 'CTE_GERADA_AG_CONFIRMACAO_MOTORISTA' then raise exception 'target stage not allowed for current driver stage'; end if;
      when 'ENTREGUE_AG_FINALIZACAO' then
        if v_from_stage <> 'EM_ROTA_ENTREGA' then raise exception 'target stage not allowed for current driver stage'; end if;
      when 'ENTREGA_FINALIZADA' then
        if v_from_stage <> 'ENTREGUE_AG_FINALIZACAO' then raise exception 'target stage not allowed for current driver stage'; end if;
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

  if v_next_stage = 'ENTREGA_FINALIZADA' then
    v_unloaded_tons := p_unloaded_tons;
    if v_unloaded_tons is null or v_unloaded_tons <= 0 then
      raise exception 'unloaded tons required before finishing delivery';
    end if;
    if v_vehicle.freight_pricing_mode = 'per_ton' then
      if v_vehicle.freight_ton_price is null or v_vehicle.freight_ton_price <= 0 then
        raise exception 'freight ton price missing';
      end if;
      v_calculated_value := round((v_vehicle.freight_ton_price * v_unloaded_tons)::numeric, 2);
    end if;
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
    unloaded_tons = case when v_next_stage = 'ENTREGA_FINALIZADA' then v_unloaded_tons else unloaded_tons end,
    freight_value = case
      when v_next_stage = 'ENTREGA_FINALIZADA' and v_calculated_value is not null then v_calculated_value
      else freight_value
    end,
    workflow_flags = case
      when v_next_stage = 'NOTA_EM_CONFERENCIA' then jsonb_set(coalesce(workflow_flags, '{}'::jsonb), '{pending_documents}', '["cte_mdfe"]'::jsonb, true)
      when v_next_stage = 'EM_ROTA_ENTREGA' then jsonb_set(coalesce(workflow_flags, '{}'::jsonb), '{pending_documents}', '[]'::jsonb, true)
      else coalesce(workflow_flags, '{}'::jsonb)
    end,
    last_transition_source = 'driver_app',
    last_transition_by = auth.uid(),
    last_transition_at = now(),
    updated_at = now()
  where id = v_vehicle.id
  returning * into v_vehicle;

  if v_next_stage = 'ENTREGA_FINALIZADA' then
    update public.freights
    set unloaded_tons = v_unloaded_tons,
        freight_value = coalesce(v_calculated_value, freight_value),
        snapshot = snapshot || jsonb_build_object(
          'unloaded_tons', v_unloaded_tons,
          'freight_pricing_mode', v_vehicle.freight_pricing_mode,
          'freight_ton_price', v_vehicle.freight_ton_price
        ),
        updated_at = now()
    where id = v_vehicle.current_freight_id
      and tenant_id = v_vehicle.tenant_id;
  end if;

  insert into public.fleet_events (
    tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
    source, description, created_by, event_type, action_origin, metadata
  )
  values (
    v_vehicle.tenant_id, v_vehicle.id, v_vehicle.current_freight_id, v_vehicle.status,
    v_vehicle.freight_stage, v_vehicle.city, v_vehicle.state, 'Motorista', v_description,
    auth.uid(), v_event_type, 'driver_app',
    jsonb_strip_nulls(jsonb_build_object(
      'driver_id', v_driver.id,
      'from_status', v_from_status,
      'to_status', v_next_status,
      'from_freight_stage', v_from_stage,
      'to_freight_stage', v_next_stage,
      'unloaded_tons', v_unloaded_tons,
      'calculated_freight_value', v_calculated_value,
      'trip_cycle_id', v_trip_cycle_id
    ))
  );

  if v_is_long_trip and v_next_stage = 'ENTREGA_FINALIZADA' then
    insert into public.freight_history (
      tenant_id, freight_id, trip_cycle_id, vehicle_id, driver_id, trailer_id, sender_id,
      recipient_id, product_id, vehicle_plate, freight_value, freight_pricing_mode,
      freight_ton_price, unloaded_tons, freight_tax_rate, finish_reason,
      final_status, final_freight_stage
    )
    values (
      v_vehicle.tenant_id, v_vehicle.current_freight_id, v_trip_cycle_id, v_vehicle.id,
      v_vehicle.driver_id, v_vehicle.trailer_id, v_vehicle.sender_id, v_vehicle.recipient_id,
      v_vehicle.product_id, v_vehicle.plate, v_vehicle.freight_value, v_vehicle.freight_pricing_mode,
      v_vehicle.freight_ton_price, v_vehicle.unloaded_tons, v_vehicle.freight_tax_rate,
      'frete_concluido_viagem_longa', v_vehicle.status, v_vehicle.freight_stage
    )
    returning id into v_history_id;

    insert into public.fleet_events (
      tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
      source, description, created_by, event_type, action_origin, metadata
    )
    values (
      v_vehicle.tenant_id, v_vehicle.id, v_vehicle.current_freight_id,
      'parado-aguardando-comando', 'DISPONIVEL', v_vehicle.city, v_vehicle.state,
      'Motorista', 'Frete concluido dentro da viagem longa. Motorista aguardando proximo comando.',
      auth.uid(), 'driver_long_trip_freight_closed', 'driver_app',
      jsonb_build_object(
        'driver_id', v_driver.id,
        'history_id', v_history_id,
        'trip_cycle_id', v_trip_cycle_id
      )
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
      status = 'parado-aguardando-comando',
      vehicle_situation = 'parado',
      freight_stage = 'DISPONIVEL',
      workflow_flags = jsonb_set(coalesce(workflow_flags, '{}'::jsonb), '{pending_documents}', '[]'::jsonb, true),
      last_transition_source = 'driver_app',
      last_transition_by = auth.uid(),
      last_transition_at = now(),
      updated_at = now()
    where id = v_vehicle.id;
  end if;

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_advance_stage(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.driver_app_advance_stage(uuid, text, numeric) to authenticated;

notify pgrst, 'reload schema';
