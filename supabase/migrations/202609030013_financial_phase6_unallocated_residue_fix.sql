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
  select fd.*, bp.trade_name as partner_name
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
    coalesce(t.allocation_count, 0) > 0 as is_unallocated
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
    row_number() over (
      partition by f.document_id
      order by f.is_unallocated desc, f.fact_amount desc, f.chart_account_id nulls last
    ) as rn
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
