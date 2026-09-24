-- Frotak Financeiro: listagem paginada de titulos sem carregar todo o historico
-- e todas as relacoes de cada documento.

create or replace function public.list_financial_documents_page(p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_direction text := nullif(p_payload->>'direction', '');
  v_search text := lower(nullif(btrim(p_payload->>'search'), ''));
  v_status text := nullif(p_payload->>'status', '');
  v_origin text := nullif(p_payload->>'origin', '');
  v_partner_id uuid := nullif(p_payload->>'partnerId', '')::uuid;
  v_chart_account_id uuid := nullif(p_payload->>'chartAccountId', '')::uuid;
  v_cost_center_id uuid := nullif(p_payload->>'costCenterId', '')::uuid;
  v_start date := nullif(p_payload->>'startDate', '')::date;
  v_end date := nullif(p_payload->>'endDate', '')::date;
  v_min numeric := nullif(p_payload->>'minAmount', '')::numeric;
  v_max numeric := nullif(p_payload->>'maxAmount', '')::numeric;
  v_page integer := greatest(coalesce((p_payload->>'page')::integer, 1), 1);
  v_page_size integer := least(greatest(coalesce((p_payload->>'pageSize')::integer, 50), 1), 100);
  v_offset integer;
  v_today date := current_date;
  v_date_7 date := current_date + 7;
  v_result jsonb;
begin
  if v_workspace_id is null then
    raise exception 'FINANCIAL_INVALID_WORKSPACE';
  end if;
  if v_direction not in ('receivable', 'payable') then
    raise exception 'FINANCIAL_INVALID_DIRECTION';
  end if;

  perform private.require_financial_permission(v_workspace_id, 'financial.view');
  v_offset := (v_page - 1) * v_page_size;

  with base as (
    select
      fd.id,
      fd.tenant_id,
      fd.workspace_id,
      fd.direction,
      fd.partner_id,
      fd.document_type,
      fd.document_number,
      fd.source_type,
      fd.source_id,
      fd.source_event,
      fd.description,
      fd.original_amount,
      fd.competence_date,
      fd.issue_date,
      fd.entry_date,
      fd.created_at,
      fd.currency,
      fd.status,
      fd.chart_account_id,
      fd.notes,
      bp.trade_name as partner_name,
      ca.name as account_name,
      alloc.cost_center_id,
      alloc.vehicle_id,
      alloc.driver_id,
      alloc.freight_id,
      alloc.product_id,
      coalesce(inst.balance, 0)::numeric(18,2) as balance,
      inst.first_due_date,
      inst.first_open_installment,
      inst.installment_count,
      coalesce(settle.settled_period_amount, 0)::numeric(18,2) as settled_period_amount,
      case
        when fd.status = 'draft' then 'draft'
        when fd.status = 'voided' then 'voided'
        when fd.status = 'settled' then 'settled'
        when fd.status = 'partially_settled' then 'partial'
        when coalesce(inst.balance, 0) > 0 and inst.first_due_date < v_today then 'overdue'
        else 'open'
      end as visual_status,
      case
        when fd.source_type is null then 'manual'
        when fd.source_type in ('payroll', 'payroll_advance') then 'payroll'
        when fd.source_type = 'recurring_rule' then 'recurring'
        when fd.source_type = 'fuel_record' then 'fuel'
        when fd.source_type in ('freight', 'freight_expense') then 'freight'
        else 'other'
      end as origin
    from public.financial_documents fd
    left join public.business_partners bp on bp.id = fd.partner_id
    left join public.chart_of_accounts ca on ca.id = fd.chart_account_id
    left join lateral (
      select
        coalesce(min(fi.due_date) filter (where fi.balance > 0), min(fi.due_date)) as first_due_date,
        count(*)::integer as installment_count,
        sum(fi.balance)::numeric(18,2) as balance,
        (array_agg(
          jsonb_build_object(
            'id', fi.id,
            'documentId', fi.document_id,
            'installmentNumber', fi.installment_number,
            'amount', fi.amount,
            'dueDate', fi.due_date,
            'status', fi.status,
            'settledAmount', fi.settled_amount,
            'balance', fi.balance
          )
          order by case when fi.balance > 0 then 0 else 1 end, fi.due_date, fi.installment_number
        ))[1] as first_open_installment
      from public.financial_installments fi
      where fi.document_id = fd.id
    ) inst on true
    left join lateral (
      select
        fa.cost_center_id,
        fa.vehicle_id,
        fa.driver_id,
        fa.freight_id,
        fa.product_id
      from public.financial_allocations fa
      where fa.document_id = fd.id
      order by fa.amount desc, fa.id
      limit 1
    ) alloc on true
    left join lateral (
      select
        coalesce(sum(fs.net_amount) filter (
          where fs.settlement_type = 'settlement'
            and fs.settled_on between coalesce(v_start, '-infinity'::date) and coalesce(v_end, 'infinity'::date)
            and not exists (
              select 1
              from public.financial_settlements rev
              where rev.original_settlement_id = fs.id
                and rev.settlement_type = 'reversal'
            )
        ), 0)::numeric(18,2) as settled_period_amount
      from public.financial_settlements fs
      where fs.document_id = fd.id
    ) settle on true
    where fd.workspace_id = v_workspace_id
      and fd.direction = v_direction
      and (fd.source_type is null or fd.source_type <> 'settlement_adjustment')
  ),
  filtered as (
    select b.*
    from base b
    where (v_search is null or lower(b.description || ' ' || coalesce(b.document_number, '') || ' ' || coalesce(b.partner_name, '')) like '%' || v_search || '%')
      and (v_status is null or v_status = 'all' or b.visual_status = v_status)
      and (v_origin is null or v_origin = 'all' or b.origin = v_origin)
      and (v_partner_id is null or b.partner_id = v_partner_id)
      and (v_chart_account_id is null or b.chart_account_id = v_chart_account_id)
      and (
        v_cost_center_id is null
        or exists (
          select 1
          from public.financial_allocations fa_filter
          where fa_filter.document_id = b.id
            and fa_filter.cost_center_id = v_cost_center_id
        )
      )
      and (v_start is null or b.first_due_date >= v_start)
      and (v_end is null or b.first_due_date <= v_end)
      and (v_min is null or b.balance >= v_min)
      and (v_max is null or b.balance <= v_max)
  ),
  totals as (
    select
      count(*)::integer as total_count,
      coalesce(sum(balance) filter (where status not in ('draft', 'voided', 'settled')), 0)::numeric(18,2) as open_balance,
      coalesce(sum(balance) filter (where balance > 0 and first_due_date < v_today), 0)::numeric(18,2) as overdue_amount,
      count(*) filter (where balance > 0 and first_due_date < v_today)::integer as overdue_count,
      coalesce(sum(settled_period_amount), 0)::numeric(18,2) as settled_period_amount,
      coalesce(sum(balance) filter (where balance > 0 and first_due_date between v_today and v_date_7), 0)::numeric(18,2) as upcoming_amount,
      count(*) filter (where balance > 0 and first_due_date between v_today and v_date_7)::integer as upcoming_count,
      coalesce(sum(balance) filter (where balance > 0 and first_due_date < v_today), 0)::numeric(18,2) as pressure_overdue_amount,
      count(*) filter (where balance > 0 and first_due_date < v_today)::integer as pressure_overdue_count,
      coalesce(sum(balance) filter (where balance > 0 and first_due_date between v_today and v_date_7), 0)::numeric(18,2) as pressure_week_amount,
      count(*) filter (where balance > 0 and first_due_date between v_today and v_date_7)::integer as pressure_week_count,
      coalesce(sum(balance) filter (where balance > 0 and first_due_date > v_date_7 and first_due_date <= v_today + 15), 0)::numeric(18,2) as pressure_half_month_amount,
      count(*) filter (where balance > 0 and first_due_date > v_date_7 and first_due_date <= v_today + 15)::integer as pressure_half_month_count,
      coalesce(sum(balance) filter (where balance > 0 and first_due_date > v_today + 15 and first_due_date <= v_today + 30), 0)::numeric(18,2) as pressure_month_amount,
      count(*) filter (where balance > 0 and first_due_date > v_today + 15 and first_due_date <= v_today + 30)::integer as pressure_month_count,
      coalesce(sum(balance) filter (where balance > 0 and first_due_date > v_today + 30), 0)::numeric(18,2) as pressure_later_amount,
      count(*) filter (where balance > 0 and first_due_date > v_today + 30)::integer as pressure_later_count
    from filtered
  ),
  page as (
    select *
    from filtered
    order by coalesce(first_due_date, competence_date, created_at::date) asc, created_at desc, id
    limit v_page_size offset v_offset
  )
  select jsonb_build_object(
    'page', v_page,
    'pageSize', v_page_size,
    'total', totals.total_count,
    'summary', jsonb_build_object(
      'openBalance', totals.open_balance,
      'overdue', totals.overdue_amount,
      'overdueCount', totals.overdue_count,
      'settledPeriod', totals.settled_period_amount,
      'upcoming', totals.upcoming_amount,
      'upcomingCount', totals.upcoming_count,
      'payablePressure', jsonb_build_object(
        'overdue', jsonb_build_object('amount', totals.pressure_overdue_amount, 'count', totals.pressure_overdue_count),
        'week', jsonb_build_object('amount', totals.pressure_week_amount, 'count', totals.pressure_week_count),
        'halfMonth', jsonb_build_object('amount', totals.pressure_half_month_amount, 'count', totals.pressure_half_month_count),
        'month', jsonb_build_object('amount', totals.pressure_month_amount, 'count', totals.pressure_month_count),
        'later', jsonb_build_object('amount', totals.pressure_later_amount, 'count', totals.pressure_later_count)
      )
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'tenantId', p.tenant_id,
        'workspaceId', p.workspace_id,
        'direction', p.direction,
        'partnerId', p.partner_id,
        'documentType', p.document_type,
        'sourceType', p.source_type,
        'sourceId', p.source_id,
        'sourceEvent', p.source_event,
        'description', p.description,
        'originalAmount', p.original_amount,
        'competenceDate', p.competence_date,
        'issueDate', p.issue_date,
        'entryDate', p.entry_date,
        'currency', p.currency,
        'status', p.status,
        'chartAccountId', p.chart_account_id,
        'documentNumber', p.document_number,
        'notes', p.notes,
        'partnerName', p.partner_name,
        'accountName', p.account_name,
        'outstandingBalance', p.balance,
        'costCenterId', p.cost_center_id,
        'vehicleId', p.vehicle_id,
        'driverId', p.driver_id,
        'freightId', p.freight_id,
        'productId', p.product_id,
        'installmentCount', p.installment_count,
        'installments', case when p.first_open_installment is null then '[]'::jsonb else jsonb_build_array(p.first_open_installment) end,
        'settlements', coalesce(page_settle.active_settlements, '[]'::jsonb)
      ) order by coalesce(p.first_due_date, p.competence_date, p.created_at::date) asc, p.created_at desc, p.id)
      from page p
      left join lateral (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', fs.id,
            'documentId', fs.document_id,
            'installmentId', fs.installment_id,
            'financialAccountId', fs.financial_account_id,
            'settlementType', fs.settlement_type,
            'originalSettlementId', fs.original_settlement_id,
            'principalAmount', fs.principal_amount,
            'interestAmount', fs.interest_amount,
            'penaltyAmount', fs.penalty_amount,
            'discountAmount', fs.discount_amount,
            'netAmount', fs.net_amount,
            'settledOn', fs.settled_on,
            'paymentMethod', fs.payment_method,
            'notes', fs.notes,
            'reversalReason', fs.reversal_reason,
            'createdAt', fs.created_at
          )
          order by fs.settled_on desc, fs.created_at desc
        ) filter (
          where fs.settlement_type = 'settlement'
            and not exists (
              select 1
              from public.financial_settlements rev
              where rev.original_settlement_id = fs.id
                and rev.settlement_type = 'reversal'
            )
        ), '[]'::jsonb) as active_settlements
        from public.financial_settlements fs
        where fs.document_id = p.id
      ) page_settle on true
    ), '[]'::jsonb)
  )
  into v_result
  from totals;

  return coalesce(v_result, jsonb_build_object(
    'page', v_page,
    'pageSize', v_page_size,
    'total', 0,
    'summary', jsonb_build_object(
      'openBalance', 0,
      'overdue', 0,
      'overdueCount', 0,
      'settledPeriod', 0,
      'upcoming', 0,
      'upcomingCount', 0,
      'payablePressure', jsonb_build_object(
        'overdue', jsonb_build_object('amount', 0, 'count', 0),
        'week', jsonb_build_object('amount', 0, 'count', 0),
        'halfMonth', jsonb_build_object('amount', 0, 'count', 0),
        'month', jsonb_build_object('amount', 0, 'count', 0),
        'later', jsonb_build_object('amount', 0, 'count', 0)
      )
    ),
    'rows', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.list_financial_documents_page(jsonb) from public, anon;
grant execute on function public.list_financial_documents_page(jsonb) to authenticated;
