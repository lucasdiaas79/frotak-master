alter table public.drivers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists drivers_auth_user_id_uidx
  on public.drivers(auth_user_id)
  where auth_user_id is not null;

create index if not exists drivers_phone_idx on public.drivers(phone);

comment on column public.drivers.auth_user_id is
  'Auth user linked to the mobile driver app. This does not grant back-office access by itself.';

create or replace function private.current_driver()
returns public.drivers
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
begin
  select *
    into v_driver
  from public.drivers
  where auth_user_id = auth.uid()
    and active = true
  limit 1;

  if not found then
    raise exception 'driver not found for authenticated user';
  end if;

  return v_driver;
end;
$$;

revoke all on function private.current_driver() from public, anon, authenticated;
grant execute on function private.current_driver() to authenticated;

create or replace function public.get_driver_app_context()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_payload jsonb;
begin
  v_driver := private.current_driver();

  select *
    into v_vehicle
  from public.vehicles
  where driver_id = v_driver.id
    and tenant_id = v_driver.tenant_id
  order by updated_at desc
  limit 1;

  select jsonb_build_object(
    'driver', to_jsonb(v_driver),
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
  v_next_stage text;
  v_next_status text;
begin
  v_driver := private.current_driver();

  select *
    into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
    and driver_id = v_driver.id
    and tenant_id = v_driver.tenant_id
  for update;

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;

  v_next_stage := coalesce(
    p_target_stage,
    case v_vehicle.freight_stage
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

  v_next_status := case v_next_stage
    when 'EM_ROTA_CARREGAR' then 'rota-carregar'
    when 'AGUARDANDO_NOTA' then 'parado-aguardando-carga'
    when 'NOTA_EM_CONFERENCIA' then 'parado-aguardando-carga'
    when 'EM_ROTA_ENTREGA' then 'rota-descarregar'
    when 'ENTREGUE_AG_FINALIZACAO' then 'parado-descarregando'
    when 'ENTREGA_FINALIZADA' then 'parado-aguardando-comando'
    else v_vehicle.status
  end;

  update public.vehicles
  set
    status = v_next_status,
    vehicle_situation = case
      when v_next_status in ('rota-carregar', 'rota-descarregar', 'rota-retornando') then 'em-rota'
      when v_next_status = 'parado-quebrado' then 'quebrado'
      when v_next_status in ('manutencao', 'disponivel-oficina') then 'manutencao'
      when v_next_status = 'disponivel-patio' then 'disponivel-patio'
      else 'parado'
    end,
    freight_stage = v_next_stage,
    last_transition_source = 'Motorista',
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
    'Etapa confirmada pelo aplicativo do motorista',
    auth.uid(),
    'driver_stage_confirmed',
    'driver_app',
    jsonb_build_object('driver_id', v_driver.id)
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_advance_stage(uuid, text) from public, anon, authenticated;
grant execute on function public.driver_app_advance_stage(uuid, text) to authenticated;

create or replace function public.driver_app_register_document(
  p_kind text,
  p_file_name text,
  p_mime_type text default null,
  p_size_bytes bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_document public.freight_documents;
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

  insert into public.freight_documents (
    tenant_id,
    vehicle_id,
    freight_id,
    driver_id,
    kind,
    source,
    file_name,
    storage_bucket,
    storage_path,
    mime_type,
    size_bytes,
    status
  )
  values (
    v_vehicle.tenant_id,
    v_vehicle.id,
    v_vehicle.current_freight_id,
    v_driver.id,
    p_kind,
    'motorista_app',
    p_file_name,
    'freight-documents',
    concat('driver-app/', v_vehicle.id, '/', p_kind, '/', extract(epoch from now())::bigint, '-', regexp_replace(p_file_name, '[^a-zA-Z0-9._-]+', '-', 'g')),
    p_mime_type,
    p_size_bytes,
    'anexado'
  )
  returning * into v_document;

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
    'Documento anexado pelo aplicativo do motorista',
    auth.uid(),
    'driver_document_uploaded',
    'driver_app',
    jsonb_build_object('driver_id', v_driver.id, 'document_id', v_document.id, 'kind', p_kind)
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_register_document(text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.driver_app_register_document(text, text, text, bigint) to authenticated;

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
    jsonb_build_object('driver_id', v_driver.id, 'fuel_record_id', v_record.id)
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_register_fuel(text, text, numeric, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.driver_app_register_fuel(text, text, numeric, numeric, numeric, text) to authenticated;
