-- Frotak Financeiro: garante que ajustes de baixa entrem nos gerenciais corretos.
-- Juros -> 7.03 Juros; Multas -> 7.04 Multas; descontos obtidos -> 3.03.

insert into public.chart_of_accounts (
  tenant_id, parent_id, code, name, account_type, normal_balance,
  dre_group, is_postable, is_system, active
)
select t.id, parent.id, seed.code, seed.name, seed.account_type, seed.normal_balance,
       seed.dre_group, true, true, true
from public.tenants t
join (values
  ('7.03', '7', 'Juros', 'expense', 'debit', 'financial_result'),
  ('7.04', '7', 'Multas', 'expense', 'debit', 'financial_result'),
  ('3.03', '3', 'Receita - Descontos Obtidos', 'revenue', 'credit', 'discounts_obtained')
) as seed(code, parent_code, name, account_type, normal_balance, dre_group) on true
join public.chart_of_accounts parent
  on parent.tenant_id = t.id and parent.code = seed.parent_code
on conflict (tenant_id, code) do update set
  name = excluded.name,
  account_type = excluded.account_type,
  normal_balance = excluded.normal_balance,
  dre_group = excluded.dre_group,
  is_postable = true,
  is_system = true,
  active = true;

create or replace function private.find_required_financial_system_account(
  p_tenant_id uuid,
  p_code text
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.chart_of_accounts
  where tenant_id = p_tenant_id
    and code = p_code
    and active = true
  limit 1;

  if v_id is null then
    raise exception 'FINANCIAL_SYSTEM_ACCOUNT_NOT_FOUND:%', p_code;
  end if;

  return v_id;
end;
$$;

with tenant_accounts as (
  select
    tenant_id,
    (array_agg(id order by id) filter (where code = '7.03'))[1] as interest_account_id,
    (array_agg(id order by id) filter (where code = '7.04'))[1] as penalty_account_id
  from public.chart_of_accounts
  where code in ('7.03', '7.04')
  group by tenant_id
),
adjustments as (
  select
    fd.id,
    fd.tenant_id,
    fd.source_event,
    case
      when fd.source_event = 'interest' then ta.interest_account_id
      when fd.source_event = 'penalty' then ta.penalty_account_id
    end as target_account_id
  from public.financial_documents fd
  join tenant_accounts ta on ta.tenant_id = fd.tenant_id
  where fd.source_type = 'settlement_adjustment'
    and fd.source_event in ('interest', 'penalty')
)
update public.financial_documents fd
set chart_account_id = a.target_account_id
from adjustments a
where fd.id = a.id
  and a.target_account_id is not null
  and fd.chart_account_id is distinct from a.target_account_id;

with tenant_accounts as (
  select
    tenant_id,
    (array_agg(id order by id) filter (where code = '7.03'))[1] as interest_account_id,
    (array_agg(id order by id) filter (where code = '7.04'))[1] as penalty_account_id
  from public.chart_of_accounts
  where code in ('7.03', '7.04')
  group by tenant_id
),
adjustments as (
  select
    fd.id,
    fd.tenant_id,
    fd.source_event,
    case
      when fd.source_event = 'interest' then ta.interest_account_id
      when fd.source_event = 'penalty' then ta.penalty_account_id
    end as target_account_id
  from public.financial_documents fd
  join tenant_accounts ta on ta.tenant_id = fd.tenant_id
  where fd.source_type = 'settlement_adjustment'
    and fd.source_event in ('interest', 'penalty')
)
update public.financial_allocations fa
set chart_account_id = a.target_account_id
from adjustments a
where fa.document_id = a.id
  and a.target_account_id is not null
  and fa.chart_account_id is distinct from a.target_account_id;

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
    v_chart_account_id := private.find_required_financial_system_account(v_installment.tenant_id, '7.03');
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
    v_chart_account_id := private.find_required_financial_system_account(v_installment.tenant_id, '7.04');
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
        then private.find_required_financial_system_account(v_installment.tenant_id, '3.03')
      else private.find_required_financial_system_account(v_installment.tenant_id, '3.09')
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

revoke all on function private.find_required_financial_system_account(uuid, text)
  from public, anon, authenticated;

revoke all on function public.settle_financial_installment(jsonb) from public, anon;
grant execute on function public.settle_financial_installment(jsonb) to authenticated;
