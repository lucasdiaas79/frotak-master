-- Media de consumo por tiro longo:
-- - odometro inicial/final no ciclo
-- - abastecimentos vinculados diretamente ao frete/ciclo
-- - app motorista informa KM ao iniciar e ao chegar no patio

alter table public.driver_trip_cycles
  add column if not exists start_odometer numeric,
  add column if not exists end_odometer numeric,
  add column if not exists odometer_started_at timestamptz,
  add column if not exists odometer_ended_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'driver_trip_cycles_odometer_order_chk'
      and conrelid = 'public.driver_trip_cycles'::regclass
  ) then
    alter table public.driver_trip_cycles
      add constraint driver_trip_cycles_odometer_order_chk
      check (
        start_odometer is null
        or end_odometer is null
        or end_odometer >= start_odometer
      );
  end if;
end;
$$;

alter table public.fuel_records
  add column if not exists freight_id uuid references public.freights(id) on delete set null,
  add column if not exists trip_cycle_id uuid references public.driver_trip_cycles(id) on delete set null;

create index if not exists fuel_records_freight_id_idx
  on public.fuel_records(freight_id);

create index if not exists fuel_records_trip_cycle_id_idx
  on public.fuel_records(trip_cycle_id);

update public.fuel_records fr
set freight_id = coalesce(fr.freight_id, fe.freight_id),
    trip_cycle_id = coalesce(fr.trip_cycle_id, fe.trip_cycle_id)
from public.freight_expenses fe
where fe.fuel_record_id = fr.id
  and fe.tenant_id = fr.tenant_id
  and (fr.freight_id is null or fr.trip_cycle_id is null);

do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('public.get_driver_app_context()'::regprocedure);

  if position('''startOdometer''' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '''closedAt'', v_trip_cycle.closed_at,',
      '''closedAt'', v_trip_cycle.closed_at,
      ''startOdometer'', v_trip_cycle.start_odometer,
      ''endOdometer'', v_trip_cycle.end_odometer,
      ''odometerStartedAt'', v_trip_cycle.odometer_started_at,
      ''odometerEndedAt'', v_trip_cycle.odometer_ended_at,'
    );
    execute v_definition;
  end if;
end;
$$;

drop function if exists public.driver_app_register_fuel_document(
  text, numeric, numeric, numeric, numeric, numeric, text, text,
  uuid, text, text, text, text, bigint,
  uuid, text, text, text, text, bigint
);

create or replace function public.driver_app_register_fuel_document(
  p_station text,
  p_odometer numeric,
  p_diesel_liters numeric default null,
  p_diesel_amount numeric default null,
  p_arla_liters numeric default null,
  p_arla_amount numeric default null,
  p_notes text default null,
  p_payment_method text default null,
  p_pump_photo_id uuid default null,
  p_pump_photo_file_name text default null,
  p_pump_photo_storage_bucket text default null,
  p_pump_photo_storage_path text default null,
  p_pump_photo_mime_type text default null,
  p_pump_photo_size_bytes bigint default null,
  p_receipt_photo_id uuid default null,
  p_receipt_photo_file_name text default null,
  p_receipt_photo_storage_bucket text default null,
  p_receipt_photo_storage_path text default null,
  p_receipt_photo_mime_type text default null,
  p_receipt_photo_size_bytes bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_document public.fuel_documents;
  v_record public.fuel_records;
  v_expense public.freight_expenses;
  v_trip_cycle_id uuid;
  v_diesel_liters numeric := coalesce(p_diesel_liters, 0);
  v_diesel_amount numeric := coalesce(p_diesel_amount, 0);
  v_arla_liters numeric := coalesce(p_arla_liters, 0);
  v_arla_amount numeric := coalesce(p_arla_amount, 0);
  v_record_ids uuid[] := '{}';
  v_expense_ids uuid[] := '{}';
begin
  v_driver := private.current_driver();

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

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;

  if v_vehicle.current_freight_id is null then
    raise exception 'active freight not found for authenticated driver';
  end if;

  if nullif(trim(coalesce(p_station, '')), '') is null then
    raise exception 'station is required';
  end if;

  if coalesce(p_odometer, 0) <= 0 then
    raise exception 'odometer is required';
  end if;

  if v_diesel_liters < 0 or v_diesel_amount < 0 or v_arla_liters < 0 or v_arla_amount < 0 then
    raise exception 'fuel values cannot be negative';
  end if;

  if (v_diesel_liters > 0 and v_diesel_amount <= 0) or (v_diesel_liters <= 0 and v_diesel_amount > 0) then
    raise exception 'diesel liters and amount must be filled together';
  end if;

  if (v_arla_liters > 0 and v_arla_amount <= 0) or (v_arla_liters <= 0 and v_arla_amount > 0) then
    raise exception 'arla liters and amount must be filled together';
  end if;

  if (v_diesel_liters <= 0 or v_diesel_amount <= 0) and (v_arla_liters <= 0 or v_arla_amount <= 0) then
    raise exception 'at least one fuel item is required';
  end if;

  v_trip_cycle_id := private.trip_cycle_for_freight(v_vehicle.tenant_id, v_vehicle.current_freight_id);

  insert into public.fuel_documents (
    tenant_id, vehicle_id, driver_id, vehicle_plate, driver_name, station,
    payment_method, odometer, diesel_liters, diesel_amount, arla_liters,
    arla_amount, notes, source
  )
  values (
    v_vehicle.tenant_id, v_vehicle.id, v_driver.id, v_vehicle.plate, v_driver.name,
    trim(p_station), nullif(trim(coalesce(p_payment_method, '')), ''), p_odometer,
    v_diesel_liters, v_diesel_amount, v_arla_liters, v_arla_amount,
    nullif(trim(coalesce(p_notes, '')), ''), 'driver_app'
  )
  returning * into v_document;

  if p_pump_photo_id is not null and nullif(trim(coalesce(p_pump_photo_storage_path, '')), '') is not null then
    insert into public.fuel_document_files (
      id, tenant_id, fuel_document_id, kind, file_name, storage_bucket,
      storage_path, mime_type, size_bytes
    )
    values (
      p_pump_photo_id, v_vehicle.tenant_id, v_document.id, 'pump_photo',
      coalesce(nullif(trim(coalesce(p_pump_photo_file_name, '')), ''), 'foto-bomba'),
      coalesce(nullif(trim(coalesce(p_pump_photo_storage_bucket, '')), ''), 'driver-fuel-documents'),
      trim(p_pump_photo_storage_path), nullif(trim(coalesce(p_pump_photo_mime_type, '')), ''),
      p_pump_photo_size_bytes
    );
  end if;

  if p_receipt_photo_id is not null and nullif(trim(coalesce(p_receipt_photo_storage_path, '')), '') is not null then
    insert into public.fuel_document_files (
      id, tenant_id, fuel_document_id, kind, file_name, storage_bucket,
      storage_path, mime_type, size_bytes
    )
    values (
      p_receipt_photo_id, v_vehicle.tenant_id, v_document.id, 'receipt_photo',
      coalesce(nullif(trim(coalesce(p_receipt_photo_file_name, '')), ''), 'foto-cupom'),
      coalesce(nullif(trim(coalesce(p_receipt_photo_storage_bucket, '')), ''), 'driver-fuel-documents'),
      trim(p_receipt_photo_storage_path), nullif(trim(coalesce(p_receipt_photo_mime_type, '')), ''),
      p_receipt_photo_size_bytes
    );
  end if;

  if v_diesel_liters > 0 and v_diesel_amount > 0 then
    insert into public.fuel_records (
      tenant_id, vehicle_id, driver_id, freight_id, trip_cycle_id, vehicle_plate,
      driver_name, station, fuel_type, liters, amount, odometer, notes,
      invoice_file_name, storage_bucket, storage_path, mime_type, size_bytes,
      fuel_document_id
    )
    values (
      v_vehicle.tenant_id, v_vehicle.id, v_driver.id, v_vehicle.current_freight_id,
      v_trip_cycle_id, v_vehicle.plate, v_driver.name, trim(p_station), 'diesel_s10',
      v_diesel_liters, v_diesel_amount, p_odometer, nullif(trim(coalesce(p_notes, '')), ''),
      p_receipt_photo_file_name, p_receipt_photo_storage_bucket, p_receipt_photo_storage_path,
      p_receipt_photo_mime_type, p_receipt_photo_size_bytes, v_document.id
    )
    returning * into v_record;

    v_record_ids := array_append(v_record_ids, v_record.id);

    insert into public.freight_expenses (
      tenant_id, freight_id, trip_cycle_id, vehicle_id, driver_id, fuel_record_id,
      category, description, amount, notes, source, recorded_by
    )
    values (
      v_vehicle.tenant_id, v_vehicle.current_freight_id, v_trip_cycle_id, v_vehicle.id,
      v_driver.id, v_record.id, 'diesel_s10', 'Diesel S10', v_diesel_amount,
      nullif(trim(coalesce(p_notes, '')), ''), 'driver_app', auth.uid()
    )
    returning * into v_expense;

    v_expense_ids := array_append(v_expense_ids, v_expense.id);
  end if;

  if v_arla_liters > 0 and v_arla_amount > 0 then
    insert into public.fuel_records (
      tenant_id, vehicle_id, driver_id, freight_id, trip_cycle_id, vehicle_plate,
      driver_name, station, fuel_type, liters, amount, odometer, notes,
      invoice_file_name, storage_bucket, storage_path, mime_type, size_bytes,
      fuel_document_id
    )
    values (
      v_vehicle.tenant_id, v_vehicle.id, v_driver.id, v_vehicle.current_freight_id,
      v_trip_cycle_id, v_vehicle.plate, v_driver.name, trim(p_station), 'arla',
      v_arla_liters, v_arla_amount, p_odometer, nullif(trim(coalesce(p_notes, '')), ''),
      p_receipt_photo_file_name, p_receipt_photo_storage_bucket, p_receipt_photo_storage_path,
      p_receipt_photo_mime_type, p_receipt_photo_size_bytes, v_document.id
    )
    returning * into v_record;

    v_record_ids := array_append(v_record_ids, v_record.id);

    insert into public.freight_expenses (
      tenant_id, freight_id, trip_cycle_id, vehicle_id, driver_id, fuel_record_id,
      category, description, amount, notes, source, recorded_by
    )
    values (
      v_vehicle.tenant_id, v_vehicle.current_freight_id, v_trip_cycle_id, v_vehicle.id,
      v_driver.id, v_record.id, 'arla', 'Arla', v_arla_amount,
      nullif(trim(coalesce(p_notes, '')), ''), 'driver_app', auth.uid()
    )
    returning * into v_expense;

    v_expense_ids := array_append(v_expense_ids, v_expense.id);
  end if;

  insert into public.fleet_events (
    tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
    source, description, created_by, event_type, action_origin, metadata
  )
  values (
    v_vehicle.tenant_id, v_vehicle.id, v_vehicle.current_freight_id, v_vehicle.status,
    v_vehicle.freight_stage, v_vehicle.city, v_vehicle.state, 'Motorista',
    'Abastecimento registrado pelo aplicativo do motorista', auth.uid(),
    'driver_fuel_registered', 'driver_app',
    jsonb_build_object(
      'driver_id', v_driver.id,
      'fuel_document_id', v_document.id,
      'fuel_record_ids', v_record_ids,
      'expense_ids', v_expense_ids,
      'trip_cycle_id', v_trip_cycle_id,
      'has_pump_photo', p_pump_photo_id is not null,
      'has_receipt_photo', p_receipt_photo_id is not null
    )
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_register_fuel_document(
  text, numeric, numeric, numeric, numeric, numeric, text, text,
  uuid, text, text, text, text, bigint,
  uuid, text, text, text, text, bigint
) from public, anon, authenticated;

grant execute on function public.driver_app_register_fuel_document(
  text, numeric, numeric, numeric, numeric, numeric, text, text,
  uuid, text, text, text, text, bigint,
  uuid, text, text, text, text, bigint
) to authenticated;

drop function if exists public.driver_app_advance_stage(uuid, text, numeric);

create or replace function public.driver_app_advance_stage(
  p_vehicle_id uuid,
  p_target_stage text default null,
  p_unloaded_tons numeric default null,
  p_odometer numeric default null
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
  v_cycle_start_odometer numeric;
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

  if v_is_long_trip and v_next_stage = 'EM_ROTA_CARREGAR' and v_trip_cycle_id is not null then
    select start_odometer
      into v_cycle_start_odometer
    from public.driver_trip_cycles
    where id = v_trip_cycle_id
      and tenant_id = v_vehicle.tenant_id
    for update;

    if v_cycle_start_odometer is null then
      if coalesce(p_odometer, 0) <= 0 then
        raise exception 'start odometer is required';
      end if;

      update public.driver_trip_cycles
      set start_odometer = p_odometer,
          odometer_started_at = now(),
          vehicle_id = coalesce(vehicle_id, v_vehicle.id),
          updated_at = now()
      where id = v_trip_cycle_id
        and tenant_id = v_vehicle.tenant_id;
    end if;
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
  set status = v_next_status,
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
      'trip_cycle_id', v_trip_cycle_id,
      'odometer', p_odometer
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
    set current_freight_id = null,
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

revoke all on function public.driver_app_advance_stage(uuid, text, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.driver_app_advance_stage(uuid, text, numeric, numeric)
  to authenticated;

drop function if exists public.driver_app_complete_return(uuid);

create or replace function public.driver_app_complete_return(
  p_vehicle_id uuid,
  p_odometer numeric default null
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
  v_trip_cycle_id uuid;
  v_is_long_trip boolean;
  v_start_odometer numeric;
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

  v_is_long_trip := private.tenant_driver_app_mode(v_vehicle.tenant_id) = 'long_trip_multi_freight';

  if coalesce(v_vehicle.freight_stage, '') <> 'ENTREGA_FINALIZADA'
    or v_vehicle.status <> 'rota-retornando' then
    raise exception 'return cannot be completed from current driver stage';
  end if;

  if v_vehicle.current_freight_id is not null then
    select f.trip_cycle_id
      into v_trip_cycle_id
    from public.freights f
    where f.tenant_id = v_vehicle.tenant_id
      and f.id = v_vehicle.current_freight_id
    limit 1;

    insert into public.freight_history (
      tenant_id, freight_id, trip_cycle_id, vehicle_id, driver_id, trailer_id, sender_id,
      recipient_id, product_id, vehicle_plate, freight_value, freight_pricing_mode,
      freight_ton_price, unloaded_tons, freight_tax_rate, finish_reason,
      final_status, final_freight_stage
    )
    values (
      v_vehicle.tenant_id, v_vehicle.current_freight_id, v_trip_cycle_id, v_vehicle.id,
      v_vehicle.driver_id, v_vehicle.trailer_id, v_vehicle.sender_id, v_vehicle.recipient_id,
      v_vehicle.product_id, v_vehicle.plate, v_vehicle.freight_value,
      v_vehicle.freight_pricing_mode, v_vehicle.freight_ton_price, v_vehicle.unloaded_tons,
      v_vehicle.freight_tax_rate, 'retorno_confirmado_motorista', v_vehicle.status,
      v_vehicle.freight_stage
    )
    returning id into v_history_id;
  elsif v_is_long_trip then
    select tc.id
      into v_trip_cycle_id
    from public.driver_trip_cycles tc
    where tc.tenant_id = v_vehicle.tenant_id
      and tc.driver_id = v_driver.id
      and (tc.vehicle_id = v_vehicle.id or tc.vehicle_id is null)
      and tc.status = 'open'
    order by tc.started_at desc
    limit 1
    for update;

    if v_trip_cycle_id is null then
      raise exception 'open trip cycle not found for authenticated driver';
    end if;
  else
    raise exception 'active freight not found for authenticated driver';
  end if;

  if v_is_long_trip and v_trip_cycle_id is not null then
    select start_odometer
      into v_start_odometer
    from public.driver_trip_cycles
    where id = v_trip_cycle_id
      and tenant_id = v_vehicle.tenant_id
    for update;

    if coalesce(p_odometer, 0) <= 0 then
      raise exception 'end odometer is required';
    end if;

    if v_start_odometer is not null and p_odometer < v_start_odometer then
      raise exception 'end odometer cannot be lower than start odometer';
    end if;

    update public.driver_trip_cycles
    set end_odometer = p_odometer,
        odometer_ended_at = now(),
        vehicle_id = coalesce(vehicle_id, v_vehicle.id),
        updated_at = now()
    where id = v_trip_cycle_id
      and tenant_id = v_vehicle.tenant_id;
  end if;

  insert into public.fleet_events (
    tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
    source, description, created_by, event_type, action_origin, metadata
  )
  values (
    v_vehicle.tenant_id, v_vehicle.id, v_vehicle.current_freight_id, 'disponivel-patio',
    'DISPONIVEL', v_vehicle.city, v_vehicle.state, 'Motorista',
    'Retorno ao patio confirmado pelo motorista', auth.uid(), 'driver_return_completed',
    'driver_app', jsonb_strip_nulls(jsonb_build_object(
      'driver_id', v_driver.id,
      'history_id', v_history_id,
      'trip_cycle_id', v_trip_cycle_id,
      'end_odometer', p_odometer
    ))
  );

  perform private.close_open_driver_trip_cycle(
    v_vehicle.tenant_id,
    v_vehicle.driver_id,
    'retorno_confirmado_motorista'
  );

  update public.vehicles
  set current_freight_id = null,
      sender_id = null,
      recipient_id = null,
      product_id = null,
      freight_value = null,
      freight_pricing_mode = 'fixed',
      freight_ton_price = null,
      unloaded_tons = null,
      freight_tax_rate = 0,
      status = 'disponivel-patio',
      vehicle_situation = 'disponivel-patio',
      freight_stage = 'DISPONIVEL',
      workflow_flags = jsonb_set(coalesce(workflow_flags, '{}'::jsonb), '{pending_documents}', '[]'::jsonb, true),
      last_transition_source = 'driver_app',
      last_transition_by = auth.uid(),
      last_transition_at = now(),
      updated_at = now()
  where id = v_vehicle.id
    and tenant_id = v_vehicle.tenant_id;

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_complete_return(uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.driver_app_complete_return(uuid, numeric)
  to authenticated;

comment on column public.driver_trip_cycles.start_odometer is
  'Odometro informado pelo motorista ao iniciar o tiro longo.';
comment on column public.driver_trip_cycles.end_odometer is
  'Odometro informado pelo motorista ao chegar no patio e encerrar o tiro longo.';
comment on column public.fuel_records.trip_cycle_id is
  'Ciclo de tiro longo associado ao abastecimento, quando registrado pelo app motorista durante uma viagem longa.';

notify pgrst, 'reload schema';
