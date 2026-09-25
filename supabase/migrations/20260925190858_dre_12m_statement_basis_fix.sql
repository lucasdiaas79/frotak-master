-- Demonstrativo Gerencial 12 Meses
-- - corrige o alias legado 3.09 para Descontos Concedidos;
-- - cria um motor unico para a matriz anual por base de lancamento ou conciliacao.

create or replace function private.frotak_managerial_code_alias(p_code text)
returns text
language sql
immutable
as $$
  select case p_code
    when '3.01' then '1.002'
    when '3.02' then '1.001.005'
    when '3.03' then '1.003.0003.7'
    when '3.09' then '2.003.002'
    when '4.01' then '2.009.007'
    when '4.02' then '2.009.027'
    when '4.03' then '2.009.004'
    when '4.04' then '2.007.005'
    when '4.05' then '2.007.004.6'
    when '4.06' then '2.002.140'
    when '4.99' then '2.002.140'
    when '5.01' then '2.009.015.1'
    when '5.02' then '2.009.011'
    when '5.03' then '2.001.001.0005.2'
    when '5.04' then '2.009.026'
    when '5.05' then '2.002.140'
    when '5.06' then '2.005.003'
    when '6.01' then '5.3'
    when '7.01' then '2.003.007'
    when '7.02' then '5.003'
    when '7.03' then '2.003.001'
    when '7.04' then '2.003.009'
    when '8.01' then '2.006.008'
    when '8.99' then '2.002.140'
    else p_code
  end;
$$;

with discount_accounts as (
  select tenant_id, id
  from public.chart_of_accounts
  where code = '2.003.002'
    and active = true
),
discount_documents as (
  select fd.id, fd.tenant_id, da.id as target_account_id
  from public.financial_documents fd
  join discount_accounts da on da.tenant_id = fd.tenant_id
  where fd.direction = 'payable'
    and (
      fd.document_type = 'discount_granted'
      or (fd.source_type = 'settlement_adjustment' and fd.source_event = 'discount')
    )
)
update public.financial_documents fd
set chart_account_id = dd.target_account_id
from discount_documents dd
where fd.id = dd.id
  and fd.chart_account_id is distinct from dd.target_account_id;

with discount_accounts as (
  select tenant_id, id
  from public.chart_of_accounts
  where code = '2.003.002'
    and active = true
),
discount_documents as (
  select fd.id, fd.tenant_id, da.id as target_account_id
  from public.financial_documents fd
  join discount_accounts da on da.tenant_id = fd.tenant_id
  where fd.direction = 'payable'
    and (
      fd.document_type = 'discount_granted'
      or (fd.source_type = 'settlement_adjustment' and fd.source_event = 'discount')
    )
)
update public.financial_allocations fa
set chart_account_id = dd.target_account_id
from discount_documents dd
where fa.document_id = dd.id
  and fa.chart_account_id is distinct from dd.target_account_id;

with legacy_components as (
  select
    fs.id as settlement_id,
    fs.tenant_id,
    fs.workspace_id,
    fd.id as source_document_id,
    fd.partner_id,
    fd.description as source_description,
    fs.settled_on,
    component.source_event,
    component.document_type,
    component.direction,
    component.account_code,
    component.description_prefix,
    component.amount
  from public.financial_settlements fs
  join public.financial_documents fd on fd.id = fs.document_id
  cross join lateral (
    values
      ('interest', 'settlement_interest', 'payable', '2.003.001', 'Juros - ', fs.interest_amount),
      ('penalty', 'settlement_penalty', 'payable', '2.003.009', 'Multa - ', fs.penalty_amount),
      (
        'discount',
        case when fd.direction = 'payable' then 'discount_obtained' else 'discount_granted' end,
        case when fd.direction = 'payable' then 'receivable' else 'payable' end,
        case when fd.direction = 'payable' then '1.003.0003.7' else '2.003.002' end,
        case when fd.direction = 'payable' then 'Receita - Descontos Obtidos - ' else 'Desconto concedido - ' end,
        fs.discount_amount
      )
  ) as component(source_event, document_type, direction, account_code, description_prefix, amount)
  where fs.settlement_type = 'settlement'
    and component.amount > 0
),
legacy_adjustment_targets as (
  select lc.*, coa.id as chart_account_id
  from legacy_components lc
  join public.chart_of_accounts coa
    on coa.tenant_id = lc.tenant_id
   and coa.code = lc.account_code
   and coa.active = true
),
inserted_legacy_adjustments as (
  insert into public.financial_documents (
    tenant_id, workspace_id, direction, partner_id, document_type, source_type, source_id,
    source_event, description, original_amount, competence_date, issue_date, entry_date,
    currency, status, chart_account_id, notes
  )
  select
    lat.tenant_id,
    lat.workspace_id,
    lat.direction,
    lat.partner_id,
    lat.document_type,
    'settlement_adjustment',
    lat.settlement_id,
    lat.source_event,
    lat.description_prefix || lat.source_description,
    lat.amount,
    lat.settled_on,
    lat.settled_on,
    lat.settled_on,
    'BRL',
    'posted',
    lat.chart_account_id,
    'Backfill canonico de ajuste historico da baixa ' || lat.source_document_id
  from legacy_adjustment_targets lat
  where not exists (
    select 1
    from public.financial_documents existing
    where existing.tenant_id = lat.tenant_id
      and existing.source_type = 'settlement_adjustment'
      and existing.source_id = lat.settlement_id
      and existing.source_event = lat.source_event
  )
  returning id, tenant_id, workspace_id, source_id, source_event, original_amount, chart_account_id
),
legacy_adjustment_documents as (
  select
    fd.id,
    fd.tenant_id,
    fd.workspace_id,
    fd.source_id as settlement_id,
    fd.source_event,
    fd.original_amount,
    fd.chart_account_id,
    lat.source_document_id
  from public.financial_documents fd
  join legacy_adjustment_targets lat
    on lat.tenant_id = fd.tenant_id
   and lat.settlement_id = fd.source_id
   and lat.source_event = fd.source_event
  where fd.source_type = 'settlement_adjustment'

  union all

  select
    inserted.id,
    inserted.tenant_id,
    inserted.workspace_id,
    inserted.source_id as settlement_id,
    inserted.source_event,
    inserted.original_amount,
    inserted.chart_account_id,
    lat.source_document_id
  from inserted_legacy_adjustments inserted
  join legacy_adjustment_targets lat
    on lat.tenant_id = inserted.tenant_id
   and lat.settlement_id = inserted.source_id
   and lat.source_event = inserted.source_event
),
source_allocations as (
  select
    lad.id as adjustment_document_id,
    lad.tenant_id,
    lad.workspace_id,
    lad.original_amount as adjustment_amount,
    lad.chart_account_id as adjustment_chart_account_id,
    a.freight_id,
    a.vehicle_id,
    a.driver_id,
    a.business_partner_id,
    a.cost_center_id,
    a.product_id,
    a.amount,
    sum(a.amount) over (partition by lad.id) as total_amount,
    row_number() over (partition by lad.id order by a.amount desc, a.id) as rn
  from legacy_adjustment_documents lad
  join public.financial_allocations a on a.document_id = lad.source_document_id
  where not exists (
    select 1
    from public.financial_allocations existing
    where existing.document_id = lad.id
  )
),
calculated_allocations as (
  select
    *,
    round((amount / nullif(total_amount, 0)) * adjustment_amount, 2) as calculated_amount
  from source_allocations
),
balanced_allocations as (
  select
    *,
    case
      when rn = 1 then adjustment_amount - coalesce(sum(calculated_amount) over (partition by adjustment_document_id) - calculated_amount, 0)
      else calculated_amount
    end::numeric(18,2) as final_amount
  from calculated_allocations
)
insert into public.financial_allocations (
  tenant_id, workspace_id, document_id, freight_id, vehicle_id, driver_id,
  business_partner_id, cost_center_id, product_id, chart_account_id, amount,
  percentage, description
)
select
  tenant_id,
  workspace_id,
  adjustment_document_id,
  freight_id,
  vehicle_id,
  driver_id,
  business_partner_id,
  cost_center_id,
  product_id,
  adjustment_chart_account_id,
  final_amount,
  case when adjustment_amount = 0 then 0 else round((final_amount / adjustment_amount) * 100, 6) end,
  'Apropriacao de ajuste historico da baixa'
from balanced_allocations
where final_amount > 0;

create or replace function public.get_dre_12_month_statement(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_year integer := coalesce(nullif(p_payload->>'year', '')::integer, extract(year from current_date)::integer);
  v_basis text := coalesce(nullif(p_payload->>'basis', ''), 'accrual');
  v_cost_center_id uuid := nullif(p_payload->>'costCenterId', '')::uuid;
  v_start date;
  v_end date;
  v_result jsonb;
begin
  perform * from private.require_report_permission(v_workspace_id, 'financial.dre.view');

  if v_basis not in ('accrual', 'cash') then
    raise exception 'FINANCIAL_INVALID_DRE_BASIS';
  end if;

  v_start := make_date(v_year, 1, 1);
  v_end := make_date(v_year, 12, 31);

  with months as (
    select
      gs::int as month_index,
      make_date(v_year, gs::int, 1) as start_date,
      (make_date(v_year, gs::int, 1) + interval '1 month - 1 day')::date as end_date
    from generate_series(1, 12) gs
  ),
  accrual_facts as (
    select
      extract(month from f.competence_date)::int as month_index,
      f.chart_account_id,
      f.chart_account_code,
      f.chart_account_name,
      f.dre_group,
      f.signed_amount::numeric(18,2) as signed_amount
    from private.financial_dre_facts(v_workspace_id, v_start, v_end, v_cost_center_id) f
    where v_basis = 'accrual'
  ),
  settlement_events as (
    select
      fs.id as event_id,
      fs.document_id,
      fs.tenant_id,
      fs.workspace_id,
      fs.settled_on as event_date,
      fs.principal_amount,
      case when fs.settlement_type = 'reversal' then -1 else 1 end as event_sign
    from public.financial_settlements fs
    where v_basis = 'cash'
      and fs.workspace_id = v_workspace_id
      and fs.settled_on between v_start and v_end
      and fs.principal_amount <> 0
  ),
  settlement_docs as (
    select
      se.*,
      fd.direction,
      fd.original_amount,
      fd.chart_account_id as document_chart_account_id
    from settlement_events se
    join public.financial_documents fd on fd.id = se.document_id
    where fd.status in ('posted', 'partially_settled', 'settled')
  ),
  settlement_document_ids as (
    select distinct document_id
    from settlement_docs
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
      d.event_id,
      d.tenant_id,
      d.workspace_id,
      d.event_date,
      d.direction,
      d.principal_amount,
      d.event_sign,
      case
        when coalesce(t.allocated_total, 0) <= d.original_amount
          then round((a.amount / nullif(d.original_amount, 0)) * d.principal_amount, 2)
        else round((a.amount / nullif(t.allocated_total, 0)) * d.principal_amount, 2)
      end::numeric(18,2) as fact_amount,
      coalesce(a.chart_account_id, d.document_chart_account_id) as chart_account_id,
      a.cost_center_id,
      false as is_unallocated
    from settlement_docs d
    join public.financial_allocations a on a.document_id = d.document_id
    join settlement_alloc_totals t on t.document_id = d.document_id
  ),
  settlement_residual as (
    select
      d.event_id,
      d.tenant_id,
      d.workspace_id,
      d.event_date,
      d.direction,
      d.principal_amount,
      d.event_sign,
      case
        when coalesce(t.allocation_count, 0) = 0 then d.principal_amount
        when d.original_amount > coalesce(t.allocated_total, 0)
          then round(((d.original_amount - coalesce(t.allocated_total, 0)) / nullif(d.original_amount, 0)) * d.principal_amount, 2)
        else 0
      end::numeric(18,2) as fact_amount,
      d.document_chart_account_id as chart_account_id,
      null::uuid as cost_center_id,
      coalesce(t.allocation_count, 0) > 0 as is_unallocated
    from settlement_docs d
    left join settlement_alloc_totals t on t.document_id = d.document_id
    where coalesce(t.allocation_count, 0) = 0
       or d.original_amount > coalesce(t.allocated_total, 0)
  ),
  settlement_facts_raw as (
    select * from settlement_allocated
    union all
    select * from settlement_residual where fact_amount <> 0
  ),
  settlement_rounded as (
    select
      r.*,
      sum(r.fact_amount) over (partition by r.event_id) as event_fact_total,
      row_number() over (
        partition by r.event_id
        order by r.is_unallocated desc, abs(r.fact_amount) desc, r.chart_account_id nulls last
      ) as rn
    from settlement_facts_raw r
  ),
  settlement_facts as (
    select
      extract(month from sr.event_date)::int as month_index,
      sr.chart_account_id,
      coa.code as chart_account_code,
      coa.name as chart_account_name,
      coa.dre_group,
      (
        case when sr.direction = 'receivable' then 1 else -1 end
        * sr.event_sign
        * case
            when sr.rn = 1 then sr.fact_amount + (sr.principal_amount - sr.event_fact_total)
            else sr.fact_amount
          end
      )::numeric(18,2) as signed_amount
    from settlement_rounded sr
    left join public.chart_of_accounts coa on coa.id = sr.chart_account_id and coa.tenant_id = sr.tenant_id
    where v_cost_center_id is null or sr.cost_center_id = v_cost_center_id
  ),
  adjustment_events as (
    select
      (fd.id::text || ':' || orig.id::text)::text as event_key,
      fd.id as document_id,
      fd.tenant_id,
      fd.workspace_id,
      orig.settled_on as event_date,
      1 as event_sign,
      fd.direction,
      fd.original_amount,
      fd.chart_account_id as document_chart_account_id
    from public.financial_documents fd
    join public.financial_settlements orig on orig.id = fd.source_id
    where v_basis = 'cash'
      and fd.workspace_id = v_workspace_id
      and fd.source_type = 'settlement_adjustment'
      and fd.status in ('posted', 'partially_settled', 'settled')
      and orig.settled_on between v_start and v_end

    union all

    select
      (fd.id::text || ':' || rev.id::text)::text as event_key,
      fd.id as document_id,
      fd.tenant_id,
      fd.workspace_id,
      rev.settled_on as event_date,
      -1 as event_sign,
      fd.direction,
      fd.original_amount,
      fd.chart_account_id as document_chart_account_id
    from public.financial_documents fd
    join public.financial_settlements orig on orig.id = fd.source_id
    join public.financial_settlements rev on rev.original_settlement_id = orig.id
    where v_basis = 'cash'
      and fd.workspace_id = v_workspace_id
      and fd.source_type = 'settlement_adjustment'
      and fd.status in ('posted', 'partially_settled', 'settled')
      and rev.settlement_type = 'reversal'
      and rev.settled_on between v_start and v_end
  ),
  adjustment_document_ids as (
    select distinct document_id
    from adjustment_events
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
      e.tenant_id,
      e.event_date,
      e.direction,
      e.original_amount,
      e.event_sign,
      case
        when coalesce(t.allocated_total, 0) <= e.original_amount then a.amount
        else round((a.amount / nullif(t.allocated_total, 0)) * e.original_amount, 2)
      end::numeric(18,2) as fact_amount,
      coalesce(a.chart_account_id, e.document_chart_account_id) as chart_account_id,
      a.cost_center_id,
      false as is_unallocated
    from adjustment_events e
    join public.financial_allocations a on a.document_id = e.document_id
    join adjustment_alloc_totals t on t.document_id = e.document_id
  ),
  adjustment_residual as (
    select
      e.event_key,
      e.tenant_id,
      e.event_date,
      e.direction,
      e.original_amount,
      e.event_sign,
      greatest(e.original_amount - coalesce(t.allocated_total, 0), 0)::numeric(18,2) as fact_amount,
      e.document_chart_account_id as chart_account_id,
      null::uuid as cost_center_id,
      coalesce(t.allocation_count, 0) > 0 as is_unallocated
    from adjustment_events e
    left join adjustment_alloc_totals t on t.document_id = e.document_id
    where coalesce(t.allocation_count, 0) = 0
       or e.original_amount > coalesce(t.allocated_total, 0)
  ),
  adjustment_facts_raw as (
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
    from adjustment_facts_raw r
  ),
  adjustment_facts as (
    select
      extract(month from ar.event_date)::int as month_index,
      ar.chart_account_id,
      coa.code as chart_account_code,
      coa.name as chart_account_name,
      coa.dre_group,
      (
        case when ar.direction = 'receivable' then 1 else -1 end
        * ar.event_sign
        * case
            when ar.rn = 1 then ar.fact_amount + (ar.original_amount - ar.event_fact_total)
            else ar.fact_amount
          end
      )::numeric(18,2) as signed_amount
    from adjustment_rounded ar
    left join public.chart_of_accounts coa on coa.id = ar.chart_account_id and coa.tenant_id = ar.tenant_id
    where v_cost_center_id is null or ar.cost_center_id = v_cost_center_id
  ),
  facts as (
    select * from accrual_facts
    union all
    select * from settlement_facts
    union all
    select * from adjustment_facts
  ),
  facts_by_account as (
    select
      month_index,
      chart_account_code,
      sum(signed_amount)::numeric(18,2) as signed_amount,
      sum(abs(signed_amount))::numeric(18,2) as movement_amount
    from facts
    where chart_account_code is not null
    group by month_index, chart_account_code
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
    join public.workspaces w on w.tenant_id = coa.tenant_id and w.id = v_workspace_id
    where coa.active = true
      and coa.code ~ '^(1|2|5)(\.|$)'
  ),
  account_months as (
    select
      c.id,
      c.code,
      c.name,
      c.account_type,
      c.normal_balance,
      c.dre_group,
      c.level,
      m.month_index,
      coalesce(sum(f.signed_amount), 0)::numeric(18,2) as signed_amount,
      coalesce(sum(f.movement_amount), 0)::numeric(18,2) as movement_amount
    from chart c
    cross join months m
    left join facts_by_account f
      on f.month_index = m.month_index
     and (f.chart_account_code = c.code or f.chart_account_code like c.code || '.%')
    group by c.id, c.code, c.name, c.account_type, c.normal_balance, c.dre_group, c.level, m.month_index
  ),
  account_rows as (
    select
      am.id,
      am.code,
      am.name,
      am.account_type,
      am.normal_balance,
      am.dre_group,
      am.level,
      jsonb_agg(
        case when am.account_type = 'revenue' then am.signed_amount else -am.signed_amount end
        order by am.month_index
      ) as monthly,
      jsonb_agg(am.signed_amount order by am.month_index) as signed_monthly,
      sum(case when am.account_type = 'revenue' then am.signed_amount else -am.signed_amount end)::numeric(18,2) as total,
      sum(am.signed_amount)::numeric(18,2) as signed_total,
      case
        when count(*) filter (where abs(am.movement_amount) >= 0.01) > 0
          then (sum(case when am.account_type = 'revenue' then am.signed_amount else -am.signed_amount end)
            / count(*) filter (where abs(am.movement_amount) >= 0.01))::numeric(18,2)
        else 0::numeric(18,2)
      end as average,
      count(*) filter (where abs(am.movement_amount) >= 0.01) as movement_months
    from account_months am
    group by am.id, am.code, am.name, am.account_type, am.normal_balance, am.dre_group, am.level
  ),
  filtered_rows as (
    select *
    from account_rows
    where exists (
      select 1
      from jsonb_array_elements_text(account_rows.signed_monthly) as month_amount(value)
      where abs(month_amount.value::numeric) >= 0.01
    )
  )
  select jsonb_build_object(
    'year', v_year,
    'basis', v_basis,
    'basisLabel', case when v_basis = 'cash' then 'Conciliacao' else 'Lancamento' end,
    'title', case when v_basis = 'cash'
      then 'Demonstrativo gerencial 12 meses - Conciliacao'
      else 'Demonstrativo gerencial 12 meses'
    end,
    'startDate', v_start,
    'endDate', v_end,
    'months', (
      select jsonb_agg(jsonb_build_object(
        'index', m.month_index,
        'label', case m.month_index
          when 1 then 'Janeiro'
          when 2 then 'Fevereiro'
          when 3 then 'Março'
          when 4 then 'Abril'
          when 5 then 'Maio'
          when 6 then 'Junho'
          when 7 then 'Julho'
          when 8 then 'Agosto'
          when 9 then 'Setembro'
          when 10 then 'Outubro'
          when 11 then 'Novembro'
          when 12 then 'Dezembro'
        end,
        'startDate', m.start_date,
        'endDate', m.end_date
      ) order by m.month_index)
      from months m
    ),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.code collate "C")
      from filtered_rows r
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function private.frotak_managerial_code_alias(text) from public, anon, authenticated;
revoke all on function public.get_dre_12_month_statement(jsonb) from public, anon;
grant execute on function public.get_dre_12_month_statement(jsonb) to authenticated;

comment on function public.get_dre_12_month_statement(jsonb) is
  'Motor unico do Demonstrativo Gerencial 12 Meses. basis=accrual usa documentos/competencia; basis=cash usa baixas/conciliacao com estornos.';
