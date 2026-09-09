-- Frotak - frete com preco fixo ou preco por tonelada.

alter table public.vehicles
  add column if not exists freight_pricing_mode text not null default 'fixed',
  add column if not exists freight_ton_price numeric(18,2),
  add column if not exists unloaded_tons numeric(12,3);

alter table public.vehicles
  drop constraint if exists vehicles_freight_pricing_mode_chk,
  add constraint vehicles_freight_pricing_mode_chk
    check (freight_pricing_mode in ('fixed', 'per_ton')),
  drop constraint if exists vehicles_freight_ton_price_chk,
  add constraint vehicles_freight_ton_price_chk
    check (freight_ton_price is null or freight_ton_price >= 0),
  drop constraint if exists vehicles_unloaded_tons_chk,
  add constraint vehicles_unloaded_tons_chk
    check (unloaded_tons is null or unloaded_tons >= 0);

alter table public.freights
  add column if not exists freight_pricing_mode text not null default 'fixed',
  add column if not exists freight_ton_price numeric(18,2),
  add column if not exists unloaded_tons numeric(12,3);

alter table public.freights
  drop constraint if exists freights_pricing_mode_chk,
  add constraint freights_pricing_mode_chk
    check (freight_pricing_mode in ('fixed', 'per_ton')),
  drop constraint if exists freights_ton_price_chk,
  add constraint freights_ton_price_chk
    check (freight_ton_price is null or freight_ton_price >= 0),
  drop constraint if exists freights_unloaded_tons_chk,
  add constraint freights_unloaded_tons_chk
    check (unloaded_tons is null or unloaded_tons >= 0);

alter table public.freight_history
  add column if not exists freight_pricing_mode text not null default 'fixed',
  add column if not exists freight_ton_price numeric(18,2),
  add column if not exists unloaded_tons numeric(12,3);

alter table public.freight_history
  drop constraint if exists freight_history_pricing_mode_chk,
  add constraint freight_history_pricing_mode_chk
    check (freight_pricing_mode in ('fixed', 'per_ton')),
  drop constraint if exists freight_history_ton_price_chk,
  add constraint freight_history_ton_price_chk
    check (freight_ton_price is null or freight_ton_price >= 0),
  drop constraint if exists freight_history_unloaded_tons_chk,
  add constraint freight_history_unloaded_tons_chk
    check (unloaded_tons is null or unloaded_tons >= 0);

create or replace function public.link_vehicle_operation(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_trailer_id uuid,
  p_trailer_ids uuid[],
  p_sender_id uuid,
  p_recipient_id uuid,
  p_product_id uuid,
  p_freight_value numeric,
  p_freight_payment_type text,
  p_payment_term_days integer default null,
  p_freight_pricing_mode text default 'fixed',
  p_freight_ton_price numeric default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_vehicle public.vehicles;
  v_billing_partner_id uuid;
  v_pricing_mode text;
  v_fixed_value numeric;
  v_ton_price numeric;
begin
  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and private.can_access_tenant(tenant_id);
  if not found then raise exception 'vehicle not found or not accessible'; end if;

  if p_sender_id is null or p_recipient_id is null then
    raise exception 'FREIGHT_ORIGIN_AND_DESTINATION_REQUIRED';
  end if;
  if p_payment_term_days is not null and p_payment_term_days < 0 then
    raise exception 'FINANCIAL_INVALID_PAYMENT_TERM_DAYS';
  end if;

  v_pricing_mode := coalesce(nullif(btrim(p_freight_pricing_mode), ''), 'fixed');
  if v_pricing_mode not in ('fixed', 'per_ton') then
    raise exception 'FREIGHT_PRICING_MODE_INVALID';
  end if;

  v_fixed_value := case when v_pricing_mode = 'fixed' then p_freight_value else null end;
  v_ton_price := case when v_pricing_mode = 'per_ton' then p_freight_ton_price else null end;
  if v_pricing_mode = 'per_ton' and (v_ton_price is null or v_ton_price <= 0) then
    raise exception 'FREIGHT_TON_PRICE_REQUIRED';
  end if;

  v_billing_partner_id := private.resolve_freight_billing_partner(
    v_vehicle.tenant_id,
    upper(nullif(btrim(p_freight_payment_type), '')),
    p_sender_id,
    p_recipient_id
  );

  v_vehicle := private.link_vehicle_operation_legacy_core(
    p_vehicle_id, p_driver_id, p_trailer_id, p_trailer_ids,
    p_sender_id, p_recipient_id, p_product_id, v_fixed_value
  );

  update public.vehicles
  set freight_pricing_mode = v_pricing_mode,
      freight_ton_price = v_ton_price,
      unloaded_tons = null,
      updated_at = now()
  where id = v_vehicle.id
  returning * into v_vehicle;

  update public.freights
  set freight_payment_type = upper(p_freight_payment_type),
      billing_partner_id = v_billing_partner_id,
      payment_term_days = p_payment_term_days,
      freight_pricing_mode = v_pricing_mode,
      freight_ton_price = v_ton_price,
      unloaded_tons = null,
      snapshot = snapshot || jsonb_build_object(
        'freight_payment_type', upper(p_freight_payment_type),
        'billing_partner_id', v_billing_partner_id,
        'payment_term_days', p_payment_term_days,
        'freight_pricing_mode', v_pricing_mode,
        'freight_ton_price', v_ton_price
      ),
      updated_at = now()
  where id = v_vehicle.current_freight_id
    and tenant_id = v_vehicle.tenant_id;

  if not found then raise exception 'CANONICAL_FREIGHT_NOT_CREATED'; end if;
  return v_vehicle;
end;
$$;

revoke all on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text, integer, text, numeric
) from public, anon, authenticated;
grant execute on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text, integer, text, numeric
) to authenticated;

drop function if exists public.driver_app_advance_stage(uuid, text);

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
      'calculated_freight_value', v_calculated_value
    ))
  );

  return public.get_driver_app_context();
end;
$$;

revoke all on function public.driver_app_advance_stage(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.driver_app_advance_stage(uuid, text, numeric) to authenticated;

create or replace function public.archive_vehicle_freight(
  p_vehicle_id uuid,
  p_reason text default 'pronto_para_novo_frete',
  p_clear_vehicle boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_vehicle public.vehicles;
  v_history_id uuid;
begin
  select *
    into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
    and private.can_access_tenant(tenant_id)
  for update;

  if not found then
    raise exception 'vehicle not found or not accessible';
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
    v_vehicle.freight_ton_price, v_vehicle.unloaded_tons, p_reason, v_vehicle.status,
    v_vehicle.freight_stage
  )
  returning id into v_history_id;

  if p_clear_vehicle then
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
      updated_at = now()
    where id = p_vehicle_id;
  end if;

  return v_history_id;
end;
$$;
