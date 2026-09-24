-- Frotak Financeiro: simplificacao gerencial sem criar segunda contabilidade.
-- Mantem financial_documents como fato economico canonico e usa
-- financial_allocations como dimensao/apropriacao ate a baixa.

alter table public.financial_documents
  add column if not exists entry_date date not null default current_date;

alter table public.financial_allocations
  add column if not exists driver_id uuid references public.drivers(id) on delete restrict;

create index if not exists financial_allocations_driver_id_idx
  on public.financial_allocations(driver_id);

alter table public.financial_allocations
  drop constraint if exists financial_allocations_dimension_chk;

alter table public.financial_allocations
  add constraint financial_allocations_dimension_chk check (
    freight_id is not null or vehicle_id is not null or driver_id is not null
    or business_partner_id is not null or cost_center_id is not null or product_id is not null
  );

alter table public.chart_of_accounts
  drop constraint if exists chart_of_accounts_dre_group_chk;

alter table public.chart_of_accounts
  add constraint chart_of_accounts_dre_group_chk check (
    dre_group is null or dre_group in (
      'gross_revenue', 'discounts_obtained', 'revenue_deduction', 'variable_cost',
      'operating_expense', 'depreciation_amortization', 'financial_result',
      'income_tax', 'other_result'
    )
  );

insert into public.chart_of_accounts (
  tenant_id, parent_id, code, name, account_type, normal_balance,
  dre_group, is_postable, is_system
)
select t.id, parent.id, seed.code, seed.name, seed.account_type, seed.normal_balance,
       seed.dre_group, true, true
from public.tenants t
join (values
  ('3.03', '3', 'Receita - Descontos Obtidos', 'revenue', 'credit', 'discounts_obtained'),
  ('7.03', '7', 'Juros', 'expense', 'debit', 'financial_result'),
  ('7.04', '7', 'Multas', 'expense', 'debit', 'financial_result')
) as seed(code, parent_code, name, account_type, normal_balance, dre_group) on true
join public.chart_of_accounts parent
  on parent.tenant_id = t.id and parent.code = seed.parent_code
on conflict (tenant_id, code) do update set
  name = excluded.name,
  account_type = excluded.account_type,
  normal_balance = excluded.normal_balance,
  dre_group = excluded.dre_group,
  is_postable = true,
  active = true;

alter table public.financial_recurring_rules
  drop constraint if exists financial_recurring_rules_kind_chk;

alter table public.financial_recurring_rules
  add constraint financial_recurring_rules_kind_chk check (
    kind in ('salary', 'recurring_expense', 'recurring_income', 'fixed_cost')
  );

create or replace function private.dre_group_label(p_group text)
returns text
language sql
immutable
as $$
  select case p_group
    when 'gross_revenue' then 'Receita Bruta'
    when 'discounts_obtained' then 'Receita - Descontos Obtidos'
    when 'revenue_deduction' then 'Deducoes da Receita'
    when 'variable_cost' then 'Custos Operacionais'
    when 'operating_expense' then 'Despesas Operacionais'
    when 'depreciation_amortization' then 'Depreciacao e Amortizacao'
    when 'financial_result' then 'Resultado Financeiro'
    when 'income_tax' then 'Impostos sobre Resultado'
    when 'other_result' then 'Outras Receitas/Despesas'
    else 'Pendente de Classificacao'
  end;
$$;

create or replace function private.dre_group_order(p_group text)
returns integer
language sql
immutable
as $$
  select case p_group
    when 'gross_revenue' then 10
    when 'discounts_obtained' then 15
    when 'revenue_deduction' then 20
    when 'variable_cost' then 30
    when 'operating_expense' then 40
    when 'depreciation_amortization' then 50
    when 'financial_result' then 60
    when 'income_tax' then 70
    when 'other_result' then 80
    else 90
  end;
$$;

create or replace function public.save_financial_document(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_tenant_id uuid;
  v_amount numeric(18,2) := (p_payload->>'originalAmount')::numeric;
  v_count integer := greatest(coalesce((p_payload->>'installmentCount')::integer, 1), 1);
  v_first_due date := (p_payload->>'firstDueDate')::date;
  v_custom jsonb := coalesce(p_payload->'installments', '[]'::jsonb);
  v_item jsonb;
  v_sum numeric(18,2) := 0;
  v_base numeric(18,2);
  v_value numeric(18,2);
  v_number integer := 0;
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'draft');
  v_existing_status text;
  v_cost_center_id uuid := nullif(p_payload->>'costCenterId', '')::uuid;
  v_description text := coalesce(nullif(btrim(p_payload->>'description'), ''), 'Lancamento financeiro');
begin
  perform private.require_financial_permission(
    v_workspace_id,
    case when v_id is null then 'financial.create' else 'financial.edit_draft' end
  );
  select tenant_id into v_tenant_id from public.workspaces where id = v_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'FINANCIAL_INVALID_WORKSPACE'; end if;
  if v_amount <= 0 then raise exception 'FINANCIAL_INVALID_AMOUNT'; end if;
  if v_status not in ('draft', 'posted') then raise exception 'FINANCIAL_INVALID_STATUS'; end if;

  if v_id is not null then
    select status into v_existing_status from public.financial_documents
    where id = v_id and workspace_id = v_workspace_id for update;
    if v_existing_status is null then raise exception 'FINANCIAL_DOCUMENT_NOT_FOUND'; end if;
    if v_existing_status <> 'draft' then raise exception 'FINANCIAL_ONLY_DRAFT_EDITABLE'; end if;
    delete from public.financial_allocations where document_id = v_id;
    delete from public.financial_installments where document_id = v_id;
    update public.financial_documents set
      direction = p_payload->>'direction',
      partner_id = nullif(p_payload->>'partnerId', '')::uuid,
      document_type = coalesce(nullif(p_payload->>'documentType', ''), 'manual'),
      document_number = nullif(p_payload->>'documentNumber', ''),
      description = v_description,
      original_amount = v_amount,
      competence_date = nullif(p_payload->>'competenceDate', '')::date,
      issue_date = nullif(p_payload->>'issueDate', '')::date,
      entry_date = coalesce(nullif(p_payload->>'entryDate', '')::date, current_date),
      chart_account_id = nullif(p_payload->>'chartAccountId', '')::uuid,
      notes = nullif(p_payload->>'notes', ''),
      status = 'draft'
    where id = v_id;
  else
    insert into public.financial_documents (
      tenant_id, workspace_id, direction, partner_id, document_type, document_number,
      description, original_amount, competence_date, issue_date, entry_date, chart_account_id,
      notes, status
    ) values (
      v_tenant_id, v_workspace_id, p_payload->>'direction',
      nullif(p_payload->>'partnerId', '')::uuid,
      coalesce(nullif(p_payload->>'documentType', ''), 'manual'),
      nullif(p_payload->>'documentNumber', ''), v_description, v_amount,
      nullif(p_payload->>'competenceDate', '')::date,
      nullif(p_payload->>'issueDate', '')::date,
      coalesce(nullif(p_payload->>'entryDate', '')::date, current_date),
      nullif(p_payload->>'chartAccountId', '')::uuid,
      nullif(p_payload->>'notes', ''), 'draft'
    ) returning id into v_id;
  end if;

  if jsonb_array_length(v_custom) > 0 then
    for v_item in select value from jsonb_array_elements(v_custom) loop
      v_number := v_number + 1;
      v_value := (v_item->>'amount')::numeric;
      v_sum := v_sum + v_value;
      insert into public.financial_installments (
        tenant_id, workspace_id, document_id, installment_number, amount, due_date
      ) values (
        v_tenant_id, v_workspace_id, v_id, v_number, v_value, (v_item->>'dueDate')::date
      );
    end loop;
  else
    if v_first_due is null then raise exception 'FINANCIAL_DUE_DATE_REQUIRED'; end if;
    v_base := trunc((v_amount / v_count) * 100) / 100;
    for v_number in 1..v_count loop
      v_value := case when v_number = v_count
        then v_amount - (v_base * (v_count - 1)) else v_base end;
      v_sum := v_sum + v_value;
      insert into public.financial_installments (
        tenant_id, workspace_id, document_id, installment_number, amount, due_date
      ) values (
        v_tenant_id, v_workspace_id, v_id, v_number, v_value,
        (v_first_due + make_interval(months => v_number - 1))::date
      );
    end loop;
  end if;

  if v_sum <> v_amount then raise exception 'FINANCIAL_INSTALLMENTS_TOTAL_MISMATCH'; end if;

  if v_cost_center_id is not null
    or nullif(p_payload->>'vehicleId', '') is not null
    or nullif(p_payload->>'driverId', '') is not null
    or nullif(p_payload->>'freightId', '') is not null
    or nullif(p_payload->>'productId', '') is not null then
    insert into public.financial_allocations (
      tenant_id, workspace_id, document_id, freight_id, vehicle_id, driver_id,
      business_partner_id, cost_center_id, product_id, chart_account_id, amount
    ) values (
      v_tenant_id, v_workspace_id, v_id,
      nullif(p_payload->>'freightId', '')::uuid,
      nullif(p_payload->>'vehicleId', '')::uuid,
      nullif(p_payload->>'driverId', '')::uuid,
      nullif(p_payload->>'partnerId', '')::uuid,
      v_cost_center_id,
      nullif(p_payload->>'productId', '')::uuid,
      nullif(p_payload->>'chartAccountId', '')::uuid,
      v_amount
    );
  end if;

  if v_status = 'posted' then
    update public.financial_documents
    set status = 'posted'
    where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.generate_financial_recurring_documents(
  p_workspace_id uuid,
  p_competence_month date,
  p_rule_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tenant_id uuid;
  v_month date := date_trunc('month', p_competence_month)::date;
  v_rule public.financial_recurring_rules;
  v_document_id uuid;
  v_due_date date;
  v_generated integer := 0;
  v_skipped integer := 0;
  v_document_ids uuid[] := '{}'::uuid[];
  v_source_event text;
  v_direction text;
begin
  perform private.require_financial_permission(p_workspace_id, 'financial.manage_recurring');
  select tenant_id into v_tenant_id
  from public.workspaces
  where id = p_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'FINANCIAL_INVALID_WORKSPACE'; end if;

  for v_rule in
    select *
    from public.financial_recurring_rules
    where tenant_id = v_tenant_id
      and workspace_id = p_workspace_id
      and status = 'active'
      and start_month <= v_month
      and (end_month is null or end_month >= v_month)
      and (p_rule_id is null or id = p_rule_id)
    order by name
  loop
    v_source_event := 'recurring:' || to_char(v_month, 'YYYY-MM');
    select id into v_document_id
    from public.financial_documents
    where tenant_id = v_tenant_id
      and source_type = 'recurring_rule'
      and source_id = v_rule.id
      and source_event = v_source_event;

    if v_document_id is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_direction := case when v_rule.kind = 'recurring_income' then 'receivable' else 'payable' end;
    v_due_date := make_date(
      extract(year from v_month)::integer,
      extract(month from v_month)::integer,
      least(
        v_rule.due_day,
        extract(day from (v_month + interval '1 month' - interval '1 day'))::integer
      )
    );

    insert into public.financial_documents (
      tenant_id, workspace_id, direction, partner_id, document_type,
      source_type, source_id, source_event, description, original_amount,
      competence_date, issue_date, entry_date, currency, status, chart_account_id, notes
    ) values (
      v_tenant_id,
      p_workspace_id,
      v_direction,
      v_rule.partner_id,
      case v_rule.kind
        when 'salary' then 'salary_expense'
        when 'fixed_cost' then 'fixed_cost'
        when 'recurring_income' then 'recurring_income'
        else 'recurring_expense'
      end,
      'recurring_rule',
      v_rule.id,
      v_source_event,
      v_rule.name || ' - ' || to_char(v_month, 'MM/YYYY'),
      v_rule.amount,
      v_month,
      v_month,
      current_date,
      'BRL',
      'draft',
      v_rule.chart_account_id,
      concat_ws(E'\n', 'Gerado automaticamente por recorrencia financeira.', v_rule.notes)
    ) returning id into v_document_id;

    insert into public.financial_installments (
      tenant_id, workspace_id, document_id, installment_number, amount, due_date
    ) values (
      v_tenant_id, p_workspace_id, v_document_id, 1, v_rule.amount, v_due_date
    );

    insert into public.financial_allocations (
      tenant_id, workspace_id, document_id, vehicle_id, driver_id, business_partner_id,
      cost_center_id, chart_account_id, amount, percentage, description
    ) values (
      v_tenant_id,
      p_workspace_id,
      v_document_id,
      v_rule.vehicle_id,
      v_rule.driver_id,
      v_rule.partner_id,
      v_rule.cost_center_id,
      v_rule.chart_account_id,
      v_rule.amount,
      100,
      'Alocacao automatica de recorrencia financeira'
    );

    if v_rule.auto_post then
      update public.financial_documents
      set status = 'posted'
      where id = v_document_id;
    end if;

    v_generated := v_generated + 1;
    v_document_ids := array_append(v_document_ids, v_document_id);
  end loop;

  return jsonb_build_object(
    'generated', v_generated,
    'skipped', v_skipped,
    'documentIds', coalesce(to_jsonb(v_document_ids), '[]'::jsonb)
  );
end;
$$;

create or replace function private.find_financial_system_account(
  p_tenant_id uuid,
  p_code text
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select id
  from public.chart_of_accounts
  where tenant_id = p_tenant_id and code = p_code and active = true
  limit 1;
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
  v_allocation public.financial_allocations;
  v_principal numeric(18,2) := (p_payload->>'amount')::numeric;
  v_interest numeric(18,2) := coalesce((p_payload->>'interestAmount')::numeric, 0);
  v_penalty numeric(18,2) := coalesce((p_payload->>'penaltyAmount')::numeric, 0);
  v_discount numeric(18,2) := coalesce((p_payload->>'discountAmount')::numeric, 0);
  v_id uuid;
  v_adjustment_document_id uuid;
  v_chart_account_id uuid;
begin
  select * into v_installment from public.financial_installments
  where id = (p_payload->>'installmentId')::uuid for update;
  if not found then raise exception 'FINANCIAL_INSTALLMENT_NOT_FOUND'; end if;
  select * into v_document from public.financial_documents where id = v_installment.document_id;
  perform private.require_financial_permission(
    v_installment.workspace_id,
    case when v_document.direction = 'receivable' then 'financial.receive' else 'financial.pay' end
  );
  if v_document.status in ('draft', 'voided') then raise exception 'FINANCIAL_DOCUMENT_NOT_POSTED'; end if;
  if v_principal <= 0 or v_principal > v_installment.balance then
    raise exception 'FINANCIAL_INVALID_SETTLEMENT_AMOUNT';
  end if;

  if (v_interest > 0 or v_penalty > 0 or v_discount > 0) and not exists (
    select 1 from public.financial_allocations where document_id = v_document.id
  ) then
    raise exception 'FINANCIAL_ADJUSTMENT_ALLOCATION_REQUIRED';
  end if;

  select * into v_allocation
  from public.financial_allocations
  where document_id = v_document.id
  order by amount desc
  limit 1;

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
    insert into public.financial_allocations (
      tenant_id, workspace_id, document_id, freight_id, vehicle_id, driver_id,
      business_partner_id, cost_center_id, product_id, chart_account_id, amount, percentage,
      description
    ) values (
      v_installment.tenant_id, v_installment.workspace_id, v_adjustment_document_id,
      v_allocation.freight_id, v_allocation.vehicle_id, v_allocation.driver_id,
      v_document.partner_id, v_allocation.cost_center_id, v_allocation.product_id,
      v_chart_account_id, v_interest, 100, 'Apropriacao de juros da baixa'
    );
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
    insert into public.financial_allocations (
      tenant_id, workspace_id, document_id, freight_id, vehicle_id, driver_id,
      business_partner_id, cost_center_id, product_id, chart_account_id, amount, percentage,
      description
    ) values (
      v_installment.tenant_id, v_installment.workspace_id, v_adjustment_document_id,
      v_allocation.freight_id, v_allocation.vehicle_id, v_allocation.driver_id,
      v_document.partner_id, v_allocation.cost_center_id, v_allocation.product_id,
      v_chart_account_id, v_penalty, 100, 'Apropriacao de multa da baixa'
    );
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
    insert into public.financial_allocations (
      tenant_id, workspace_id, document_id, freight_id, vehicle_id, driver_id,
      business_partner_id, cost_center_id, product_id, chart_account_id, amount, percentage,
      description
    ) values (
      v_installment.tenant_id, v_installment.workspace_id, v_adjustment_document_id,
      v_allocation.freight_id, v_allocation.vehicle_id, v_allocation.driver_id,
      v_document.partner_id, v_allocation.cost_center_id, v_allocation.product_id,
      v_chart_account_id, v_discount, 100, 'Apropriacao de desconto da baixa'
    );
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
