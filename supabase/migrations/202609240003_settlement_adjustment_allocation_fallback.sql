-- Frotak Financeiro: baixa com juros/multa/desconto em titulo sem apropriacao original.
-- Mantem fail-closed: ajustes financeiros continuam exigindo uma apropriacao valida.

alter table public.financial_allocations
  drop constraint if exists financial_allocations_dimension_chk;

alter table public.financial_allocations
  add constraint financial_allocations_dimension_chk check (
    freight_id is not null or vehicle_id is not null or driver_id is not null
    or business_partner_id is not null or cost_center_id is not null or product_id is not null
    or chart_account_id is not null
  );

create or replace function private.insert_financial_adjustment_allocation_from_payload(
  p_source_document_id uuid,
  p_adjustment_document_id uuid,
  p_adjustment_amount numeric,
  p_chart_account_id uuid,
  p_description text,
  p_allocation jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_source public.financial_documents;
  v_scope text := coalesce(nullif(p_allocation->>'scope', ''), 'company');
  v_cost_center_id uuid := nullif(p_allocation->>'costCenterId', '')::uuid;
  v_vehicle_id uuid := nullif(p_allocation->>'vehicleId', '')::uuid;
  v_driver_id uuid := nullif(p_allocation->>'driverId', '')::uuid;
begin
  select * into v_source
  from public.financial_documents
  where id = p_source_document_id;
  if not found then raise exception 'FINANCIAL_DOCUMENT_NOT_FOUND'; end if;

  if p_adjustment_amount <= 0 then
    return;
  end if;

  if v_scope not in ('company', 'cost_center', 'vehicle', 'driver') then
    raise exception 'FINANCIAL_INVALID_ADJUSTMENT_ALLOCATION_SCOPE';
  end if;

  if v_scope = 'company' then
    v_cost_center_id := null;
    v_vehicle_id := null;
    v_driver_id := null;
  elsif v_scope = 'cost_center' then
    v_vehicle_id := null;
    v_driver_id := null;
    if v_cost_center_id is null then raise exception 'FINANCIAL_ADJUSTMENT_ALLOCATION_REQUIRED'; end if;
  elsif v_scope = 'vehicle' then
    v_cost_center_id := null;
    v_driver_id := null;
    if v_vehicle_id is null then raise exception 'FINANCIAL_ADJUSTMENT_ALLOCATION_REQUIRED'; end if;
  elsif v_scope = 'driver' then
    v_cost_center_id := null;
    v_vehicle_id := null;
    if v_driver_id is null then raise exception 'FINANCIAL_ADJUSTMENT_ALLOCATION_REQUIRED'; end if;
  end if;

  if v_cost_center_id is not null and not exists (
    select 1
    from public.cost_centers
    where id = v_cost_center_id
      and workspace_id = v_source.workspace_id
      and tenant_id = v_source.tenant_id
      and active = true
  ) then
    raise exception 'FINANCIAL_INVALID_COST_CENTER_WORKSPACE';
  end if;

  if v_vehicle_id is not null and not exists (
    select 1
    from public.vehicles
    where id = v_vehicle_id
      and tenant_id = v_source.tenant_id
  ) then
    raise exception 'FINANCIAL_INVALID_VEHICLE_TENANT';
  end if;

  if v_driver_id is not null and not exists (
    select 1
    from public.drivers
    where id = v_driver_id
      and tenant_id = v_source.tenant_id
      and active = true
  ) then
    raise exception 'FINANCIAL_INVALID_DRIVER_TENANT';
  end if;

  insert into public.financial_allocations (
    tenant_id, workspace_id, document_id, freight_id, vehicle_id, driver_id,
    business_partner_id, cost_center_id, product_id, chart_account_id, amount, percentage,
    description
  ) values (
    v_source.tenant_id,
    v_source.workspace_id,
    p_adjustment_document_id,
    null,
    v_vehicle_id,
    v_driver_id,
    null,
    v_cost_center_id,
    null,
    p_chart_account_id,
    p_adjustment_amount,
    100,
    p_description
  );
end;
$$;

create or replace function public.settle_financial_installment(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_installment public.financial_installments;
  v_document public.financial_documents;
  v_principal numeric(18,2) := (p_payload->>'amount')::numeric;
  v_interest numeric(18,2) := coalesce((p_payload->>'interestAmount')::numeric, 0);
  v_penalty numeric(18,2) := coalesce((p_payload->>'penaltyAmount')::numeric, 0);
  v_discount numeric(18,2) := coalesce((p_payload->>'discountAmount')::numeric, 0);
  v_id uuid;
  v_adjustment_document_id uuid;
  v_chart_account_id uuid;
  v_has_source_allocations boolean;
  v_adjustment_allocation jsonb := p_payload->'adjustmentAllocation';
begin
  select * into v_installment from public.financial_installments
  where id = (p_payload->>'installmentId')::uuid for update;
  if not found then raise exception 'FINANCIAL_INSTALLMENT_NOT_FOUND'; end if;
  select * into v_document from public.financial_documents where id = v_installment.document_id;
  perform private.require_financial_permission(
    v_installment.workspace_id,
    case when v_document.direction = 'receivable' then 'financial.receive' else 'financial.pay' end
  );
  if not exists (
    select 1 from public.financial_accounts
    where id = (p_payload->>'financialAccountId')::uuid
      and workspace_id = v_installment.workspace_id
      and tenant_id = v_installment.tenant_id
      and active = true
  ) then
    raise exception 'FINANCIAL_INVALID_ACCOUNT_WORKSPACE';
  end if;
  if v_document.status in ('draft', 'voided') then raise exception 'FINANCIAL_DOCUMENT_NOT_POSTED'; end if;
  if v_principal <= 0 or v_principal > v_installment.balance then
    raise exception 'FINANCIAL_INVALID_SETTLEMENT_AMOUNT';
  end if;

  select exists (
    select 1 from public.financial_allocations where document_id = v_document.id
  ) into v_has_source_allocations;

  if (v_interest > 0 or v_penalty > 0 or v_discount > 0)
    and not v_has_source_allocations
    and v_adjustment_allocation is null then
    raise exception 'FINANCIAL_ADJUSTMENT_ALLOCATION_REQUIRED';
  end if;

  insert into public.financial_settlements (
    tenant_id, workspace_id, document_id, installment_id, financial_account_id,
    principal_amount, interest_amount, penalty_amount, discount_amount,
    settled_on, payment_method, notes
  ) values (
    v_installment.tenant_id, v_installment.workspace_id, v_document.id, v_installment.id,
    (p_payload->>'financialAccountId')::uuid, v_principal,
    v_interest,
    v_penalty,
    v_discount,
    (p_payload->>'settledOn')::date,
    coalesce(nullif(p_payload->>'paymentMethod', ''), 'other'),
    nullif(p_payload->>'notes', '')
  ) returning id into v_id;

  if v_interest > 0 then
    v_chart_account_id := private.find_financial_system_account(v_installment.tenant_id, '7.03');
    insert into public.financial_documents (
      tenant_id, workspace_id, direction, partner_id, document_type, source_type, source_id,
      source_event, description, original_amount, competence_date, issue_date, entry_date,
      currency, status, chart_account_id, notes
    ) values (
      v_installment.tenant_id, v_installment.workspace_id, 'payable', v_document.partner_id,
      'settlement_interest', 'settlement_adjustment', v_id, 'interest',
      'Juros - ' || v_document.description, v_interest, (p_payload->>'settledOn')::date,
      (p_payload->>'settledOn')::date, (p_payload->>'settledOn')::date, 'BRL', 'posted',
      v_chart_account_id, 'Gerado pela baixa do titulo ' || v_document.id
    ) returning id into v_adjustment_document_id;
    if v_has_source_allocations then
      perform private.copy_financial_adjustment_allocations(
        v_document.id, v_adjustment_document_id, v_interest, v_chart_account_id,
        'Apropriacao de juros da baixa'
      );
    else
      perform private.insert_financial_adjustment_allocation_from_payload(
        v_document.id, v_adjustment_document_id, v_interest, v_chart_account_id,
        'Apropriacao de juros da baixa', v_adjustment_allocation
      );
    end if;
  end if;

  if v_penalty > 0 then
    v_chart_account_id := private.find_financial_system_account(v_installment.tenant_id, '7.04');
    insert into public.financial_documents (
      tenant_id, workspace_id, direction, partner_id, document_type, source_type, source_id,
      source_event, description, original_amount, competence_date, issue_date, entry_date,
      currency, status, chart_account_id, notes
    ) values (
      v_installment.tenant_id, v_installment.workspace_id, 'payable', v_document.partner_id,
      'settlement_penalty', 'settlement_adjustment', v_id, 'penalty',
      'Multa - ' || v_document.description, v_penalty, (p_payload->>'settledOn')::date,
      (p_payload->>'settledOn')::date, (p_payload->>'settledOn')::date, 'BRL', 'posted',
      v_chart_account_id, 'Gerado pela baixa do titulo ' || v_document.id
    ) returning id into v_adjustment_document_id;
    if v_has_source_allocations then
      perform private.copy_financial_adjustment_allocations(
        v_document.id, v_adjustment_document_id, v_penalty, v_chart_account_id,
        'Apropriacao de multa da baixa'
      );
    else
      perform private.insert_financial_adjustment_allocation_from_payload(
        v_document.id, v_adjustment_document_id, v_penalty, v_chart_account_id,
        'Apropriacao de multa da baixa', v_adjustment_allocation
      );
    end if;
  end if;

  if v_discount > 0 then
    v_chart_account_id := case
      when v_document.direction = 'payable'
        then private.find_financial_system_account(v_installment.tenant_id, '3.03')
      else private.find_financial_system_account(v_installment.tenant_id, '3.09')
    end;
    insert into public.financial_documents (
      tenant_id, workspace_id, direction, partner_id, document_type, source_type, source_id,
      source_event, description, original_amount, competence_date, issue_date, entry_date,
      currency, status, chart_account_id, notes
    ) values (
      v_installment.tenant_id, v_installment.workspace_id,
      case when v_document.direction = 'payable' then 'receivable' else 'payable' end,
      v_document.partner_id,
      case when v_document.direction = 'payable'
        then 'discount_obtained' else 'discount_granted' end,
      'settlement_adjustment', v_id, 'discount',
      case when v_document.direction = 'payable'
        then 'Receita - Descontos Obtidos - ' || v_document.description
        else 'Desconto concedido - ' || v_document.description end,
      v_discount, (p_payload->>'settledOn')::date, (p_payload->>'settledOn')::date,
      (p_payload->>'settledOn')::date, 'BRL', 'posted', v_chart_account_id,
      'Gerado pela baixa do titulo ' || v_document.id
    ) returning id into v_adjustment_document_id;
    if v_has_source_allocations then
      perform private.copy_financial_adjustment_allocations(
        v_document.id, v_adjustment_document_id, v_discount, v_chart_account_id,
        'Apropriacao de desconto da baixa'
      );
    else
      perform private.insert_financial_adjustment_allocation_from_payload(
        v_document.id, v_adjustment_document_id, v_discount, v_chart_account_id,
        'Apropriacao de desconto da baixa', v_adjustment_allocation
      );
    end if;
  end if;

  update public.financial_installments
  set settled_amount = settled_amount + v_principal,
      status = case when settled_amount + v_principal = amount then 'settled' else 'partially_settled' end,
      settled_at = case when settled_amount + v_principal = amount then now() else null end
  where id = v_installment.id;
  perform private.refresh_financial_document_status(v_document.id);
  return v_id;
end;
$$;

revoke all on function private.insert_financial_adjustment_allocation_from_payload(uuid, uuid, numeric, uuid, text, jsonb)
  from public, anon, authenticated;

revoke all on function public.settle_financial_installment(jsonb) from public, anon;
grant execute on function public.settle_financial_installment(jsonb) to authenticated;
