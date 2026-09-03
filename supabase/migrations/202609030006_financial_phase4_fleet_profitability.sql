-- FROTAK - Financeiro Fase 4
-- Rentabilidade da frota baseada nos dados financeiros canonicos.

create index if not exists financial_documents_profitability_idx
  on public.financial_documents(workspace_id, competence_date, status, direction);

create index if not exists financial_allocations_profitability_vehicle_idx
  on public.financial_allocations(workspace_id, vehicle_id, freight_id);

create index if not exists financial_allocations_profitability_partner_idx
  on public.financial_allocations(workspace_id, business_partner_id, freight_id);

create index if not exists freights_profitability_idx
  on public.freights(workspace_id, lifecycle_status, completed_at, vehicle_id, billing_partner_id);

create or replace function public.get_fleet_profitability_summary(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_vehicle_id uuid default null,
  p_billing_partner_id uuid default null,
  p_sender_id uuid default null,
  p_recipient_id uuid default null,
  p_product_id uuid default null,
  p_implement_model text default null,
  p_payment_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_revenue numeric(18,2) := 0;
  v_costs numeric(18,2) := 0;
  v_unallocated_costs numeric(18,2) := 0;
begin
  perform private.require_financial_permission(p_workspace_id, 'financial.view');

  with eligible_docs as (
    select fd.*
    from public.financial_documents fd
    where fd.workspace_id = p_workspace_id
      and fd.status in ('posted', 'partially_settled', 'settled')
      and fd.competence_date between p_start_date and p_end_date
      and (p_billing_partner_id is null or fd.partner_id = p_billing_partner_id)
  ),
  freight_allocations as (
    select
      fd.direction,
      fa.amount,
      fa.vehicle_id,
      fa.freight_id,
      fa.product_id,
      f.sender_id,
      f.recipient_id,
      f.product_id as freight_product_id,
      f.freight_payment_type,
      f.billing_partner_id,
      f.trailer_ids
    from eligible_docs fd
    join public.financial_allocations fa on fa.document_id = fd.id
    left join public.freights f on f.id = fa.freight_id
    where (fa.vehicle_id is not null or fa.freight_id is not null)
      and (fa.freight_id is null or f.lifecycle_status = 'completed')
      and (p_vehicle_id is null or coalesce(fa.vehicle_id, f.vehicle_id) = p_vehicle_id)
      and (p_billing_partner_id is null or fd.partner_id = p_billing_partner_id or f.billing_partner_id = p_billing_partner_id)
      and (p_sender_id is null or f.sender_id = p_sender_id)
      and (p_recipient_id is null or f.recipient_id = p_recipient_id)
      and (p_product_id is null or coalesce(fa.product_id, f.product_id) = p_product_id)
      and (p_payment_type is null or f.freight_payment_type = p_payment_type)
      and (p_implement_model is null or exists (
        select 1
        from public.trailers tr
        where tr.id = any(coalesce(f.trailer_ids, '{}'::uuid[]))
          and coalesce(tr.implement_model, tr.model, tr.type) = p_implement_model
      ))
  ),
  unallocated as (
    select fd.id, fd.direction, fd.original_amount
    from eligible_docs fd
    where fd.direction = 'payable'
      and (p_vehicle_id is null and p_sender_id is null and p_recipient_id is null
        and p_product_id is null and p_implement_model is null and p_payment_type is null)
      and not exists (
        select 1
        from public.financial_allocations fa
        where fa.document_id = fd.id
          and (fa.vehicle_id is not null or fa.freight_id is not null)
      )
  )
  select
    coalesce(sum(amount) filter (where direction = 'receivable'), 0),
    coalesce(sum(amount) filter (where direction = 'payable'), 0),
    coalesce((select sum(original_amount) from unallocated), 0)
  into v_revenue, v_costs, v_unallocated_costs
  from freight_allocations;

  return jsonb_build_object(
    'revenue', v_revenue,
    'costs', v_costs,
    'result', v_revenue - v_costs,
    'margin', case when v_revenue > 0 then round(((v_revenue - v_costs) / v_revenue) * 100, 2) else 0 end,
    'unallocatedCosts', v_unallocated_costs
  );
end;
$$;

create or replace function public.get_vehicle_profitability(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_vehicle_id uuid default null,
  p_billing_partner_id uuid default null,
  p_sender_id uuid default null,
  p_recipient_id uuid default null,
  p_product_id uuid default null,
  p_implement_model text default null,
  p_payment_type text default null,
  p_sort text default 'most_profitable',
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.require_financial_permission(p_workspace_id, 'financial.view');

  return coalesce((
    with filtered_freights as (
      select f.*
      from public.freights f
      where f.workspace_id = p_workspace_id
        and f.lifecycle_status = 'completed'
        and f.completed_at::date between p_start_date and p_end_date
        and (p_vehicle_id is null or f.vehicle_id = p_vehicle_id)
        and (p_billing_partner_id is null or f.billing_partner_id = p_billing_partner_id)
        and (p_sender_id is null or f.sender_id = p_sender_id)
        and (p_recipient_id is null or f.recipient_id = p_recipient_id)
        and (p_product_id is null or f.product_id = p_product_id)
        and (p_payment_type is null or f.freight_payment_type = p_payment_type)
        and (p_implement_model is null or exists (
          select 1
          from public.trailers tr
          where tr.id = any(coalesce(f.trailer_ids, '{}'::uuid[]))
            and coalesce(tr.implement_model, tr.model, tr.type) = p_implement_model
        ))
    ),
    revenue as (
      select
        coalesce(fa.vehicle_id, f.vehicle_id) as vehicle_id,
        coalesce(sum(fa.amount), 0) as amount,
        count(distinct f.id) as freight_count
      from public.financial_documents fd
      join public.financial_allocations fa on fa.document_id = fd.id
      join filtered_freights f on f.id = fa.freight_id
      where fd.workspace_id = p_workspace_id
        and fd.direction = 'receivable'
        and fd.status in ('posted', 'partially_settled', 'settled')
        and fd.competence_date between p_start_date and p_end_date
      group by coalesce(fa.vehicle_id, f.vehicle_id)
    ),
    costs as (
      select
        coalesce(fa.vehicle_id, f.vehicle_id) as vehicle_id,
        coalesce(sum(fa.amount), 0) as amount
      from public.financial_documents fd
      join public.financial_allocations fa on fa.document_id = fd.id
      left join filtered_freights f on f.id = fa.freight_id
      where fd.workspace_id = p_workspace_id
        and fd.direction = 'payable'
        and fd.status in ('posted', 'partially_settled', 'settled')
        and fd.competence_date between p_start_date and p_end_date
        and (fa.vehicle_id is not null or fa.freight_id is not null)
        and (fa.freight_id is null or f.id is not null)
        and (p_vehicle_id is null or coalesce(fa.vehicle_id, f.vehicle_id) = p_vehicle_id)
        and (p_billing_partner_id is null or fd.partner_id = p_billing_partner_id or f.billing_partner_id = p_billing_partner_id)
        and (p_sender_id is null or f.sender_id = p_sender_id)
        and (p_recipient_id is null or f.recipient_id = p_recipient_id)
        and (p_product_id is null or coalesce(fa.product_id, f.product_id) = p_product_id)
        and (p_payment_type is null or f.freight_payment_type = p_payment_type)
        and (p_implement_model is null or exists (
          select 1
          from public.trailers tr
          where tr.id = any(coalesce(f.trailer_ids, '{}'::uuid[]))
            and coalesce(tr.implement_model, tr.model, tr.type) = p_implement_model
        ))
      group by coalesce(fa.vehicle_id, f.vehicle_id)
    ),
    base as (
      select
        v.id,
        v.plate,
        v.model,
        coalesce(d.name, '-') as driver_name,
        coalesce(r.amount, 0) as revenue,
        coalesce(c.amount, 0) as costs,
        coalesce(r.amount, 0) - coalesce(c.amount, 0) as result,
        case when coalesce(r.amount, 0) > 0
          then round(((coalesce(r.amount, 0) - coalesce(c.amount, 0)) / coalesce(r.amount, 0)) * 100, 2)
          else 0 end as margin,
        coalesce(r.freight_count, 0) as freight_count,
        coalesce(array_agg(distinct coalesce(tr.implement_model, tr.model, tr.type)) filter (where tr.id is not null), '{}'::text[]) as implement_models
      from public.vehicles v
      left join public.drivers d on d.id = v.driver_id
      left join revenue r on r.vehicle_id = v.id
      left join costs c on c.vehicle_id = v.id
      left join public.vehicle_trailers vt on vt.vehicle_id = v.id and vt.active = true
      left join public.trailers tr on tr.id = vt.trailer_id
      where v.tenant_id = (select tenant_id from public.workspaces where id = p_workspace_id)
        and (p_vehicle_id is null or v.id = p_vehicle_id)
        and (coalesce(r.amount, 0) <> 0 or coalesce(c.amount, 0) <> 0)
      group by v.id, v.plate, v.model, d.name, r.amount, c.amount, r.freight_count
    ),
    ordered as (
      select *
      from base
      order by
        case when p_sort = 'lowest_profit' then result end asc nulls last,
        case when p_sort = 'highest_revenue' then revenue end desc nulls last,
        case when p_sort = 'highest_cost' then costs end desc nulls last,
        case when p_sort not in ('lowest_profit', 'highest_revenue', 'highest_cost') then result end desc nulls last
      limit greatest(1, least(coalesce(p_limit, 100), 500))
    )
    select jsonb_agg(jsonb_build_object(
      'vehicleId', id,
      'plate', plate,
      'model', model,
      'driverName', driver_name,
      'revenue', revenue,
      'costs', costs,
      'result', result,
      'margin', margin,
      'freightCount', freight_count,
      'implementModels', implement_models
    ))
    from ordered
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_freight_profitability(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_vehicle_id uuid default null,
  p_billing_partner_id uuid default null,
  p_sender_id uuid default null,
  p_recipient_id uuid default null,
  p_product_id uuid default null,
  p_implement_model text default null,
  p_payment_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.require_financial_permission(p_workspace_id, 'financial.view');

  return coalesce((
    with filtered_freights as (
      select f.*
      from public.freights f
      where f.workspace_id = p_workspace_id
        and f.lifecycle_status = 'completed'
        and f.completed_at::date between p_start_date and p_end_date
        and (p_vehicle_id is null or f.vehicle_id = p_vehicle_id)
        and (p_billing_partner_id is null or f.billing_partner_id = p_billing_partner_id)
        and (p_sender_id is null or f.sender_id = p_sender_id)
        and (p_recipient_id is null or f.recipient_id = p_recipient_id)
        and (p_product_id is null or f.product_id = p_product_id)
        and (p_payment_type is null or f.freight_payment_type = p_payment_type)
        and (p_implement_model is null or exists (
          select 1
          from public.trailers tr
          where tr.id = any(coalesce(f.trailer_ids, '{}'::uuid[]))
            and coalesce(tr.implement_model, tr.model, tr.type) = p_implement_model
        ))
    ),
    revenue as (
      select fa.freight_id, coalesce(sum(fa.amount), 0) as amount
      from public.financial_documents fd
      join public.financial_allocations fa on fa.document_id = fd.id
      where fd.workspace_id = p_workspace_id
        and fd.direction = 'receivable'
        and fd.status in ('posted', 'partially_settled', 'settled')
        and fd.competence_date between p_start_date and p_end_date
        and fa.freight_id is not null
      group by fa.freight_id
    ),
    costs as (
      select fa.freight_id, coalesce(sum(fa.amount), 0) as amount
      from public.financial_documents fd
      join public.financial_allocations fa on fa.document_id = fd.id
      where fd.workspace_id = p_workspace_id
        and fd.direction = 'payable'
        and fd.status in ('posted', 'partially_settled', 'settled')
        and fd.competence_date between p_start_date and p_end_date
        and fa.freight_id is not null
      group by fa.freight_id
    )
    select jsonb_agg(jsonb_build_object(
      'freightId', f.id,
      'vehicleId', f.vehicle_id,
      'plate', coalesce(v.plate, f.snapshot->>'vehicle_plate', '-'),
      'driverName', coalesce(d.name, f.snapshot->>'driver_name', '-'),
      'senderId', f.sender_id,
      'senderName', coalesce(s.name, f.snapshot->>'sender_name', '-'),
      'recipientId', f.recipient_id,
      'recipientName', coalesce(rp.name, f.snapshot->>'recipient_name', '-'),
      'productId', f.product_id,
      'productName', coalesce(p.name, f.snapshot->>'product_name', '-'),
      'paymentType', f.freight_payment_type,
      'billingPartnerId', f.billing_partner_id,
      'billingPartnerName', coalesce(bp.trade_name, bp.legal_name, '-'),
      'revenue', coalesce(rv.amount, 0),
      'costs', coalesce(c.amount, 0),
      'result', coalesce(rv.amount, 0) - coalesce(c.amount, 0),
      'margin', case when coalesce(rv.amount, 0) > 0 then round(((coalesce(rv.amount, 0) - coalesce(c.amount, 0)) / coalesce(rv.amount, 0)) * 100, 2) else 0 end,
      'completedAt', f.completed_at
    ) order by f.completed_at desc)
    from filtered_freights f
    left join public.vehicles v on v.id = f.vehicle_id
    left join public.drivers d on d.id = f.driver_id
    left join public.senders s on s.id = f.sender_id
    left join public.recipients rp on rp.id = f.recipient_id
    left join public.products p on p.id = f.product_id
    left join public.business_partners bp on bp.id = f.billing_partner_id
    left join revenue rv on rv.freight_id = f.id
    left join costs c on c.freight_id = f.id
    where coalesce(rv.amount, 0) <> 0 or coalesce(c.amount, 0) <> 0
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_partner_profitability(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_vehicle_id uuid default null,
  p_billing_partner_id uuid default null,
  p_sender_id uuid default null,
  p_recipient_id uuid default null,
  p_product_id uuid default null,
  p_implement_model text default null,
  p_payment_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.require_financial_permission(p_workspace_id, 'financial.view');

  return coalesce((
    with freights_profit as (
      select *
      from jsonb_to_recordset(public.get_freight_profitability(
        p_workspace_id, p_start_date, p_end_date, p_vehicle_id, p_billing_partner_id,
        p_sender_id, p_recipient_id, p_product_id, p_implement_model, p_payment_type
      )) as x(
        "freightId" uuid,
        "billingPartnerId" uuid,
        "billingPartnerName" text,
        revenue numeric,
        costs numeric
      )
    ),
    base as (
      select
        "billingPartnerId" as partner_id,
        coalesce("billingPartnerName", 'Sem pagador') as partner_name,
        coalesce(sum(revenue), 0) as revenue,
        coalesce(sum(costs), 0) as costs,
        coalesce(sum(revenue), 0) - coalesce(sum(costs), 0) as result,
        case when coalesce(sum(revenue), 0) > 0
          then round(((coalesce(sum(revenue), 0) - coalesce(sum(costs), 0)) / coalesce(sum(revenue), 0)) * 100, 2)
          else 0 end as margin,
        count(distinct "freightId") as freight_count
      from freights_profit
      group by "billingPartnerId", "billingPartnerName"
    )
    select jsonb_agg(jsonb_build_object(
      'partnerId', partner_id,
      'partnerName', partner_name,
      'revenue', revenue,
      'costs', costs,
      'result', result,
      'margin', margin,
      'freightCount', freight_count
    ) order by result desc)
    from base
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_fleet_profitability_summary(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, text, text
) from public, anon;
revoke all on function public.get_vehicle_profitability(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, text, text, text, integer
) from public, anon;
revoke all on function public.get_freight_profitability(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, text, text
) from public, anon;
revoke all on function public.get_partner_profitability(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, text, text
) from public, anon;

grant execute on function public.get_fleet_profitability_summary(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, text, text
) to authenticated;
grant execute on function public.get_vehicle_profitability(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, text, text, text, integer
) to authenticated;
grant execute on function public.get_freight_profitability(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, text, text
) to authenticated;
grant execute on function public.get_partner_profitability(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, text, text
) to authenticated;
