alter table public.financial_settlements
  add column batch_id uuid,
  add column batch_name text,
  add constraint financial_settlements_batch_metadata_chk check (
    (batch_id is null and batch_name is null)
    or (
      batch_id is not null
      and nullif(btrim(batch_name), '') is not null
      and length(btrim(batch_name)) <= 120
    )
  );

create index financial_settlements_batch_idx
  on public.financial_settlements(workspace_id, batch_id, settled_on desc)
  where batch_id is not null;

create or replace function public.settle_financial_installment_with_batch(
  p_payload jsonb,
  p_batch_id uuid,
  p_batch_name text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_settlement_id uuid;
begin
  if p_batch_id is null or nullif(btrim(p_batch_name), '') is null
    or length(btrim(p_batch_name)) > 120 then
    raise exception 'FINANCIAL_SETTLEMENT_BATCH_NAME_REQUIRED';
  end if;

  v_settlement_id := public.settle_financial_installment(p_payload);

  update public.financial_settlements
  set batch_id = p_batch_id,
      batch_name = btrim(p_batch_name)
  where id = v_settlement_id
    and settlement_type = 'settlement';

  if not found then
    raise exception 'FINANCIAL_SETTLEMENT_BATCH_UPDATE_FAILED';
  end if;

  return v_settlement_id;
end;
$$;

revoke all on function public.settle_financial_installment_with_batch(jsonb, uuid, text)
  from public, anon;
grant execute on function public.settle_financial_installment_with_batch(jsonb, uuid, text)
  to authenticated;

create or replace function public.get_cash_flow_settlement_batch_details(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
  v_result jsonb;
begin
  select workspace_id into v_workspace_id
  from public.financial_settlements
  where batch_id = p_batch_id
    and settlement_type = 'settlement'
  limit 1;

  if v_workspace_id is null then
    raise exception 'FINANCIAL_SETTLEMENT_BATCH_NOT_FOUND';
  end if;

  perform * from private.require_report_permission(v_workspace_id, 'financial.cashflow.view');

  select jsonb_build_object(
    'batch_id', p_batch_id,
    'batch_name', max(fs.batch_name),
    'signed_amount', sum(case when fd.direction = 'payable' then -fs.net_amount else fs.net_amount end),
    'entries', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'settlement_id', fs.id,
          'document_id', fd.id,
          'installment_id', fi.id,
          'installment_number', fi.installment_number,
          'entry_date', fs.settled_on,
          'direction', fd.direction,
          'amount', fs.net_amount,
          'signed_amount', case when fd.direction = 'payable' then -fs.net_amount else fs.net_amount end,
          'original_amount', fd.original_amount,
          'description', fd.description,
          'document_number', fd.document_number,
          'partner_name', bp.trade_name,
          'chart_account_code', coa.code,
          'chart_account_name', coa.name,
          'financial_account_name', fa.name,
          'payment_method', fs.payment_method,
          'notes', fs.notes,
          'allocations', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', alloc.id,
                'amount', alloc.amount,
                'percentage', alloc.percentage,
                'description', alloc.description,
                'chart_account_code', alloc_coa.code,
                'chart_account_name', alloc_coa.name,
                'cost_center_name', cc.name,
                'vehicle_plate', v.plate,
                'driver_name', d.name,
                'product_name', p.name,
                'business_partner_name', alloc_bp.trade_name,
                'freight_reference', coalesce(
                  nullif(f.snapshot->>'code', ''),
                  nullif(f.snapshot->>'freightCode', ''),
                  f.id::text
                )
              ) order by alloc.created_at, alloc.id
            )
            from public.financial_allocations alloc
            left join public.chart_of_accounts alloc_coa on alloc_coa.id = alloc.chart_account_id
            left join public.cost_centers cc on cc.id = alloc.cost_center_id
            left join public.vehicles v on v.id = alloc.vehicle_id
            left join public.drivers d on d.id = alloc.driver_id
            left join public.products p on p.id = alloc.product_id
            left join public.business_partners alloc_bp on alloc_bp.id = alloc.business_partner_id
            left join public.freights f on f.id = alloc.freight_id
            where alloc.document_id = fd.id
          ), '[]'::jsonb)
        ) order by fs.settled_on desc, fd.created_at desc, fs.id
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.financial_settlements fs
  join public.financial_documents fd on fd.id = fs.document_id
  join public.financial_installments fi on fi.id = fs.installment_id
  join public.financial_accounts fa on fa.id = fs.financial_account_id
  left join public.business_partners bp on bp.id = fd.partner_id
  left join public.chart_of_accounts coa on coa.id = fd.chart_account_id
  where fs.batch_id = p_batch_id
    and fs.settlement_type = 'settlement'
    and fs.workspace_id = v_workspace_id;

  return v_result;
end;
$$;

revoke all on function public.get_cash_flow_settlement_batch_details(uuid)
  from public, anon;
grant execute on function public.get_cash_flow_settlement_batch_details(uuid)
  to authenticated;
