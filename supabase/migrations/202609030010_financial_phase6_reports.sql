-- FROTAK Financeiro Fase 6: DRE gerencial, fluxo de caixa e dashboard executivo.
-- Fonte economica da DRE: financial_documents + financial_allocations + chart_of_accounts.
-- O ledger existe, mas os fluxos atuais nao geram journal_entries/journal_lines de forma completa.

create index if not exists financial_documents_workspace_competence_status_idx
  on public.financial_documents(workspace_id, competence_date, status, direction);

create index if not exists financial_documents_workspace_chart_idx
  on public.financial_documents(workspace_id, chart_account_id);

create index if not exists financial_installments_workspace_due_status_idx
  on public.financial_installments(workspace_id, due_date, status);

create index if not exists financial_settlements_workspace_settled_idx
  on public.financial_settlements(workspace_id, settled_on, financial_account_id);

create index if not exists financial_allocations_document_cost_chart_idx
  on public.financial_allocations(document_id, cost_center_id, chart_account_id);

with permission_seed (code, name, description, risk_level) as (
  values
    ('financial.dashboard.view', 'Visualizar dashboard financeiro', 'Visualizar dashboard financeiro executivo.', 'medium'),
    ('financial.dre.view', 'Visualizar DRE gerencial', 'Visualizar DRE gerencial por competencia.', 'medium'),
    ('financial.cashflow.view', 'Visualizar fluxo de caixa', 'Visualizar fluxo realizado e previsto.', 'medium')
)
insert into public.permissions (module_id, code, name, description, risk_level, active)
select m.id, p.code, p.name, p.description, p.risk_level, true
from permission_seed p
left join public.modules m on m.code = 'financial'
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  risk_level = excluded.risk_level,
  active = true,
  updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select wr.id, p.id
from public.workspace_roles wr
join public.permissions p on p.code in (
  'financial.dashboard.view',
  'financial.dre.view',
  'financial.cashflow.view'
)
where wr.code in ('OWNER', 'FINANCIAL') and wr.active = true
on conflict do nothing;

create or replace function private.require_report_permission(
  p_workspace_id uuid,
  p_permission text
)
returns table (tenant_id uuid, workspace_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tenant_id uuid;
begin
  if p_workspace_id is null then
    raise exception 'FINANCIAL_WORKSPACE_REQUIRED';
  end if;

  select w.tenant_id into v_tenant_id
  from public.workspaces w
  where w.id = p_workspace_id;

  if v_tenant_id is null then
    raise exception 'FINANCIAL_WORKSPACE_NOT_FOUND';
  end if;

  if not private.is_workspace_owner(p_workspace_id)
    and not private.has_permission(p_workspace_id, p_permission) then
    raise exception 'FINANCIAL_REPORT_PERMISSION_DENIED';
  end if;

  tenant_id := v_tenant_id;
  workspace_id := p_workspace_id;
  return next;
end;
$$;

create or replace function private.dre_group_label(p_group text)
returns text
language sql
immutable
as $$
  select case p_group
    when 'gross_revenue' then 'Receita Bruta'
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

create or replace function private.financial_dre_facts(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_cost_center_id uuid default null
)
returns table (
  tenant_id uuid,
  workspace_id uuid,
  document_id uuid,
  description text,
  document_number text,
  source_type text,
  source_event text,
  partner_name text,
  competence_date date,
  direction text,
  document_amount numeric,
  fact_amount numeric,
  signed_amount numeric,
  chart_account_id uuid,
  chart_account_code text,
  chart_account_name text,
  dre_group text,
  cost_center_id uuid,
  cost_center_name text,
  is_unallocated boolean,
  is_unclassified boolean
)
language sql
security definer
set search_path = pg_catalog, public, private
as $$
with docs as (
  select
    fd.*,
    bp.trade_name as partner_name
  from public.financial_documents fd
  left join public.business_partners bp on bp.id = fd.partner_id
  where fd.workspace_id = p_workspace_id
    and fd.status in ('posted', 'partially_settled', 'settled')
    and fd.competence_date >= p_start_date
    and fd.competence_date <= p_end_date
),
alloc_totals as (
  select
    a.document_id,
    sum(a.amount)::numeric(18,2) as allocated_total,
    count(*) as allocation_count
  from public.financial_allocations a
  join docs d on d.id = a.document_id
  group by a.document_id
),
allocated as (
  select
    d.tenant_id,
    d.workspace_id,
    d.id as document_id,
    d.description,
    d.document_number,
    d.source_type,
    d.source_event,
    d.partner_name,
    d.competence_date,
    d.direction,
    d.original_amount as document_amount,
    case
      when coalesce(t.allocated_total, 0) <= d.original_amount then a.amount
      else round((a.amount / nullif(t.allocated_total, 0)) * d.original_amount, 2)
    end::numeric(18,2) as fact_amount,
    coalesce(a.chart_account_id, d.chart_account_id) as chart_account_id,
    a.cost_center_id,
    false as is_unallocated
  from docs d
  join public.financial_allocations a on a.document_id = d.id
  join alloc_totals t on t.document_id = d.id
),
residual as (
  select
    d.tenant_id,
    d.workspace_id,
    d.id as document_id,
    d.description,
    d.document_number,
    d.source_type,
    d.source_event,
    d.partner_name,
    d.competence_date,
    d.direction,
    d.original_amount as document_amount,
    greatest(d.original_amount - coalesce(t.allocated_total, 0), 0)::numeric(18,2) as fact_amount,
    d.chart_account_id,
    null::uuid as cost_center_id,
    true as is_unallocated
  from docs d
  left join alloc_totals t on t.document_id = d.id
  where coalesce(t.allocation_count, 0) = 0
     or d.original_amount > coalesce(t.allocated_total, 0)
),
facts as (
  select * from allocated
  union all
  select * from residual where fact_amount > 0
),
rounded as (
  select
    f.*,
    sum(f.fact_amount) over (partition by f.document_id) as doc_fact_total,
    row_number() over (partition by f.document_id order by f.is_unallocated desc, f.fact_amount desc, f.chart_account_id nulls last) as rn
  from facts f
),
balanced as (
  select
    r.tenant_id,
    r.workspace_id,
    r.document_id,
    r.description,
    r.document_number,
    r.source_type,
    r.source_event,
    r.partner_name,
    r.competence_date,
    r.direction,
    r.document_amount,
    case
      when r.rn = 1 then r.fact_amount + (r.document_amount - r.doc_fact_total)
      else r.fact_amount
    end::numeric(18,2) as fact_amount,
    r.chart_account_id,
    r.cost_center_id,
    r.is_unallocated
  from rounded r
)
select
  b.tenant_id,
  b.workspace_id,
  b.document_id,
  b.description,
  b.document_number,
  b.source_type,
  b.source_event,
  b.partner_name,
  b.competence_date,
  b.direction,
  b.document_amount,
  b.fact_amount,
  case when b.direction = 'receivable' then b.fact_amount else -b.fact_amount end::numeric(18,2) as signed_amount,
  b.chart_account_id,
  coa.code as chart_account_code,
  coa.name as chart_account_name,
  coa.dre_group,
  b.cost_center_id,
  cc.name as cost_center_name,
  b.is_unallocated,
  (b.chart_account_id is null or coa.dre_group is null) as is_unclassified
from balanced b
left join public.chart_of_accounts coa
  on coa.id = b.chart_account_id and coa.tenant_id = b.tenant_id
left join public.cost_centers cc
  on cc.id = b.cost_center_id and cc.workspace_id = b.workspace_id
where (p_cost_center_id is null or b.cost_center_id = p_cost_center_id);
$$;

create or replace function public.get_dre_summary(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_start date := (p_payload->>'startDate')::date;
  v_end date := (p_payload->>'endDate')::date;
  v_cost_center_id uuid := nullif(p_payload->>'costCenterId', '')::uuid;
  v_days integer;
  v_prev_start date;
  v_prev_end date;
  v_current jsonb;
  v_previous jsonb;
begin
  perform * from private.require_report_permission(v_workspace_id, 'financial.dre.view');
  if v_start is null or v_end is null or v_end < v_start then
    raise exception 'FINANCIAL_INVALID_REPORT_PERIOD';
  end if;

  v_days := v_end - v_start + 1;
  v_prev_end := v_start - 1;
  v_prev_start := v_prev_end - (v_days - 1);

  with facts as (
    select * from private.financial_dre_facts(v_workspace_id, v_start, v_end, v_cost_center_id)
  ),
  groups as (
    select
      coalesce(dre_group, 'unclassified') as dre_group,
      private.dre_group_label(coalesce(dre_group, 'unclassified')) as label,
      private.dre_group_order(coalesce(dre_group, 'unclassified')) as sort_order,
      count(distinct document_id) as document_count,
      sum(signed_amount)::numeric(18,2) as signed_amount,
      sum(abs(signed_amount))::numeric(18,2) as movement_amount
    from facts
    group by coalesce(dre_group, 'unclassified')
  ),
  totals as (
    select
      coalesce(sum(signed_amount) filter (where dre_group = 'gross_revenue'), 0)::numeric(18,2) as gross_revenue,
      coalesce(sum(signed_amount) filter (where dre_group = 'revenue_deduction'), 0)::numeric(18,2) as revenue_deductions,
      coalesce(sum(signed_amount) filter (where dre_group = 'variable_cost'), 0)::numeric(18,2) as variable_costs,
      coalesce(sum(signed_amount) filter (where dre_group = 'operating_expense'), 0)::numeric(18,2) as operating_expenses,
      coalesce(sum(signed_amount) filter (where dre_group = 'depreciation_amortization'), 0)::numeric(18,2) as depreciation_amortization,
      coalesce(sum(signed_amount) filter (where dre_group = 'financial_result'), 0)::numeric(18,2) as financial_result,
      coalesce(sum(signed_amount) filter (where dre_group = 'income_tax'), 0)::numeric(18,2) as income_tax,
      coalesce(sum(signed_amount) filter (where dre_group = 'other_result'), 0)::numeric(18,2) as other_result,
      coalesce(sum(signed_amount) filter (where dre_group is null), 0)::numeric(18,2) as unclassified_result,
      coalesce(sum(abs(signed_amount)) filter (where dre_group is null), 0)::numeric(18,2) as unclassified_amount,
      coalesce(sum(abs(signed_amount)) filter (where is_unallocated), 0)::numeric(18,2) as unallocated_amount,
      coalesce(sum(signed_amount), 0)::numeric(18,2) as managerial_result,
      coalesce(sum(abs(signed_amount)), 0)::numeric(18,2) as represented_total,
      count(distinct document_id) as document_count
    from facts
  ),
  expected as (
    select coalesce(sum(fd.original_amount), 0)::numeric(18,2) as eligible_total
    from public.financial_documents fd
    where fd.workspace_id = v_workspace_id
      and fd.status in ('posted', 'partially_settled', 'settled')
      and fd.competence_date >= v_start
      and fd.competence_date <= v_end
      and (
        v_cost_center_id is null
        or exists (
          select 1 from public.financial_allocations fa
          where fa.document_id = fd.id and fa.cost_center_id = v_cost_center_id
        )
      )
  )
  select jsonb_build_object(
    'startDate', v_start,
    'endDate', v_end,
    'groups', coalesce((select jsonb_agg(to_jsonb(g) order by g.sort_order) from groups g), '[]'::jsonb),
    'totals', to_jsonb(t) || jsonb_build_object(
      'netRevenue', t.gross_revenue + t.revenue_deductions,
      'grossResult', t.gross_revenue + t.revenue_deductions + t.variable_costs,
      'operatingResult', t.gross_revenue + t.revenue_deductions + t.variable_costs + t.operating_expenses + t.depreciation_amortization,
      'managerialMargin', case when t.gross_revenue = 0 then null else round((t.managerial_result / t.gross_revenue) * 100, 2) end
    ),
    'reconciliation', jsonb_build_object(
      'eligibleTotal', e.eligible_total,
      'representedTotal', t.represented_total,
      'difference', e.eligible_total - t.represented_total,
      'ok', abs(e.eligible_total - t.represented_total) < 0.01
    )
  ) into v_current
  from totals t cross join expected e;

  with facts as (
    select * from private.financial_dre_facts(v_workspace_id, v_prev_start, v_prev_end, v_cost_center_id)
  ),
  totals as (
    select
      coalesce(sum(signed_amount) filter (where dre_group = 'gross_revenue'), 0)::numeric(18,2) as gross_revenue,
      coalesce(sum(signed_amount) filter (where dre_group = 'variable_cost'), 0)::numeric(18,2) as variable_costs,
      coalesce(sum(signed_amount) filter (where dre_group = 'operating_expense'), 0)::numeric(18,2) as operating_expenses,
      coalesce(sum(signed_amount), 0)::numeric(18,2) as managerial_result
    from facts
  )
  select to_jsonb(t) into v_previous from totals t;

  return v_current || jsonb_build_object('previous', v_previous);
end;
$$;

create or replace function public.get_dre_detail(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_start date := (p_payload->>'startDate')::date;
  v_end date := (p_payload->>'endDate')::date;
  v_cost_center_id uuid := nullif(p_payload->>'costCenterId', '')::uuid;
  v_group text := nullif(p_payload->>'dreGroup', '');
  v_chart_account_id uuid := nullif(p_payload->>'chartAccountId', '')::uuid;
  v_can_payroll boolean;
  v_result jsonb;
begin
  perform * from private.require_report_permission(v_workspace_id, 'financial.dre.view');
  v_can_payroll := private.is_workspace_owner(v_workspace_id)
    or private.has_permission(v_workspace_id, 'financial.payroll.view');

  with facts as (
    select * from private.financial_dre_facts(v_workspace_id, v_start, v_end, v_cost_center_id)
    where (v_group is null or coalesce(dre_group, 'unclassified') = v_group)
      and (v_chart_account_id is null or chart_account_id = v_chart_account_id)
  ),
  accounts as (
    select
      chart_account_id,
      coalesce(chart_account_code, 'SEM-CONTA') as code,
      coalesce(chart_account_name, 'Pendente de Classificacao') as name,
      coalesce(dre_group, 'unclassified') as dre_group,
      sum(signed_amount)::numeric(18,2) as signed_amount,
      sum(abs(signed_amount))::numeric(18,2) as movement_amount,
      count(distinct document_id) as document_count
    from facts
    group by chart_account_id, chart_account_code, chart_account_name, coalesce(dre_group, 'unclassified')
  ),
  documents as (
    select
      document_id,
      max(competence_date) as competence_date,
      max(direction) as direction,
      max(case when source_type = 'payroll' and not v_can_payroll then null else document_id::text end) as visible_document_id,
      max(case when source_type = 'payroll' and not v_can_payroll then 'Folha gerencial (restrito)' else description end) as description,
      max(case when source_type = 'payroll' and not v_can_payroll then null else document_number end) as document_number,
      max(case when source_type = 'payroll' and not v_can_payroll then null else partner_name end) as partner_name,
      max(source_type) as source_type,
      max(source_event) as source_event,
      sum(signed_amount)::numeric(18,2) as signed_amount,
      sum(abs(signed_amount))::numeric(18,2) as movement_amount,
      bool_or(is_unallocated) as has_unallocated,
      bool_or(is_unclassified) as is_unclassified
    from facts
    group by document_id
  )
  select jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(to_jsonb(a) order by abs(a.signed_amount) desc) from accounts a), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(d) order by d.competence_date desc, abs(d.signed_amount) desc) from documents d), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_cash_flow_summary(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_start date := (p_payload->>'startDate')::date;
  v_end date := (p_payload->>'endDate')::date;
  v_account_id uuid := nullif(p_payload->>'financialAccountId', '')::uuid;
  v_result jsonb;
begin
  perform * from private.require_report_permission(v_workspace_id, 'financial.cashflow.view');

  with accounts as (
    select * from public.financial_accounts fa
    where fa.workspace_id = v_workspace_id
      and (v_account_id is null or fa.id = v_account_id)
      and fa.active = true
  ),
  movement as (
    select
      fs.*,
      fd.direction,
      fd.source_type,
      fd.chart_account_id,
      case
        when fd.direction = 'receivable' and fs.settlement_type = 'settlement' then fs.net_amount
        when fd.direction = 'receivable' and fs.settlement_type = 'reversal' then -fs.net_amount
        when fd.direction = 'payable' and fs.settlement_type = 'settlement' then -fs.net_amount
        else fs.net_amount
      end::numeric(18,2) as signed_cash
    from public.financial_settlements fs
    join public.financial_documents fd on fd.id = fs.document_id
    join accounts a on a.id = fs.financial_account_id
  ),
  opening as (
    select
      coalesce(sum(a.opening_balance), 0)
      + coalesce(sum(m.signed_cash) filter (where m.settled_on < v_start), 0) as opening_balance
    from accounts a
    left join movement m on m.financial_account_id = a.id
  ),
  realized as (
    select
      coalesce(sum(signed_cash) filter (where signed_cash > 0 and settled_on between v_start and v_end), 0)::numeric(18,2) as inflows,
      coalesce(sum(abs(signed_cash)) filter (where signed_cash < 0 and settled_on between v_start and v_end), 0)::numeric(18,2) as outflows,
      coalesce(sum(signed_cash) filter (where settled_on between v_start and v_end), 0)::numeric(18,2) as net_change,
      count(*) filter (where settled_on between v_start and v_end) as settlement_count
    from movement
  ),
  forecast_base as (
    select
      fi.id,
      fi.due_date,
      fi.balance,
      fd.direction,
      fd.source_type,
      fd.chart_account_id
    from public.financial_installments fi
    join public.financial_documents fd on fd.id = fi.document_id
    where fi.workspace_id = v_workspace_id
      and fi.status in ('open', 'partially_settled')
      and fi.balance > 0
      and fd.status in ('posted', 'partially_settled')
  ),
  forecast_period as (
    select
      coalesce(sum(balance) filter (where direction = 'receivable' and due_date between v_start and v_end), 0)::numeric(18,2) as expected_inflows,
      coalesce(sum(balance) filter (where direction = 'payable' and due_date between v_start and v_end), 0)::numeric(18,2) as expected_outflows,
      coalesce(sum(case when direction = 'receivable' then balance else -balance end) filter (where due_date between v_start and v_end), 0)::numeric(18,2) as expected_net,
      coalesce(sum(balance) filter (where due_date < current_date), 0)::numeric(18,2) as overdue_amount,
      count(*) filter (where due_date < current_date) as overdue_count
    from forecast_base
  ),
  forecast_windows as (
    select
      coalesce(sum(balance) filter (where direction = 'receivable' and due_date between current_date and current_date + 7), 0)::numeric(18,2) as inflows_7d,
      coalesce(sum(balance) filter (where direction = 'payable' and due_date between current_date and current_date + 7), 0)::numeric(18,2) as outflows_7d,
      coalesce(sum(case when direction = 'receivable' then balance else -balance end) filter (where due_date between current_date and current_date + 7), 0)::numeric(18,2) as net_7d,
      coalesce(sum(balance) filter (where direction = 'receivable' and due_date between current_date and current_date + 30), 0)::numeric(18,2) as inflows_30d,
      coalesce(sum(balance) filter (where direction = 'payable' and due_date between current_date and current_date + 30), 0)::numeric(18,2) as outflows_30d,
      coalesce(sum(case when direction = 'receivable' then balance else -balance end) filter (where due_date between current_date and current_date + 30), 0)::numeric(18,2) as net_30d
    from forecast_base
  ),
  account_rows as (
    select
      a.id,
      a.name,
      a.account_type,
      a.opening_balance,
      a.opening_balance_date,
      (a.opening_balance + coalesce(sum(m.signed_cash), 0))::numeric(18,2) as current_balance
    from accounts a
    left join movement m on m.financial_account_id = a.id
    group by a.id, a.name, a.account_type, a.opening_balance, a.opening_balance_date
  )
  select jsonb_build_object(
    'startDate', v_start,
    'endDate', v_end,
    'openingBalance', o.opening_balance,
    'realized', to_jsonb(r) || jsonb_build_object('closingBalance', o.opening_balance + r.net_change),
    'forecast', to_jsonb(fp),
    'projection', to_jsonb(fw),
    'accounts', coalesce((select jsonb_agg(to_jsonb(ar) order by ar.name) from account_rows ar), '[]'::jsonb)
  ) into v_result
  from opening o cross join realized r cross join forecast_period fp cross join forecast_windows fw;

  return v_result;
end;
$$;

create or replace function public.get_cash_flow_entries(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_start date := (p_payload->>'startDate')::date;
  v_end date := (p_payload->>'endDate')::date;
  v_mode text := coalesce(nullif(p_payload->>'mode', ''), 'realized');
  v_direction text := nullif(p_payload->>'direction', '');
  v_account_id uuid := nullif(p_payload->>'financialAccountId', '')::uuid;
  v_source_type text := nullif(p_payload->>'sourceType', '');
  v_chart_account_id uuid := nullif(p_payload->>'chartAccountId', '')::uuid;
  v_result jsonb;
begin
  perform * from private.require_report_permission(v_workspace_id, 'financial.cashflow.view');

  if v_mode = 'forecast' then
    with entries as (
      select
        fi.id as entry_id,
        fd.id as document_id,
        fi.id as installment_id,
        null::uuid as settlement_id,
        fi.due_date as entry_date,
        case when fi.due_date < current_date then 'overdue' else 'forecast' end as status,
        fd.direction,
        fi.balance as amount,
        case when fd.direction = 'receivable' then fi.balance else -fi.balance end::numeric(18,2) as signed_amount,
        fd.description,
        fd.document_number,
        fd.source_type,
        fd.source_event,
        bp.trade_name as partner_name,
        coa.code as chart_account_code,
        coa.name as chart_account_name,
        null::text as financial_account_name
      from public.financial_installments fi
      join public.financial_documents fd on fd.id = fi.document_id
      left join public.business_partners bp on bp.id = fd.partner_id
      left join public.chart_of_accounts coa on coa.id = fd.chart_account_id
      where fi.workspace_id = v_workspace_id
        and fi.status in ('open', 'partially_settled')
        and fi.balance > 0
        and fd.status in ('posted', 'partially_settled')
        and fi.due_date between v_start and v_end
        and (v_direction is null or fd.direction = v_direction)
        and (v_source_type is null or fd.source_type = v_source_type)
        and (v_chart_account_id is null or fd.chart_account_id = v_chart_account_id)
    )
    select coalesce(jsonb_agg(to_jsonb(e) order by e.entry_date, abs(e.signed_amount) desc), '[]'::jsonb)
    into v_result
    from entries e;
  else
    with entries as (
      select
        fs.id as entry_id,
        fd.id as document_id,
        fs.installment_id,
        fs.id as settlement_id,
        fs.settled_on as entry_date,
        fs.settlement_type as status,
        fd.direction,
        fs.net_amount as amount,
        case
          when fd.direction = 'receivable' and fs.settlement_type = 'settlement' then fs.net_amount
          when fd.direction = 'receivable' and fs.settlement_type = 'reversal' then -fs.net_amount
          when fd.direction = 'payable' and fs.settlement_type = 'settlement' then -fs.net_amount
          else fs.net_amount
        end::numeric(18,2) as signed_amount,
        fd.description,
        fd.document_number,
        fd.source_type,
        fd.source_event,
        bp.trade_name as partner_name,
        coa.code as chart_account_code,
        coa.name as chart_account_name,
        fa.name as financial_account_name
      from public.financial_settlements fs
      join public.financial_documents fd on fd.id = fs.document_id
      join public.financial_accounts fa on fa.id = fs.financial_account_id
      left join public.business_partners bp on bp.id = fd.partner_id
      left join public.chart_of_accounts coa on coa.id = fd.chart_account_id
      where fs.workspace_id = v_workspace_id
        and fs.settled_on between v_start and v_end
        and (v_account_id is null or fs.financial_account_id = v_account_id)
        and (v_direction is null or fd.direction = v_direction)
        and (v_source_type is null or fd.source_type = v_source_type)
        and (v_chart_account_id is null or fd.chart_account_id = v_chart_account_id)
    )
    select coalesce(jsonb_agg(to_jsonb(e) order by e.entry_date desc, abs(e.signed_amount) desc), '[]'::jsonb)
    into v_result
    from entries e;
  end if;

  return jsonb_build_object('entries', v_result);
end;
$$;

create or replace function public.get_financial_dashboard(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_start date := (p_payload->>'startDate')::date;
  v_end date := (p_payload->>'endDate')::date;
  v_dre jsonb;
  v_cash jsonb;
  v_result jsonb;
begin
  perform * from private.require_report_permission(v_workspace_id, 'financial.dashboard.view');

  v_dre := public.get_dre_summary(jsonb_build_object(
    'workspaceId', v_workspace_id,
    'startDate', v_start,
    'endDate', v_end
  ));
  v_cash := public.get_cash_flow_summary(jsonb_build_object(
    'workspaceId', v_workspace_id,
    'startDate', v_start,
    'endDate', v_end
  ));

  with open_installments as (
    select fi.*, fd.direction
    from public.financial_installments fi
    join public.financial_documents fd on fd.id = fi.document_id
    where fi.workspace_id = v_workspace_id
      and fi.status in ('open', 'partially_settled')
      and fi.balance > 0
      and fd.status in ('posted', 'partially_settled')
  ),
  positions as (
    select
      coalesce(sum(balance) filter (where direction = 'receivable'), 0)::numeric(18,2) as receivable_open,
      coalesce(sum(balance) filter (where direction = 'payable'), 0)::numeric(18,2) as payable_open,
      coalesce(sum(balance) filter (where direction = 'receivable' and due_date < current_date), 0)::numeric(18,2) as receivable_overdue,
      coalesce(sum(balance) filter (where direction = 'payable' and due_date < current_date), 0)::numeric(18,2) as payable_overdue,
      coalesce(sum(balance) filter (where due_date between current_date and current_date + 7), 0)::numeric(18,2) as due_next_7d
    from open_installments
  ),
  evolution_months as (
    select generate_series(
      date_trunc('month', v_end)::date - interval '11 months',
      date_trunc('month', v_end)::date,
      interval '1 month'
    )::date as month_start
  ),
  evolution as (
    select
      em.month_start,
      (em.month_start + interval '1 month - 1 day')::date as month_end
    from evolution_months em
  ),
  evolution_rows as (
    select
      to_char(e.month_start, 'YYYY-MM') as month,
      coalesce(sum(f.signed_amount) filter (where f.dre_group = 'gross_revenue'), 0)::numeric(18,2) as revenue,
      abs(coalesce(sum(f.signed_amount) filter (where f.dre_group in ('variable_cost', 'operating_expense', 'depreciation_amortization')), 0))::numeric(18,2) as costs_expenses,
      coalesce(sum(f.signed_amount), 0)::numeric(18,2) as result
    from evolution e
    left join private.financial_dre_facts(v_workspace_id, e.month_start, e.month_end, null) f on true
    group by e.month_start
  ),
  top_costs as (
    select
      coalesce(chart_account_id::text, 'unclassified') as id,
      coalesce(chart_account_name, 'Pendente de Classificacao') as name,
      coalesce(chart_account_code, 'SEM-CONTA') as code,
      abs(sum(signed_amount))::numeric(18,2) as amount
    from private.financial_dre_facts(v_workspace_id, v_start, v_end, null)
    where signed_amount < 0
    group by chart_account_id, chart_account_name, chart_account_code
    order by abs(sum(signed_amount)) desc
    limit 8
  ),
  unclassified as (
    select
      coalesce(sum(abs(signed_amount)) filter (where dre_group is null), 0)::numeric(18,2) as amount,
      count(distinct document_id) filter (where dre_group is null) as document_count
    from private.financial_dre_facts(v_workspace_id, v_start, v_end, null)
  ),
  needs_review as (
    select count(*) as count
    from public.financial_integration_jobs
    where workspace_id = v_workspace_id and status = 'needs_review'
  ),
  alerts as (
    select jsonb_agg(alert) as items
    from (
      select jsonb_build_object('type', 'receivable_overdue', 'label', 'Contas a receber vencidas', 'amount', p.receivable_overdue, 'severity', 'danger') as alert
      from positions p where p.receivable_overdue > 0
      union all
      select jsonb_build_object('type', 'payable_overdue', 'label', 'Contas a pagar vencidas', 'amount', p.payable_overdue, 'severity', 'danger')
      from positions p where p.payable_overdue > 0
      union all
      select jsonb_build_object('type', 'negative_projection_30d', 'label', 'Saldo projetado negativo em 30 dias', 'amount', ((v_cash->'realized'->>'closingBalance')::numeric + (v_cash->'projection'->>'net30d')::numeric), 'severity', 'danger')
      where ((v_cash->'realized'->>'closingBalance')::numeric + (v_cash->'projection'->>'net30d')::numeric) < 0
      union all
      select jsonb_build_object('type', 'unclassified_dre', 'label', 'Lancamentos sem classificacao de DRE', 'amount', u.amount, 'severity', 'warning')
      from unclassified u where u.amount > 0
      union all
      select jsonb_build_object('type', 'needs_review', 'label', 'Integracoes financeiras em revisao', 'count', n.count, 'severity', 'warning')
      from needs_review n where n.count > 0
    ) s
  )
  select jsonb_build_object(
    'startDate', v_start,
    'endDate', v_end,
    'dre', v_dre,
    'cashFlow', v_cash,
    'positions', to_jsonb(p),
    'evolution', coalesce((select jsonb_agg(to_jsonb(er) order by er.month) from evolution_rows er), '[]'::jsonb),
    'topCosts', coalesce((select jsonb_agg(to_jsonb(tc) order by tc.amount desc) from top_costs tc), '[]'::jsonb),
    'alerts', coalesce(a.items, '[]'::jsonb),
    'unclassified', to_jsonb(u)
  ) into v_result
  from positions p cross join unclassified u cross join alerts a;

  return v_result;
end;
$$;

revoke all on function public.get_dre_summary(jsonb) from public, anon;
revoke all on function public.get_dre_detail(jsonb) from public, anon;
revoke all on function public.get_cash_flow_summary(jsonb) from public, anon;
revoke all on function public.get_cash_flow_entries(jsonb) from public, anon;
revoke all on function public.get_financial_dashboard(jsonb) from public, anon;

grant execute on function public.get_dre_summary(jsonb) to authenticated;
grant execute on function public.get_dre_detail(jsonb) to authenticated;
grant execute on function public.get_cash_flow_summary(jsonb) to authenticated;
grant execute on function public.get_cash_flow_entries(jsonb) to authenticated;
grant execute on function public.get_financial_dashboard(jsonb) to authenticated;

comment on function public.get_dre_summary(jsonb) is
  'DRE gerencial por competencia. Usa financial_documents como fato economico canonico e allocations apenas para rateio/dimensao.';

comment on function public.get_cash_flow_summary(jsonb) is
  'Fluxo de caixa realizado por financial_settlements/settled_on e previsto por financial_installments/due_date.';
