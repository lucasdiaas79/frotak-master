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
      select jsonb_build_object('type', 'negative_projection_30d', 'label', 'Saldo projetado negativo em 30 dias', 'amount', ((v_cash->'realized'->>'closingBalance')::numeric + (v_cash->'projection'->>'net_30d')::numeric), 'severity', 'danger')
      where ((v_cash->'realized'->>'closingBalance')::numeric + (v_cash->'projection'->>'net_30d')::numeric) < 0
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
