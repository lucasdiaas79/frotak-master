-- DRE por periodo e por caminhao.
-- Mantem o mesmo rateio canonico do demonstrativo anual, mas agrega somente o
-- intervalo solicitado e permite filtrar uma apropriacao de veiculo depois do
-- balanceamento de cada documento/evento.

create or replace function private.financial_dre_period_facts(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_basis text,
  p_cost_center_id uuid default null,
  p_vehicle_id uuid default null
)
returns table (
  tenant_id uuid,
  workspace_id uuid,
  event_key text,
  document_id uuid,
  event_date date,
  direction text,
  description text,
  document_number text,
  source_type text,
  source_event text,
  partner_name text,
  chart_account_id uuid,
  chart_account_code text,
  chart_account_name text,
  dre_group text,
  cost_center_id uuid,
  vehicle_id uuid,
  is_unallocated boolean,
  signed_amount numeric,
  movement_amount numeric
)
language sql
security definer
set search_path = pg_catalog, public, private
as $$
with accrual_docs as (
  select
    fd.*,
    bp.trade_name as partner_name
  from public.financial_documents fd
  left join public.business_partners bp
    on bp.id = fd.partner_id
   and bp.tenant_id = fd.tenant_id
  where p_basis = 'accrual'
    and fd.workspace_id = p_workspace_id
    and fd.status in ('posted', 'partially_settled', 'settled')
    and fd.competence_date between p_start_date and p_end_date
),
accrual_alloc_totals as (
  select
    a.document_id,
    sum(a.amount)::numeric(18,2) as allocated_total,
    count(*) as allocation_count
  from public.financial_allocations a
  join accrual_docs d on d.id = a.document_id
  group by a.document_id
),
accrual_allocated as (
  select
    d.id::text as event_key,
    d.id as document_id,
    d.tenant_id,
    d.workspace_id,
    d.competence_date as event_date,
    d.direction,
    d.description,
    d.document_number,
    d.source_type,
    d.source_event,
    d.partner_name,
    d.original_amount as event_amount,
    case
      when coalesce(t.allocated_total, 0) <= d.original_amount then a.amount
      else round((a.amount / nullif(t.allocated_total, 0)) * d.original_amount, 2)
    end::numeric(18,2) as fact_amount,
    coalesce(a.chart_account_id, d.chart_account_id) as chart_account_id,
    a.cost_center_id,
    a.vehicle_id,
    false as is_unallocated
  from accrual_docs d
  join public.financial_allocations a on a.document_id = d.id
  join accrual_alloc_totals t on t.document_id = d.id
),
accrual_residual as (
  select
    d.id::text as event_key,
    d.id as document_id,
    d.tenant_id,
    d.workspace_id,
    d.competence_date as event_date,
    d.direction,
    d.description,
    d.document_number,
    d.source_type,
    d.source_event,
    d.partner_name,
    d.original_amount as event_amount,
    greatest(d.original_amount - coalesce(t.allocated_total, 0), 0)::numeric(18,2) as fact_amount,
    d.chart_account_id,
    null::uuid as cost_center_id,
    null::uuid as vehicle_id,
    true as is_unallocated
  from accrual_docs d
  left join accrual_alloc_totals t on t.document_id = d.id
  where coalesce(t.allocation_count, 0) = 0
     or d.original_amount > coalesce(t.allocated_total, 0)
),
accrual_raw as (
  select * from accrual_allocated
  union all
  select * from accrual_residual where fact_amount <> 0
),
accrual_rounded as (
  select
    r.*,
    sum(r.fact_amount) over (partition by r.event_key) as event_fact_total,
    row_number() over (
      partition by r.event_key
      order by r.is_unallocated desc, abs(r.fact_amount) desc, r.chart_account_id nulls last
    ) as rn
  from accrual_raw r
),
accrual_facts as (
  select
    ar.tenant_id,
    ar.workspace_id,
    ar.event_key,
    ar.document_id,
    ar.event_date,
    ar.direction,
    ar.description,
    ar.document_number,
    ar.source_type,
    ar.source_event,
    ar.partner_name,
    ar.chart_account_id,
    ar.cost_center_id,
    ar.vehicle_id,
    ar.is_unallocated,
    (
      case when ar.direction = 'receivable' then 1 else -1 end
      * case
          when ar.rn = 1 then ar.fact_amount + (ar.event_amount - ar.event_fact_total)
          else ar.fact_amount
        end
    )::numeric(18,2) as signed_amount
  from accrual_rounded ar
  where (p_cost_center_id is null or ar.cost_center_id = p_cost_center_id)
    and (p_vehicle_id is null or ar.vehicle_id = p_vehicle_id)
),
settlement_events as (
  select
    fs.id as event_id,
    fs.id::text as event_key,
    fs.document_id,
    fs.tenant_id,
    fs.workspace_id,
    fs.settled_on as event_date,
    fs.principal_amount as event_amount,
    case when fs.settlement_type = 'reversal' then -1 else 1 end as event_sign
  from public.financial_settlements fs
  where p_basis = 'cash'
    and fs.workspace_id = p_workspace_id
    and fs.settled_on between p_start_date and p_end_date
    and fs.principal_amount <> 0
),
settlement_docs as (
  select
    se.*,
    fd.direction,
    fd.description,
    fd.document_number,
    fd.source_type,
    fd.source_event,
    bp.trade_name as partner_name,
    fd.original_amount,
    fd.chart_account_id as document_chart_account_id
  from settlement_events se
  join public.financial_documents fd on fd.id = se.document_id
  left join public.business_partners bp
    on bp.id = fd.partner_id
   and bp.tenant_id = fd.tenant_id
  where fd.status in ('posted', 'partially_settled', 'settled')
),
settlement_document_ids as (
  select distinct document_id from settlement_docs
),
settlement_alloc_totals as (
  select
    a.document_id,
    sum(a.amount)::numeric(18,2) as allocated_total,
    count(*) as allocation_count
  from public.financial_allocations a
  join settlement_document_ids d on d.document_id = a.document_id
  group by a.document_id
),
settlement_allocated as (
  select
    d.event_key,
    d.document_id,
    d.tenant_id,
    d.workspace_id,
    d.event_date,
    d.direction,
    d.description,
    d.document_number,
    d.source_type,
    d.source_event,
    d.partner_name,
    d.event_amount,
    d.event_sign,
    case
      when coalesce(t.allocated_total, 0) <= d.original_amount
        then round((a.amount / nullif(d.original_amount, 0)) * d.event_amount, 2)
      else round((a.amount / nullif(t.allocated_total, 0)) * d.event_amount, 2)
    end::numeric(18,2) as fact_amount,
    coalesce(a.chart_account_id, d.document_chart_account_id) as chart_account_id,
    a.cost_center_id,
    a.vehicle_id,
    false as is_unallocated
  from settlement_docs d
  join public.financial_allocations a on a.document_id = d.document_id
  join settlement_alloc_totals t on t.document_id = d.document_id
),
settlement_residual as (
  select
    d.event_key,
    d.document_id,
    d.tenant_id,
    d.workspace_id,
    d.event_date,
    d.direction,
    d.description,
    d.document_number,
    d.source_type,
    d.source_event,
    d.partner_name,
    d.event_amount,
    d.event_sign,
    case
      when coalesce(t.allocation_count, 0) = 0 then d.event_amount
      when d.original_amount > coalesce(t.allocated_total, 0)
        then round(((d.original_amount - coalesce(t.allocated_total, 0)) / nullif(d.original_amount, 0)) * d.event_amount, 2)
      else 0
    end::numeric(18,2) as fact_amount,
    d.document_chart_account_id as chart_account_id,
    null::uuid as cost_center_id,
    null::uuid as vehicle_id,
    coalesce(t.allocation_count, 0) > 0 as is_unallocated
  from settlement_docs d
  left join settlement_alloc_totals t on t.document_id = d.document_id
  where coalesce(t.allocation_count, 0) = 0
     or d.original_amount > coalesce(t.allocated_total, 0)
),
settlement_raw as (
  select * from settlement_allocated
  union all
  select * from settlement_residual where fact_amount <> 0
),
settlement_rounded as (
  select
    r.*,
    sum(r.fact_amount) over (partition by r.event_key) as event_fact_total,
    row_number() over (
      partition by r.event_key
      order by r.is_unallocated desc, abs(r.fact_amount) desc, r.chart_account_id nulls last
    ) as rn
  from settlement_raw r
),
settlement_facts as (
  select
    sr.tenant_id,
    sr.workspace_id,
    sr.event_key,
    sr.document_id,
    sr.event_date,
    sr.direction,
    sr.description,
    sr.document_number,
    sr.source_type,
    sr.source_event,
    sr.partner_name,
    sr.chart_account_id,
    sr.cost_center_id,
    sr.vehicle_id,
    sr.is_unallocated,
    (
      case when sr.direction = 'receivable' then 1 else -1 end
      * sr.event_sign
      * case
          when sr.rn = 1 then sr.fact_amount + (sr.event_amount - sr.event_fact_total)
          else sr.fact_amount
        end
    )::numeric(18,2) as signed_amount
  from settlement_rounded sr
  where (p_cost_center_id is null or sr.cost_center_id = p_cost_center_id)
    and (p_vehicle_id is null or sr.vehicle_id = p_vehicle_id)
),
adjustment_events as (
  select
    fd.id::text || ':' || orig.id::text as event_key,
    fd.id as document_id,
    fd.tenant_id,
    fd.workspace_id,
    orig.settled_on as event_date,
    1 as event_sign,
    fd.direction,
    fd.description,
    fd.document_number,
    fd.source_type,
    fd.source_event,
    bp.trade_name as partner_name,
    fd.original_amount as event_amount,
    fd.chart_account_id as document_chart_account_id
  from public.financial_documents fd
  join public.financial_settlements orig on orig.id = fd.source_id
  left join public.business_partners bp
    on bp.id = fd.partner_id
   and bp.tenant_id = fd.tenant_id
  where p_basis = 'cash'
    and fd.workspace_id = p_workspace_id
    and fd.source_type = 'settlement_adjustment'
    and fd.status in ('posted', 'partially_settled', 'settled')
    and orig.settled_on between p_start_date and p_end_date

  union all

  select
    fd.id::text || ':' || rev.id::text as event_key,
    fd.id as document_id,
    fd.tenant_id,
    fd.workspace_id,
    rev.settled_on as event_date,
    -1 as event_sign,
    fd.direction,
    fd.description,
    fd.document_number,
    fd.source_type,
    fd.source_event,
    bp.trade_name as partner_name,
    fd.original_amount as event_amount,
    fd.chart_account_id as document_chart_account_id
  from public.financial_documents fd
  join public.financial_settlements orig on orig.id = fd.source_id
  join public.financial_settlements rev on rev.original_settlement_id = orig.id
  left join public.business_partners bp
    on bp.id = fd.partner_id
   and bp.tenant_id = fd.tenant_id
  where p_basis = 'cash'
    and fd.workspace_id = p_workspace_id
    and fd.source_type = 'settlement_adjustment'
    and fd.status in ('posted', 'partially_settled', 'settled')
    and rev.settlement_type = 'reversal'
    and rev.settled_on between p_start_date and p_end_date
),
adjustment_document_ids as (
  select distinct document_id from adjustment_events
),
adjustment_alloc_totals as (
  select
    a.document_id,
    sum(a.amount)::numeric(18,2) as allocated_total,
    count(*) as allocation_count
  from public.financial_allocations a
  join adjustment_document_ids e on e.document_id = a.document_id
  group by a.document_id
),
adjustment_allocated as (
  select
    e.event_key,
    e.document_id,
    e.tenant_id,
    e.workspace_id,
    e.event_date,
    e.direction,
    e.description,
    e.document_number,
    e.source_type,
    e.source_event,
    e.partner_name,
    e.event_amount,
    e.event_sign,
    case
      when coalesce(t.allocated_total, 0) <= e.event_amount then a.amount
      else round((a.amount / nullif(t.allocated_total, 0)) * e.event_amount, 2)
    end::numeric(18,2) as fact_amount,
    coalesce(a.chart_account_id, e.document_chart_account_id) as chart_account_id,
    a.cost_center_id,
    a.vehicle_id,
    false as is_unallocated
  from adjustment_events e
  join public.financial_allocations a on a.document_id = e.document_id
  join adjustment_alloc_totals t on t.document_id = e.document_id
),
adjustment_residual as (
  select
    e.event_key,
    e.document_id,
    e.tenant_id,
    e.workspace_id,
    e.event_date,
    e.direction,
    e.description,
    e.document_number,
    e.source_type,
    e.source_event,
    e.partner_name,
    e.event_amount,
    e.event_sign,
    greatest(e.event_amount - coalesce(t.allocated_total, 0), 0)::numeric(18,2) as fact_amount,
    e.document_chart_account_id as chart_account_id,
    null::uuid as cost_center_id,
    null::uuid as vehicle_id,
    coalesce(t.allocation_count, 0) > 0 as is_unallocated
  from adjustment_events e
  left join adjustment_alloc_totals t on t.document_id = e.document_id
  where coalesce(t.allocation_count, 0) = 0
     or e.event_amount > coalesce(t.allocated_total, 0)
),
adjustment_raw as (
  select * from adjustment_allocated
  union all
  select * from adjustment_residual where fact_amount <> 0
),
adjustment_rounded as (
  select
    r.*,
    sum(r.fact_amount) over (partition by r.event_key) as event_fact_total,
    row_number() over (
      partition by r.event_key
      order by r.is_unallocated desc, abs(r.fact_amount) desc, r.chart_account_id nulls last
    ) as rn
  from adjustment_raw r
),
adjustment_facts as (
  select
    ar.tenant_id,
    ar.workspace_id,
    ar.event_key,
    ar.document_id,
    ar.event_date,
    ar.direction,
    ar.description,
    ar.document_number,
    ar.source_type,
    ar.source_event,
    ar.partner_name,
    ar.chart_account_id,
    ar.cost_center_id,
    ar.vehicle_id,
    ar.is_unallocated,
    (
      case when ar.direction = 'receivable' then 1 else -1 end
      * ar.event_sign
      * case
          when ar.rn = 1 then ar.fact_amount + (ar.event_amount - ar.event_fact_total)
          else ar.fact_amount
        end
    )::numeric(18,2) as signed_amount
  from adjustment_rounded ar
  where (p_cost_center_id is null or ar.cost_center_id = p_cost_center_id)
    and (p_vehicle_id is null or ar.vehicle_id = p_vehicle_id)
),
facts as (
  select * from accrual_facts
  union all
  select * from settlement_facts
  union all
  select * from adjustment_facts
)
select
  f.tenant_id,
  f.workspace_id,
  f.event_key,
  f.document_id,
  f.event_date,
  f.direction,
  f.description,
  f.document_number,
  f.source_type,
  f.source_event,
  f.partner_name,
  f.chart_account_id,
  coa.code as chart_account_code,
  coa.name as chart_account_name,
  coa.dre_group,
  f.cost_center_id,
  f.vehicle_id,
  f.is_unallocated,
  f.signed_amount,
  abs(f.signed_amount)::numeric(18,2) as movement_amount
from facts f
left join public.chart_of_accounts coa
  on coa.id = f.chart_account_id
 and coa.tenant_id = f.tenant_id;
$$;

create or replace function public.get_dre_period_statement(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_start date := (p_payload->>'startDate')::date;
  v_end date := (p_payload->>'endDate')::date;
  v_basis text := coalesce(nullif(p_payload->>'basis', ''), 'accrual');
  v_cost_center_id uuid := nullif(p_payload->>'costCenterId', '')::uuid;
  v_vehicle_id uuid := nullif(p_payload->>'vehicleId', '')::uuid;
  v_tenant_id uuid;
  v_cost_center_name text;
  v_vehicle_plate text;
  v_result jsonb;
begin
  select tenant_id into v_tenant_id
  from private.require_report_permission(v_workspace_id, 'financial.dre.view');

  if v_start is null or v_end is null or v_end < v_start then
    raise exception 'FINANCIAL_INVALID_REPORT_PERIOD';
  end if;
  if v_basis not in ('accrual', 'cash') then
    raise exception 'FINANCIAL_INVALID_DRE_BASIS';
  end if;

  if v_cost_center_id is not null then
    select cc.name into v_cost_center_name
    from public.cost_centers cc
    where cc.id = v_cost_center_id
      and cc.workspace_id = v_workspace_id
      and cc.tenant_id = v_tenant_id;
    if not found then
      raise exception 'FINANCIAL_COST_CENTER_TENANT_MISMATCH';
    end if;
  end if;

  if v_vehicle_id is not null then
    select v.plate into v_vehicle_plate
    from public.vehicles v
    where v.id = v_vehicle_id
      and v.tenant_id = v_tenant_id;
    if not found then
      raise exception 'FINANCIAL_VEHICLE_TENANT_MISMATCH';
    end if;
  end if;

  with facts as materialized (
    select *
    from private.financial_dre_period_facts(
      v_workspace_id,
      v_start,
      v_end,
      v_basis,
      v_cost_center_id,
      v_vehicle_id
    )
  ),
  chart as (
    select
      coa.id,
      coa.code,
      coa.name,
      coa.account_type,
      coa.normal_balance,
      coa.dre_group,
      (length(coa.code) - length(replace(coa.code, '.', ''))) as level
    from public.chart_of_accounts coa
    where coa.tenant_id = v_tenant_id
      and coa.active = true
      and coa.code ~ '^(1|2|5)(\.|$)'
  ),
  account_rows as (
    select
      c.id,
      c.code,
      c.name,
      c.account_type,
      c.normal_balance,
      c.dre_group,
      c.level,
      coalesce(sum(f.signed_amount), 0)::numeric(18,2) as signed_amount,
      coalesce(sum(f.movement_amount), 0)::numeric(18,2) as movement_amount,
      count(distinct f.document_id)::integer as document_count
    from chart c
    left join facts f
      on f.chart_account_code = c.code
      or f.chart_account_code like c.code || '.%'
    group by c.id, c.code, c.name, c.account_type, c.normal_balance, c.dre_group, c.level
  ),
  filtered_rows as (
    select
      ar.*,
      case
        when ar.account_type = 'revenue' then ar.signed_amount
        else -ar.signed_amount
      end::numeric(18,2) as amount
    from account_rows ar
    where ar.movement_amount >= 0.01
  ),
  group_rows as (
    select
      coalesce(f.dre_group, 'unclassified') as dre_group,
      private.dre_group_label(coalesce(f.dre_group, 'unclassified')) as label,
      private.dre_group_order(coalesce(f.dre_group, 'unclassified')) as sort_order,
      count(distinct f.document_id) as document_count,
      sum(f.signed_amount)::numeric(18,2) as signed_amount,
      sum(f.movement_amount)::numeric(18,2) as movement_amount
    from facts f
    group by coalesce(f.dre_group, 'unclassified')
  ),
  totals as (
    select
      coalesce(sum(signed_amount) filter (where dre_group = 'gross_revenue'), 0)::numeric(18,2) as gross_revenue,
      coalesce(sum(signed_amount) filter (where dre_group = 'discounts_obtained'), 0)::numeric(18,2) as discounts_obtained,
      coalesce(sum(signed_amount) filter (where dre_group = 'revenue_deduction'), 0)::numeric(18,2) as revenue_deductions,
      coalesce(sum(signed_amount) filter (where dre_group = 'variable_cost'), 0)::numeric(18,2) as variable_costs,
      coalesce(sum(signed_amount) filter (where dre_group = 'operating_expense'), 0)::numeric(18,2) as operating_expenses,
      coalesce(sum(signed_amount) filter (where dre_group = 'depreciation_amortization'), 0)::numeric(18,2) as depreciation_amortization,
      coalesce(sum(signed_amount) filter (where dre_group = 'financial_result'), 0)::numeric(18,2) as financial_result,
      coalesce(sum(signed_amount) filter (where dre_group = 'income_tax'), 0)::numeric(18,2) as income_tax,
      coalesce(sum(signed_amount) filter (where dre_group = 'other_result'), 0)::numeric(18,2) as other_result,
      coalesce(sum(signed_amount) filter (where dre_group is null), 0)::numeric(18,2) as unclassified_result,
      coalesce(sum(movement_amount) filter (where dre_group is null), 0)::numeric(18,2) as unclassified_amount,
      coalesce(sum(movement_amount) filter (where is_unallocated), 0)::numeric(18,2) as unallocated_amount,
      coalesce(sum(signed_amount), 0)::numeric(18,2) as managerial_result,
      coalesce(sum(movement_amount), 0)::numeric(18,2) as represented_total,
      count(distinct document_id) as document_count
    from facts
  )
  select jsonb_build_object(
    'basis', v_basis,
    'basisLabel', case when v_basis = 'cash' then 'Conciliacao' else 'Lancamento' end,
    'title', case when v_vehicle_id is null then 'DRE Gerencial' else 'DRE por caminhao' end,
    'startDate', v_start,
    'endDate', v_end,
    'costCenterId', v_cost_center_id,
    'costCenterName', v_cost_center_name,
    'vehicleId', v_vehicle_id,
    'vehiclePlate', v_vehicle_plate,
    'rows', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.code collate "C")
      from filtered_rows r
    ), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.sort_order)
      from group_rows g
    ), '[]'::jsonb),
    'totals', (
      select to_jsonb(t) || jsonb_build_object(
        'netRevenue', t.gross_revenue + t.revenue_deductions,
        'grossResult', t.gross_revenue + t.revenue_deductions + t.variable_costs,
        'operatingResult', t.gross_revenue + t.revenue_deductions + t.variable_costs
          + t.operating_expenses + t.depreciation_amortization,
        'managerialMargin', case
          when t.gross_revenue = 0 then null
          else round((t.managerial_result / t.gross_revenue) * 100, 2)
        end
      )
      from totals t
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function private.financial_dre_period_facts(uuid, date, date, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_dre_period_statement(jsonb) from public, anon;
grant execute on function public.get_dre_period_statement(jsonb) to authenticated;

comment on function public.get_dre_period_statement(jsonb) is
  'DRE consolidada por periodo, em base de lancamento ou conciliacao, com filtro opcional de apropriacao e caminhao.';
