-- Aliquota do frete: o operacional preserva o valor bruto do frete e o
-- financeiro recebe a receita liquida, descontando a aliquota informada.

alter table public.vehicles
  add column if not exists freight_tax_rate numeric(7,4) not null default 0;

alter table public.freights
  add column if not exists freight_tax_rate numeric(7,4) not null default 0;

alter table public.freight_history
  add column if not exists freight_tax_rate numeric(7,4) not null default 0;

do $$
begin
  alter table public.vehicles
    drop constraint if exists vehicles_freight_tax_rate_chk,
    add constraint vehicles_freight_tax_rate_chk
      check (freight_tax_rate >= 0 and freight_tax_rate < 100);

  alter table public.freights
    drop constraint if exists freights_freight_tax_rate_chk,
    add constraint freights_freight_tax_rate_chk
      check (freight_tax_rate >= 0 and freight_tax_rate < 100);

  alter table public.freight_history
    drop constraint if exists freight_history_freight_tax_rate_chk,
    add constraint freight_history_freight_tax_rate_chk
      check (freight_tax_rate >= 0 and freight_tax_rate < 100);
end $$;

create or replace function private.net_freight_amount(
  p_gross_amount numeric,
  p_tax_rate numeric
)
returns numeric
language sql
stable
set search_path = pg_catalog, public, private
as $$
  select case
    when p_gross_amount is null then null
    else round((p_gross_amount * (100 - coalesce(p_tax_rate, 0)) / 100)::numeric, 2)
  end;
$$;

create or replace function private.apply_freight_tax_to_financial_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_gross_amount numeric(18,2);
  v_tax_rate numeric(7,4);
  v_net_amount numeric(18,2);
  v_discount_amount numeric(18,2);
  v_tax_note text;
begin
  if new.source_type = 'freight' and new.source_event = 'completion_revenue' then
    select f.freight_value, f.freight_tax_rate
      into v_gross_amount, v_tax_rate
    from public.freights f
    where f.id = new.source_id
      and f.tenant_id = new.tenant_id;

    if v_gross_amount is not null and v_gross_amount > 0 then
      v_net_amount := private.net_freight_amount(v_gross_amount, v_tax_rate);
      if v_net_amount is null or v_net_amount <= 0 then
        raise exception 'FREIGHT_NET_AMOUNT_INVALID';
      end if;

      v_discount_amount := round((v_gross_amount - v_net_amount)::numeric, 2);
      new.original_amount := v_net_amount;
      if coalesce(v_tax_rate, 0) > 0 then
        v_tax_note := format(
          'Receita liquida de frete. Valor bruto: R$ %s. Aliquota: %s%%. Desconto: R$ %s.',
          v_gross_amount,
          trim(to_char(v_tax_rate, 'FM999999990D9999')),
          v_discount_amount
        );
        new.notes := case
          when nullif(btrim(coalesce(new.notes, '')), '') is null then v_tax_note
          when new.notes like '%Receita liquida de frete.%' then new.notes
          else new.notes || E'\n' || v_tax_note
        end;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.apply_freight_tax_to_financial_installment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_document public.financial_documents;
begin
  select * into v_document
  from public.financial_documents
  where id = new.document_id
    and tenant_id = new.tenant_id
    and workspace_id = new.workspace_id;

  if found
     and v_document.source_type = 'freight'
     and v_document.source_event = 'completion_revenue' then
    new.amount := v_document.original_amount;
  end if;

  return new;
end;
$$;

create or replace function private.apply_freight_tax_to_financial_allocation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_document public.financial_documents;
begin
  select * into v_document
  from public.financial_documents
  where id = new.document_id
    and tenant_id = new.tenant_id
    and workspace_id = new.workspace_id;

  if found
     and v_document.source_type = 'freight'
     and v_document.source_event = 'completion_revenue' then
    new.amount := v_document.original_amount;
  end if;

  return new;
end;
$$;

drop trigger if exists financial_documents_apply_freight_tax on public.financial_documents;
create trigger financial_documents_apply_freight_tax
before insert or update of original_amount, source_type, source_id, source_event
on public.financial_documents
for each row execute function private.apply_freight_tax_to_financial_document();

drop trigger if exists financial_installments_apply_freight_tax on public.financial_installments;
create trigger financial_installments_apply_freight_tax
before insert on public.financial_installments
for each row execute function private.apply_freight_tax_to_financial_installment();

drop trigger if exists financial_allocations_apply_freight_tax on public.financial_allocations;
create trigger financial_allocations_apply_freight_tax
before insert on public.financial_allocations
for each row execute function private.apply_freight_tax_to_financial_allocation();

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
  p_freight_ton_price numeric default null,
  p_freight_tax_rate numeric default 0
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
  v_tax_rate numeric;
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

  v_tax_rate := coalesce(p_freight_tax_rate, 0);
  if v_tax_rate < 0 or v_tax_rate >= 100 then
    raise exception 'FREIGHT_TAX_RATE_INVALID';
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
      freight_tax_rate = v_tax_rate,
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
      freight_tax_rate = v_tax_rate,
      unloaded_tons = null,
      snapshot = snapshot || jsonb_build_object(
        'freight_payment_type', upper(p_freight_payment_type),
        'billing_partner_id', v_billing_partner_id,
        'payment_term_days', p_payment_term_days,
        'freight_pricing_mode', v_pricing_mode,
        'freight_ton_price', v_ton_price,
        'freight_tax_rate', v_tax_rate
      ),
      updated_at = now()
  where id = v_vehicle.current_freight_id
    and tenant_id = v_vehicle.tenant_id;

  if not found then raise exception 'CANONICAL_FREIGHT_NOT_CREATED'; end if;
  return v_vehicle;
end;
$$;

revoke all on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text, integer, text, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text, integer, text, numeric, numeric
) to authenticated;

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
    freight_ton_price, unloaded_tons, freight_tax_rate, finish_reason,
    final_status, final_freight_stage
  )
  values (
    v_vehicle.tenant_id, v_vehicle.current_freight_id, v_vehicle.id, v_vehicle.driver_id,
    v_vehicle.trailer_id, v_vehicle.sender_id, v_vehicle.recipient_id, v_vehicle.product_id,
    v_vehicle.plate, v_vehicle.freight_value, v_vehicle.freight_pricing_mode,
    v_vehicle.freight_ton_price, v_vehicle.unloaded_tons, v_vehicle.freight_tax_rate,
    p_reason, v_vehicle.status, v_vehicle.freight_stage
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
      freight_tax_rate = 0,
      status = 'disponivel-patio',
      vehicle_situation = 'disponivel-patio',
      freight_stage = 'DISPONIVEL',
      updated_at = now()
    where id = p_vehicle_id;
  end if;

  return v_history_id;
end;
$$;

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
    freight_ton_price, unloaded_tons, freight_tax_rate, finish_reason,
    final_status, final_freight_stage
  )
  values (
    v_vehicle.tenant_id, v_vehicle.current_freight_id, v_vehicle.id, v_vehicle.driver_id,
    v_vehicle.trailer_id, v_vehicle.sender_id, v_vehicle.recipient_id, v_vehicle.product_id,
    v_vehicle.plate, v_vehicle.freight_value, v_vehicle.freight_pricing_mode,
    v_vehicle.freight_ton_price, v_vehicle.unloaded_tons, v_vehicle.freight_tax_rate,
    'retorno_confirmado_motorista', v_vehicle.status, v_vehicle.freight_stage
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
    freight_tax_rate = 0,
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

drop trigger if exists freights_capture_financial_fact on public.freights;
create trigger freights_capture_financial_fact
after insert or update of lifecycle_status, completed_at, freight_value,
  freight_tax_rate, workspace_id, vehicle_id, sender_id, product_id
on public.freights for each row execute function private.capture_freight_financial_fact();

comment on column public.freights.freight_tax_rate is
  'Aliquota percentual descontada da receita bruta do frete ao postar em Contas a Receber.';

notify pgrst, 'reload schema';
