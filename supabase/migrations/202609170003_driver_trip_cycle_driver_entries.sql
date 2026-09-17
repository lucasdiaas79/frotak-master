-- Frotak - Fase 3 JO Transportes: carimba entradas/despesas do motorista com o ciclo de viagem.

create or replace function private.trip_cycle_for_freight(
  p_tenant_id uuid,
  p_freight_id uuid
)
returns uuid
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select f.trip_cycle_id
  from public.freights f
  where f.tenant_id = p_tenant_id
    and f.id = p_freight_id
  limit 1
$$;

create or replace function public.driver_app_register_expense(
  p_category text,
  p_description text,
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
  v_expense public.freight_expenses;
  v_trip_cycle_id uuid;
begin
  v_driver := private.current_driver();

  select *
    into v_vehicle
  from public.vehicles
  where driver_id = v_driver.id
    and tenant_id = v_driver.tenant_id
  order by updated_at desc
  limit 1;

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;

  if v_vehicle.current_freight_id is null then
    raise exception 'active freight not found for authenticated driver';
  end if;

  v_trip_cycle_id := private.trip_cycle_for_freight(v_vehicle.tenant_id, v_vehicle.current_freight_id);

  insert into public.freight_expenses (
    tenant_id,
    freight_id,
    trip_cycle_id,
    vehicle_id,
    driver_id,
    category,
    description,
    amount,
    notes,
    source,
    recorded_by
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.current_freight_id,
    v_trip_cycle_id,
    v_vehicle.id,
    v_driver.id,
    p_category,
    coalesce(nullif(btrim(p_description), ''), 'Despesa'),
    p_amount,
    nullif(btrim(p_notes), ''),
    'driver_app',
    auth.uid()
  )
  returning * into v_expense;

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
    'Despesa registrada pelo aplicativo do motorista',
    auth.uid(),
    'driver_expense_registered',
    'driver_app',
    jsonb_build_object(
      'driver_id', v_driver.id,
      'expense_id', v_expense.id,
      'trip_cycle_id', v_trip_cycle_id
    )
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_register_expense(text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.driver_app_register_expense(text, text, numeric, text)
  to authenticated;

create or replace function public.driver_app_register_fuel(
  p_station text,
  p_fuel_type text,
  p_liters numeric,
  p_amount numeric,
  p_odometer numeric,
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
  v_record public.fuel_records;
  v_expense public.freight_expenses;
  v_trip_cycle_id uuid;
begin
  v_driver := private.current_driver();

  select *
    into v_vehicle
  from public.vehicles
  where driver_id = v_driver.id
    and tenant_id = v_driver.tenant_id
  order by updated_at desc
  limit 1;

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;

  if v_vehicle.current_freight_id is null then
    raise exception 'active freight not found for authenticated driver';
  end if;

  v_trip_cycle_id := private.trip_cycle_for_freight(v_vehicle.tenant_id, v_vehicle.current_freight_id);

  insert into public.fuel_records (
    tenant_id,
    vehicle_id,
    driver_id,
    vehicle_plate,
    driver_name,
    station,
    fuel_type,
    liters,
    amount,
    odometer,
    notes
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_driver.id,
    v_vehicle.plate,
    v_driver.name,
    p_station,
    p_fuel_type,
    p_liters,
    p_amount,
    p_odometer,
    p_notes
  )
  returning * into v_record;

  insert into public.freight_expenses (
    tenant_id,
    freight_id,
    trip_cycle_id,
    vehicle_id,
    driver_id,
    fuel_record_id,
    category,
    description,
    amount,
    notes,
    source,
    recorded_by
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.current_freight_id,
    v_trip_cycle_id,
    v_vehicle.id,
    v_driver.id,
    v_record.id,
    p_fuel_type,
    case
      when p_fuel_type = 'arla' then 'Arla'
      else 'Diesel S10'
    end,
    p_amount,
    p_notes,
    'driver_app',
    auth.uid()
  )
  returning * into v_expense;

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
    'Abastecimento registrado pelo aplicativo do motorista',
    auth.uid(),
    'driver_fuel_registered',
    'driver_app',
    jsonb_build_object(
      'driver_id', v_driver.id,
      'fuel_record_id', v_record.id,
      'expense_id', v_expense.id,
      'trip_cycle_id', v_trip_cycle_id
    )
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_register_fuel(text, text, numeric, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.driver_app_register_fuel(text, text, numeric, numeric, numeric, text)
  to authenticated;

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
  v_trip_cycle_id uuid;
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

  v_trip_cycle_id := private.trip_cycle_for_freight(v_vehicle.tenant_id, v_vehicle.current_freight_id);

  insert into public.freight_cash_entries (
    tenant_id,
    freight_id,
    trip_cycle_id,
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
    v_trip_cycle_id,
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
    jsonb_build_object(
      'driver_id', v_driver.id,
      'cash_entry_id', v_entry.id,
      'trip_cycle_id', v_trip_cycle_id
    )
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_register_cash_entry(text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.driver_app_register_cash_entry(text, numeric, text)
  to authenticated;

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
    tenant_id,
    vehicle_id,
    driver_id,
    vehicle_plate,
    driver_name,
    station,
    payment_method,
    odometer,
    diesel_liters,
    diesel_amount,
    arla_liters,
    arla_amount,
    notes,
    source
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_driver.id,
    v_vehicle.plate,
    v_driver.name,
    trim(p_station),
    nullif(trim(coalesce(p_payment_method, '')), ''),
    p_odometer,
    v_diesel_liters,
    v_diesel_amount,
    v_arla_liters,
    v_arla_amount,
    nullif(trim(coalesce(p_notes, '')), ''),
    'driver_app'
  )
  returning * into v_document;

  if p_pump_photo_id is not null and nullif(trim(coalesce(p_pump_photo_storage_path, '')), '') is not null then
    insert into public.fuel_document_files (
      id,
      tenant_id,
      fuel_document_id,
      kind,
      file_name,
      storage_bucket,
      storage_path,
      mime_type,
      size_bytes
    )
    values (
      p_pump_photo_id,
      v_vehicle.tenant_id,
      v_document.id,
      'pump_photo',
      coalesce(nullif(trim(coalesce(p_pump_photo_file_name, '')), ''), 'foto-bomba'),
      coalesce(nullif(trim(coalesce(p_pump_photo_storage_bucket, '')), ''), 'driver-fuel-documents'),
      trim(p_pump_photo_storage_path),
      nullif(trim(coalesce(p_pump_photo_mime_type, '')), ''),
      p_pump_photo_size_bytes
    );
  end if;

  if p_receipt_photo_id is not null and nullif(trim(coalesce(p_receipt_photo_storage_path, '')), '') is not null then
    insert into public.fuel_document_files (
      id,
      tenant_id,
      fuel_document_id,
      kind,
      file_name,
      storage_bucket,
      storage_path,
      mime_type,
      size_bytes
    )
    values (
      p_receipt_photo_id,
      v_vehicle.tenant_id,
      v_document.id,
      'receipt_photo',
      coalesce(nullif(trim(coalesce(p_receipt_photo_file_name, '')), ''), 'foto-cupom'),
      coalesce(nullif(trim(coalesce(p_receipt_photo_storage_bucket, '')), ''), 'driver-fuel-documents'),
      trim(p_receipt_photo_storage_path),
      nullif(trim(coalesce(p_receipt_photo_mime_type, '')), ''),
      p_receipt_photo_size_bytes
    );
  end if;

  if v_diesel_liters > 0 and v_diesel_amount > 0 then
    insert into public.fuel_records (
      tenant_id,
      vehicle_id,
      driver_id,
      vehicle_plate,
      driver_name,
      station,
      fuel_type,
      liters,
      amount,
      odometer,
      notes,
      invoice_file_name,
      storage_bucket,
      storage_path,
      mime_type,
      size_bytes,
      fuel_document_id
    )
    values (
      v_vehicle.tenant_id,
      v_vehicle.id,
      v_driver.id,
      v_vehicle.plate,
      v_driver.name,
      trim(p_station),
      'diesel_s10',
      v_diesel_liters,
      v_diesel_amount,
      p_odometer,
      nullif(trim(coalesce(p_notes, '')), ''),
      p_receipt_photo_file_name,
      p_receipt_photo_storage_bucket,
      p_receipt_photo_storage_path,
      p_receipt_photo_mime_type,
      p_receipt_photo_size_bytes,
      v_document.id
    )
    returning * into v_record;

    v_record_ids := array_append(v_record_ids, v_record.id);

    insert into public.freight_expenses (
      tenant_id,
      freight_id,
      trip_cycle_id,
      vehicle_id,
      driver_id,
      fuel_record_id,
      category,
      description,
      amount,
      notes,
      source,
      recorded_by
    )
    values (
      v_vehicle.tenant_id,
      v_vehicle.current_freight_id,
      v_trip_cycle_id,
      v_vehicle.id,
      v_driver.id,
      v_record.id,
      'diesel_s10',
      'Diesel S10',
      v_diesel_amount,
      nullif(trim(coalesce(p_notes, '')), ''),
      'driver_app',
      auth.uid()
    )
    returning * into v_expense;

    v_expense_ids := array_append(v_expense_ids, v_expense.id);
  end if;

  if v_arla_liters > 0 and v_arla_amount > 0 then
    insert into public.fuel_records (
      tenant_id,
      vehicle_id,
      driver_id,
      vehicle_plate,
      driver_name,
      station,
      fuel_type,
      liters,
      amount,
      odometer,
      notes,
      invoice_file_name,
      storage_bucket,
      storage_path,
      mime_type,
      size_bytes,
      fuel_document_id
    )
    values (
      v_vehicle.tenant_id,
      v_vehicle.id,
      v_driver.id,
      v_vehicle.plate,
      v_driver.name,
      trim(p_station),
      'arla',
      v_arla_liters,
      v_arla_amount,
      p_odometer,
      nullif(trim(coalesce(p_notes, '')), ''),
      p_receipt_photo_file_name,
      p_receipt_photo_storage_bucket,
      p_receipt_photo_storage_path,
      p_receipt_photo_mime_type,
      p_receipt_photo_size_bytes,
      v_document.id
    )
    returning * into v_record;

    v_record_ids := array_append(v_record_ids, v_record.id);

    insert into public.freight_expenses (
      tenant_id,
      freight_id,
      trip_cycle_id,
      vehicle_id,
      driver_id,
      fuel_record_id,
      category,
      description,
      amount,
      notes,
      source,
      recorded_by
    )
    values (
      v_vehicle.tenant_id,
      v_vehicle.current_freight_id,
      v_trip_cycle_id,
      v_vehicle.id,
      v_driver.id,
      v_record.id,
      'arla',
      'Arla',
      v_arla_amount,
      nullif(trim(coalesce(p_notes, '')), ''),
      'driver_app',
      auth.uid()
    )
    returning * into v_expense;

    v_expense_ids := array_append(v_expense_ids, v_expense.id);
  end if;

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
    'Abastecimento registrado pelo aplicativo do motorista',
    auth.uid(),
    'driver_fuel_registered',
    'driver_app',
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
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  uuid,
  text,
  text,
  text,
  text,
  bigint
) from public, anon, authenticated;
grant execute on function public.driver_app_register_fuel_document(
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  uuid,
  text,
  text,
  text,
  text,
  bigint
) to authenticated;

notify pgrst, 'reload schema';
