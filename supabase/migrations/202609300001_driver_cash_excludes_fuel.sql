-- Caixa do motorista considera somente entradas e despesas pagas com o caixa da viagem.
-- Abastecimentos continuam como custo operacional, mas descem como titulo a pagar da empresa.

alter table public.freight_expenses
  alter column payment_source set default 'company_payable';

update public.freight_expenses
set payment_source = 'company_payable',
    updated_at = now()
where fuel_record_id is not null
  and payment_source is distinct from 'company_payable';

update public.freight_expenses
set payment_source = 'trip_cash',
    updated_at = now()
where fuel_record_id is null
  and payment_source is null;

create or replace function private.close_open_driver_trip_cycle(
  p_tenant_id uuid,
  p_driver_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_cycle_id uuid;
  v_total_entries numeric(18,2);
  v_total_expenses numeric(18,2);
  v_freight_count integer;
  v_completed_freight_count integer;
begin
  if p_tenant_id is null or p_driver_id is null then
    return null;
  end if;

  select id into v_cycle_id
  from public.driver_trip_cycles
  where tenant_id = p_tenant_id
    and driver_id = p_driver_id
    and status = 'open'
  for update;

  if not found then
    return null;
  end if;

  select coalesce(sum(amount), 0)::numeric(18,2) into v_total_entries
  from public.freight_cash_entries
  where tenant_id = p_tenant_id
    and trip_cycle_id = v_cycle_id;

  select coalesce(sum(amount), 0)::numeric(18,2) into v_total_expenses
  from public.freight_expenses
  where tenant_id = p_tenant_id
    and trip_cycle_id = v_cycle_id
    and payment_source = 'trip_cash';

  select count(*)::integer,
         count(*) filter (where lifecycle_status = 'completed')::integer
    into v_freight_count, v_completed_freight_count
  from public.freights
  where tenant_id = p_tenant_id
    and trip_cycle_id = v_cycle_id;

  update public.driver_trip_cycles
  set status = 'closed',
      closed_at = now(),
      close_reason = coalesce(nullif(btrim(p_reason), ''), 'driver_return_completed'),
      total_cash_entries = v_total_entries,
      total_expenses = v_total_expenses,
      closing_balance = round((v_total_entries - v_total_expenses)::numeric, 2),
      freight_count = v_freight_count,
      completed_freight_count = v_completed_freight_count,
      summary_calculated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'closingSummary', jsonb_build_object(
          'totalCashEntries', v_total_entries,
          'totalExpenses', v_total_expenses,
          'closingBalance', round((v_total_entries - v_total_expenses)::numeric, 2),
          'freightCount', v_freight_count,
          'completedFreightCount', v_completed_freight_count,
          'calculatedAt', now(),
          'cashRule', 'trip_cash_only'
        )
      ),
      updated_at = now()
  where id = v_cycle_id
    and tenant_id = p_tenant_id;

  return v_cycle_id;
end;
$$;

do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('public.get_driver_app_context()'::regprocedure);

  if position('and fe.payment_source = ''trip_cash''' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'from public.freight_expenses fe
      where fe.tenant_id = v_driver.tenant_id',
      'from public.freight_expenses fe
      where fe.tenant_id = v_driver.tenant_id
        and fe.payment_source = ''trip_cash'''
    );
    execute v_definition;
  end if;
end;
$$;

with summaries as (
  select
    tc.id,
    coalesce((
      select sum(ce.amount)
      from public.freight_cash_entries ce
      where ce.tenant_id = tc.tenant_id and ce.trip_cycle_id = tc.id
    ), 0)::numeric(18,2) as total_entries,
    coalesce((
      select sum(fe.amount)
      from public.freight_expenses fe
      where fe.tenant_id = tc.tenant_id
        and fe.trip_cycle_id = tc.id
        and fe.payment_source = 'trip_cash'
    ), 0)::numeric(18,2) as total_expenses
  from public.driver_trip_cycles tc
  where tc.status = 'closed'
)
update public.driver_trip_cycles tc
set total_cash_entries = summary.total_entries,
    total_expenses = summary.total_expenses,
    closing_balance = round((summary.total_entries - summary.total_expenses)::numeric, 2),
    summary_calculated_at = now(),
    metadata = coalesce(tc.metadata, '{}'::jsonb) || jsonb_build_object(
      'closingSummary', coalesce(tc.metadata->'closingSummary', '{}'::jsonb) || jsonb_build_object(
        'totalCashEntries', summary.total_entries,
        'totalExpenses', summary.total_expenses,
        'closingBalance', round((summary.total_entries - summary.total_expenses)::numeric, 2),
        'calculatedAt', now(),
        'cashRule', 'trip_cash_only'
      )
    ),
    updated_at = now()
from summaries summary
where tc.id = summary.id
  and (
    tc.total_cash_entries is distinct from summary.total_entries
    or tc.total_expenses is distinct from summary.total_expenses
    or tc.closing_balance is distinct from round((summary.total_entries - summary.total_expenses)::numeric, 2)
  );

comment on column public.driver_trip_cycles.closing_balance is
  'Saldo congelado do caixa do motorista: entradas menos despesas pagas com trip_cash. Abastecimentos geram titulo a pagar e nao abatem este caixa.';

notify pgrst, 'reload schema';
