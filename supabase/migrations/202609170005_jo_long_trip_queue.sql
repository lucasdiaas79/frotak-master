alter table public.freights
  add column if not exists trip_sequence integer,
  add column if not exists queued_at timestamptz,
  add column if not exists activated_at timestamptz;

create index if not exists freights_trip_cycle_sequence_idx
  on public.freights(trip_cycle_id, trip_sequence)
  where trip_cycle_id is not null;

create or replace function private.validate_long_trip_segment(
  p_tenant_id uuid,
  p_segment jsonb,
  p_default_trailer_id uuid,
  p_position integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_sender_id uuid := nullif(p_segment->>'senderId', '')::uuid;
  v_recipient_id uuid := nullif(p_segment->>'recipientId', '')::uuid;
  v_product_id uuid := nullif(p_segment->>'productId', '')::uuid;
  v_trailer_id uuid := coalesce(nullif(p_segment->>'trailerId', '')::uuid, p_default_trailer_id);
  v_payment_type text := upper(nullif(btrim(p_segment->>'freightPaymentType'), ''));
  v_pricing_mode text := coalesce(nullif(btrim(p_segment->>'freightPricingMode'), ''), 'fixed');
  v_freight_value numeric := nullif(p_segment->>'freightValue', '')::numeric;
  v_ton_price numeric := nullif(p_segment->>'freightTonPrice', '')::numeric;
  v_payment_term_days integer := nullif(p_segment->>'paymentTermDays', '')::integer;
begin
  if v_sender_id is null or not exists (
    select 1 from public.senders where tenant_id = p_tenant_id and id = v_sender_id and active = true
  ) then
    raise exception 'LONG_TRIP_INVALID_SENDER at segment %', p_position;
  end if;

  if v_recipient_id is null or not exists (
    select 1 from public.recipients where tenant_id = p_tenant_id and id = v_recipient_id and active = true
  ) then
    raise exception 'LONG_TRIP_INVALID_RECIPIENT at segment %', p_position;
  end if;

  if v_product_id is null or not exists (
    select 1 from public.products where tenant_id = p_tenant_id and id = v_product_id and active = true
  ) then
    raise exception 'LONG_TRIP_INVALID_PRODUCT at segment %', p_position;
  end if;

  if v_trailer_id is null or not exists (
    select 1 from public.trailers where tenant_id = p_tenant_id and id = v_trailer_id
  ) then
    raise exception 'LONG_TRIP_INVALID_TRAILER at segment %', p_position;
  end if;

  if v_payment_type not in ('CIF', 'FOB') then
    raise exception 'LONG_TRIP_PAYMENT_TYPE_REQUIRED at segment %', p_position;
  end if;

  if v_payment_term_days is not null and v_payment_term_days < 0 then
    raise exception 'LONG_TRIP_INVALID_PAYMENT_TERM at segment %', p_position;
  end if;

  if v_pricing_mode not in ('fixed', 'per_ton') then
    raise exception 'LONG_TRIP_INVALID_PRICING_MODE at segment %', p_position;
  end if;

  if v_pricing_mode = 'fixed' and (v_freight_value is null or v_freight_value < 0) then
    raise exception 'LONG_TRIP_FIXED_VALUE_REQUIRED at segment %', p_position;
  end if;

  if v_pricing_mode = 'per_ton' and (v_ton_price is null or v_ton_price <= 0) then
    raise exception 'LONG_TRIP_TON_PRICE_REQUIRED at segment %', p_position;
  end if;

  return jsonb_build_object(
    'senderId', v_sender_id,
    'recipientId', v_recipient_id,
    'productId', v_product_id,
    'trailerId', v_trailer_id,
    'freightPaymentType', v_payment_type,
    'paymentTermDays', v_payment_term_days,
    'freightPricingMode', v_pricing_mode,
    'freightValue', case when v_pricing_mode = 'fixed' then v_freight_value else null end,
    'freightTonPrice', case when v_pricing_mode = 'per_ton' then v_ton_price else null end,
    'notes', nullif(btrim(coalesce(p_segment->>'observations', p_segment->>'notes', '')), '')
  );
end;
$$;

create or replace function public.create_long_trip_freights(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_segments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_vehicle public.vehicles;
  v_driver public.drivers;
  v_workspace_id uuid;
  v_trip_cycle_id uuid;
  v_existing_current_freight_id uuid;
  v_start_sequence integer;
  v_index integer := 0;
  v_segment jsonb;
  v_validated jsonb;
  v_created_ids uuid[] := '{}'::uuid[];
  v_first_freight_id uuid;
  v_new_freight_id uuid;
  v_billing_partner_id uuid;
  v_current_vehicle public.vehicles;
begin
  if p_segments is null or jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) = 0 then
    raise exception 'LONG_TRIP_SEGMENTS_REQUIRED';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and private.can_access_tenant(tenant_id)
  for update;
  if not found then raise exception 'vehicle not found or not accessible'; end if;

  if private.tenant_driver_app_mode(v_vehicle.tenant_id) <> 'long_trip_multi_freight' then
    raise exception 'LONG_TRIP_MODE_NOT_ENABLED';
  end if;

  select * into v_driver
  from public.drivers
  where tenant_id = v_vehicle.tenant_id and id = p_driver_id and active = true;
  if not found then raise exception 'LONG_TRIP_INVALID_DRIVER'; end if;

  v_workspace_id := private.default_workspace_for_tenant(v_vehicle.tenant_id);
  v_existing_current_freight_id := v_vehicle.current_freight_id;

  v_trip_cycle_id := private.ensure_open_driver_trip_cycle(
    v_vehicle.tenant_id,
    v_workspace_id,
    p_driver_id,
    v_vehicle.id,
    v_vehicle.trailer_id
  );

  select coalesce(max(trip_sequence), 0)
    into v_start_sequence
  from public.freights
  where tenant_id = v_vehicle.tenant_id
    and trip_cycle_id = v_trip_cycle_id;

  for v_segment in select value from jsonb_array_elements(p_segments)
  loop
    v_index := v_index + 1;
    v_validated := private.validate_long_trip_segment(
      v_vehicle.tenant_id,
      v_segment,
      v_vehicle.trailer_id,
      v_index
    );

    if v_existing_current_freight_id is null and v_index = 1 then
      v_current_vehicle := public.link_vehicle_operation(
        v_vehicle.id,
        p_driver_id,
        (v_validated->>'trailerId')::uuid,
        array[(v_validated->>'trailerId')::uuid],
        (v_validated->>'senderId')::uuid,
        (v_validated->>'recipientId')::uuid,
        (v_validated->>'productId')::uuid,
        nullif(v_validated->>'freightValue', '')::numeric,
        v_validated->>'freightPaymentType',
        nullif(v_validated->>'paymentTermDays', '')::integer,
        v_validated->>'freightPricingMode',
        nullif(v_validated->>'freightTonPrice', '')::numeric
      );

      v_first_freight_id := v_current_vehicle.current_freight_id;
      v_created_ids := array_append(v_created_ids, v_first_freight_id);

      update public.freights
      set trip_sequence = v_start_sequence + v_index,
          activated_at = coalesce(activated_at, now()),
          snapshot = snapshot || jsonb_strip_nulls(jsonb_build_object(
            'long_trip_kind', 'active_segment',
            'trip_sequence', v_start_sequence + v_index,
            'notes', v_validated->>'notes'
          )),
          updated_at = now()
      where tenant_id = v_vehicle.tenant_id
        and id = v_first_freight_id;

      update public.vehicles
      set status = 'aguardando-motorista',
          freight_stage = 'DISPONIVEL',
          vehicle_situation = 'parado',
          updated_at = now()
      where id = v_vehicle.id;
    else
      v_billing_partner_id := private.resolve_freight_billing_partner(
        v_vehicle.tenant_id,
        v_validated->>'freightPaymentType',
        (v_validated->>'senderId')::uuid,
        (v_validated->>'recipientId')::uuid
      );

      v_new_freight_id := gen_random_uuid();
      insert into public.freights (
        id, tenant_id, workspace_id, vehicle_id, driver_id, primary_trailer_id, trailer_ids,
        sender_id, recipient_id, product_id, freight_value, lifecycle_status, operational_status,
        freight_stage, source_kind, freight_payment_type, billing_partner_id, payment_term_days,
        freight_pricing_mode, freight_ton_price, trip_cycle_id, trip_sequence, queued_at, snapshot
      )
      values (
        v_new_freight_id,
        v_vehicle.tenant_id,
        v_workspace_id,
        v_vehicle.id,
        p_driver_id,
        (v_validated->>'trailerId')::uuid,
        array[(v_validated->>'trailerId')::uuid],
        (v_validated->>'senderId')::uuid,
        (v_validated->>'recipientId')::uuid,
        (v_validated->>'productId')::uuid,
        nullif(v_validated->>'freightValue', '')::numeric,
        'planned',
        'planned',
        'DISPONIVEL',
        'native',
        v_validated->>'freightPaymentType',
        v_billing_partner_id,
        nullif(v_validated->>'paymentTermDays', '')::integer,
        v_validated->>'freightPricingMode',
        nullif(v_validated->>'freightTonPrice', '')::numeric,
        v_trip_cycle_id,
        v_start_sequence + v_index,
        now(),
        jsonb_strip_nulls(jsonb_build_object(
          'long_trip_kind', 'queued_segment',
          'trip_sequence', v_start_sequence + v_index,
          'notes', v_validated->>'notes'
        ))
      );
      v_created_ids := array_append(v_created_ids, v_new_freight_id);
    end if;
  end loop;

  insert into public.fleet_events (
    tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
    source, description, event_type, action_origin, metadata
  )
  values (
    v_vehicle.tenant_id, v_vehicle.id, coalesce(v_first_freight_id, v_existing_current_freight_id),
    case when v_existing_current_freight_id is null then 'aguardando-motorista' else v_vehicle.status end,
    'DISPONIVEL', v_vehicle.city, v_vehicle.state, 'Operador',
    case
      when v_existing_current_freight_id is null then 'Tiro longo criado pela expedição.'
      else 'Novos fretes adicionados ao tiro longo pela expedição.'
    end,
    'long_trip_freights_created',
    'gestao_central',
    jsonb_build_object(
      'driver_id', p_driver_id,
      'trip_cycle_id', v_trip_cycle_id,
      'created_freight_ids', v_created_ids,
      'segments', jsonb_array_length(p_segments)
    )
  );

  return jsonb_build_object(
    'tripCycleId', v_trip_cycle_id,
    'createdFreightIds', v_created_ids,
    'startedNow', v_existing_current_freight_id is null,
    'segmentCount', array_length(v_created_ids, 1)
  );
end;
$$;

revoke all on function public.create_long_trip_freights(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_long_trip_freights(uuid, uuid, jsonb)
  to authenticated;

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
      operational_status = 'aguardando-motorista',
      freight_stage = 'DISPONIVEL',
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
      status = 'aguardando-motorista',
      vehicle_situation = 'parado',
      freight_stage = 'DISPONIVEL',
      workflow_flags = jsonb_set(coalesce(workflow_flags, '{}'::jsonb), '{pending_documents}', '[]'::jsonb, true),
      last_transition_source = 'gestao_central',
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
    'Sistema', 'Próximo frete do tiro longo liberado para o motorista.',
    'long_trip_next_freight_activated', 'system',
    jsonb_build_object('trip_cycle_id', p_trip_cycle_id, 'driver_id', p_driver_id)
  from public.vehicles v
  where v.id = p_vehicle_id;

  return v_next.id;
end;
$$;

create or replace function private.promote_next_long_trip_freight_after_clear()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_trip_cycle_id uuid;
  v_next_freight_id uuid;
begin
  if old.current_freight_id is null
    or new.current_freight_id is not null
    or old.driver_id is null
    or private.tenant_driver_app_mode(old.tenant_id) <> 'long_trip_multi_freight' then
    return new;
  end if;

  select f.trip_cycle_id
    into v_trip_cycle_id
  from public.freights f
  where f.tenant_id = old.tenant_id
    and f.id = old.current_freight_id
  limit 1;

  if v_trip_cycle_id is null then
    return new;
  end if;

  update public.freights
  set lifecycle_status = 'completed',
      operational_status = old.status,
      freight_stage = old.freight_stage,
      completed_at = coalesce(completed_at, now()),
      unloaded_tons = coalesce(unloaded_tons, old.unloaded_tons),
      freight_value = coalesce(old.freight_value, freight_value),
      updated_at = now()
  where tenant_id = old.tenant_id
    and id = old.current_freight_id;

  v_next_freight_id := private.activate_next_long_trip_freight(
    old.tenant_id,
    v_trip_cycle_id,
    old.id,
    old.driver_id
  );

  if v_next_freight_id is null then
    insert into public.fleet_events (
      tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
      source, description, event_type, action_origin, metadata
    )
    values (
      old.tenant_id, old.id, old.current_freight_id,
      'parado-aguardando-comando', 'DISPONIVEL', old.city, old.state,
      'Sistema', 'Tiro longo sem próximo frete planejado. Motorista aguardando comando.',
      'long_trip_queue_empty', 'system',
      jsonb_build_object('trip_cycle_id', v_trip_cycle_id, 'driver_id', old.driver_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists vehicles_promote_next_long_trip_freight on public.vehicles;
create trigger vehicles_promote_next_long_trip_freight
after update of current_freight_id on public.vehicles
for each row
when (old.current_freight_id is not null and new.current_freight_id is null)
execute function private.promote_next_long_trip_freight_after_clear();
