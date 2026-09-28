-- Vincula os vales de viagem ao posto, gera o contas a pagar correspondente
-- e separa despesas pagas com o caixa da viagem das obrigacoes da empresa.

alter table public.freight_cash_entries
  add column if not exists business_partner_id uuid
    references public.business_partners(id) on delete restrict,
  add column if not exists financial_account_id uuid
    references public.financial_accounts(id) on delete restrict;

create index if not exists freight_cash_entries_partner_id_idx
  on public.freight_cash_entries(business_partner_id);

create index if not exists freight_cash_entries_financial_account_id_idx
  on public.freight_cash_entries(financial_account_id);

alter table public.freight_expenses
  add column if not exists payment_source text;

alter table public.freight_expenses
  alter column payment_source set default 'company_payable';

alter table public.freight_expenses
  drop constraint if exists freight_expenses_payment_source_chk;

alter table public.freight_expenses
  add constraint freight_expenses_payment_source_chk check (
    payment_source is null or payment_source in ('trip_cash', 'company_payable')
  );

create index if not exists freight_expenses_trip_cash_idx
  on public.freight_expenses(tenant_id, trip_cycle_id, recorded_at)
  where payment_source = 'trip_cash';

create or replace function private.ensure_driver_cash_advance_accounts(
  p_tenant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_parent_id uuid;
  v_account_id uuid;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  insert into public.chart_of_accounts (
    tenant_id, code, name, account_type, normal_balance,
    dre_group, is_postable, is_system, active
  ) values (
    p_tenant_id, '9', 'OBRIGACOES OPERACIONAIS', 'liability', 'credit',
    null, false, true, true
  )
  on conflict (tenant_id, code) do update set
    name = excluded.name,
    account_type = excluded.account_type,
    normal_balance = excluded.normal_balance,
    dre_group = null,
    is_postable = false,
    is_system = true,
    active = true
  returning id into v_parent_id;

  insert into public.chart_of_accounts (
    tenant_id, parent_id, code, name, account_type, normal_balance,
    dre_group, is_postable, is_system, active
  ) values (
    p_tenant_id, v_parent_id, '9.001', 'VALES DE VIAGEM A PAGAR',
    'liability', 'credit', null, true, true, true
  )
  on conflict (tenant_id, code) do update set
    parent_id = excluded.parent_id,
    name = excluded.name,
    account_type = excluded.account_type,
    normal_balance = excluded.normal_balance,
    dre_group = null,
    is_postable = true,
    is_system = true,
    active = true
  returning id into v_account_id;

  return v_account_id;
end;
$$;

create or replace function private.ensure_driver_trip_wallet(
  p_workspace_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace public.workspaces;
  v_account_id uuid;
begin
  select * into v_workspace
  from public.workspaces
  where id = p_workspace_id;

  if not found then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  insert into public.financial_accounts (
    tenant_id, workspace_id, name, account_type,
    opening_balance, opening_balance_date, active
  ) values (
    v_workspace.tenant_id, v_workspace.id, 'Caixa em poder dos motoristas',
    'wallet', 0, current_date, true
  )
  on conflict (workspace_id, name) do update set
    active = true,
    updated_at = now()
  returning id into v_account_id;

  return v_account_id;
end;
$$;

create or replace function private.create_driver_cash_advance_financials()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
  v_partner_name text;
  v_chart_account_id uuid;
  v_cost_center_id uuid;
  v_wallet_id uuid;
  v_document_id uuid;
  v_due_days integer;
  v_vehicle_plate text;
begin
  -- Entradas legadas sem posto continuam preservadas, mas novos vales usam a
  -- RPC especifica e sempre chegam com parceiro validado.
  if new.business_partner_id is null then
    return new;
  end if;

  select bp.trade_name
    into v_partner_name
  from public.business_partners bp
  join public.business_partner_roles bpr
    on bpr.partner_id = bp.id
   and bpr.tenant_id = bp.tenant_id
   and bpr.role = 'supplier'
   and bpr.active = true
  where bp.id = new.business_partner_id
    and bp.tenant_id = new.tenant_id
    and bp.active = true;

  if not found then
    raise exception 'DRIVER_CASH_ENTRY_INVALID_STATION';
  end if;

  v_workspace_id := private.default_workspace_for_tenant(new.tenant_id);
  if v_workspace_id is null then
    raise exception 'DRIVER_CASH_ENTRY_WORKSPACE_NOT_FOUND';
  end if;

  perform private.ensure_financial_foundation_for_workspace(v_workspace_id);
  v_chart_account_id := private.ensure_driver_cash_advance_accounts(new.tenant_id);
  v_wallet_id := private.ensure_driver_trip_wallet(v_workspace_id);

  select plate into v_vehicle_plate
  from public.vehicles
  where id = new.vehicle_id
    and tenant_id = new.tenant_id;

  select id into v_cost_center_id
  from public.cost_centers
  where tenant_id = new.tenant_id
    and code = 'OPERACAO'
    and active = true
    and (workspace_id = v_workspace_id or workspace_id is null)
  order by (workspace_id = v_workspace_id) desc
  limit 1;

  insert into public.financial_documents (
    tenant_id, workspace_id, direction, partner_id, document_type,
    source_type, source_id, source_event, description, original_amount,
    competence_date, issue_date, entry_date, currency, status,
    chart_account_id, notes, posted_at, posted_by
  ) values (
    new.tenant_id, v_workspace_id, 'payable', new.business_partner_id,
    'driver_cash_advance', 'driver_cash_advance', new.id,
    'station_voucher_payable',
    'Vale de viagem - ' || v_partner_name ||
      case when v_vehicle_plate is null then '' else ' - ' || v_vehicle_plate end,
    new.amount, new.recorded_at::date, new.recorded_at::date,
    new.recorded_at::date, 'BRL', 'posted', v_chart_account_id,
    'Valor retirado pelo motorista no posto durante a viagem.',
    now(), new.recorded_by
  )
  on conflict (tenant_id, source_type, source_id, source_event)
    where source_type is not null and source_id is not null and source_event is not null
  do update set
    partner_id = excluded.partner_id,
    description = excluded.description
  returning id into v_document_id;

  if not exists (
    select 1 from public.financial_allocations where document_id = v_document_id
  ) then
    insert into public.financial_allocations (
      tenant_id, workspace_id, document_id, freight_id, vehicle_id, driver_id,
      business_partner_id, cost_center_id, chart_account_id,
      amount, percentage, description
    ) values (
      new.tenant_id, v_workspace_id, v_document_id, new.freight_id,
      new.vehicle_id, new.driver_id, new.business_partner_id,
      v_cost_center_id, v_chart_account_id, new.amount, 100,
      'Vale retirado no posto para o caixa da viagem'
    );
  end if;

  if not exists (
    select 1 from public.financial_installments where document_id = v_document_id
  ) then
    v_due_days := private.resolve_financial_due_days(
      v_workspace_id, new.business_partner_id, 'payable', null
    );

    insert into public.financial_installments (
      tenant_id, workspace_id, document_id, installment_number, amount, due_date
    ) values (
      new.tenant_id, v_workspace_id, v_document_id, 1, new.amount,
      new.recorded_at::date + v_due_days
    );
  end if;

  update public.freight_cash_entries
  set financial_account_id = v_wallet_id
  where id = new.id
    and tenant_id = new.tenant_id
    and financial_account_id is null;

  return new;
end;
$$;

drop trigger if exists freight_cash_entries_create_financials
  on public.freight_cash_entries;
create trigger freight_cash_entries_create_financials
after insert on public.freight_cash_entries
for each row execute function private.create_driver_cash_advance_financials();

create or replace function private.settle_driver_trip_cash_expense()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
  v_wallet_id uuid;
  v_document_id uuid;
  v_installment public.financial_installments;
begin
  if new.payment_source is distinct from 'trip_cash' then
    return new;
  end if;

  v_workspace_id := private.default_workspace_for_tenant(new.tenant_id);
  if v_workspace_id is null then
    raise exception 'DRIVER_TRIP_CASH_WORKSPACE_NOT_FOUND';
  end if;

  select id into v_document_id
  from public.financial_documents
  where tenant_id = new.tenant_id
    and workspace_id = v_workspace_id
    and source_type = 'freight_expense'
    and source_id = new.id
    and source_event = 'expense_posting';

  if v_document_id is null then
    raise exception 'DRIVER_TRIP_CASH_FINANCIAL_DOCUMENT_NOT_READY';
  end if;

  select * into v_installment
  from public.financial_installments
  where document_id = v_document_id
    and status in ('open', 'partially_settled')
  order by installment_number
  limit 1
  for update;

  if not found or v_installment.balance <> new.amount then
    raise exception 'DRIVER_TRIP_CASH_INSTALLMENT_INVALID';
  end if;

  v_wallet_id := private.ensure_driver_trip_wallet(v_workspace_id);

  insert into public.financial_settlements (
    tenant_id, workspace_id, document_id, installment_id,
    financial_account_id, principal_amount, interest_amount,
    penalty_amount, discount_amount, settled_on, payment_method, notes,
    created_by
  ) values (
    new.tenant_id, v_workspace_id, v_document_id, v_installment.id,
    v_wallet_id, new.amount, 0, 0, 0, new.recorded_at::date,
    'trip_cash', 'Pago pelo motorista com o caixa da viagem.',
    new.recorded_by
  );

  update public.financial_installments
  set settled_amount = amount,
      status = 'settled',
      settled_at = now()
  where id = v_installment.id;

  perform private.refresh_financial_document_status(v_document_id);
  return new;
end;
$$;

drop trigger if exists freight_expenses_settle_trip_cash
  on public.freight_expenses;
create trigger freight_expenses_settle_trip_cash
after insert on public.freight_expenses
for each row execute function private.settle_driver_trip_cash_expense();

create or replace view public.financial_account_balances
with (security_invoker = true)
as
with settlement_totals as (
  select
    fs.financial_account_id,
    sum(
      case
        when fd.direction = 'receivable' and fs.settlement_type = 'settlement' then fs.net_amount
        when fd.direction = 'receivable' and fs.settlement_type = 'reversal' then -fs.net_amount
        when fd.direction = 'payable' and fs.settlement_type = 'settlement' then -fs.net_amount
        else fs.net_amount
      end
    )::numeric(18,2) as amount
  from public.financial_settlements fs
  join public.financial_documents fd on fd.id = fs.document_id
  group by fs.financial_account_id
),
cash_entry_totals as (
  select
    ce.financial_account_id,
    sum(ce.amount)::numeric(18,2) as amount
  from public.freight_cash_entries ce
  where ce.financial_account_id is not null
  group by ce.financial_account_id
)
select
  fa.id, fa.tenant_id, fa.workspace_id, fa.name, fa.account_type, fa.bank_name,
  fa.agency, fa.account_number, fa.opening_balance, fa.opening_balance_date, fa.active,
  (
    fa.opening_balance
    + coalesce(st.amount, 0)
    + coalesce(ce.amount, 0)
  ) as current_balance
from public.financial_accounts fa
left join settlement_totals st on st.financial_account_id = fa.id
left join cash_entry_totals ce on ce.financial_account_id = fa.id;

grant select on public.financial_account_balances to authenticated;

-- Titulos de vale representam passivo e caixa, nao receita/despesa. A conta
-- 9.001 ja fica fora do DRE 12 meses; esta protecao cobre tambem o motor legado.
do $$
declare
  v_definition text;
  v_needle text := 'and fd.status in (''posted'', ''partially_settled'', ''settled'')';
begin
  v_definition := pg_get_functiondef(
    'private.financial_dre_facts(uuid,date,date,uuid)'::regprocedure
  );

  if position('driver_cash_advance' in v_definition) = 0 then
    if position(v_needle in v_definition) = 0 then
      raise exception 'FINANCIAL_DRE_FACTS_STATUS_FILTER_NOT_FOUND';
    end if;
    v_definition := replace(
      v_definition,
      v_needle,
      v_needle || E'\n    and coalesce(fd.source_type, '''') <> ''driver_cash_advance'''
    );
    execute v_definition;
  end if;
end;
$$;

create or replace function public.get_driver_cash_entry_stations()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
begin
  v_driver := private.current_driver();

  return coalesce((
    select jsonb_agg(
      jsonb_build_object('id', bp.id, 'name', bp.trade_name)
      order by bp.trade_name
    )
    from public.business_partners bp
    where bp.tenant_id = v_driver.tenant_id
      and bp.active = true
      and exists (
        select 1
        from public.business_partner_roles bpr
        where bpr.tenant_id = v_driver.tenant_id
          and bpr.partner_id = bp.id
          and bpr.role = 'supplier'
          and bpr.active = true
      )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.driver_app_register_station_cash_entry(
  p_station_partner_id uuid,
  p_amount numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_entry public.freight_cash_entries;
  v_trip_cycle_id uuid;
  v_station_name text;
begin
  v_driver := private.current_driver();

  if p_amount is null or p_amount <= 0 then
    raise exception 'cash entry amount required';
  end if;

  select bp.trade_name into v_station_name
  from public.business_partners bp
  where bp.id = p_station_partner_id
    and bp.tenant_id = v_driver.tenant_id
    and bp.active = true
    and exists (
      select 1
      from public.business_partner_roles bpr
      where bpr.tenant_id = v_driver.tenant_id
        and bpr.partner_id = bp.id
        and bpr.role = 'supplier'
        and bpr.active = true
    );

  if not found then
    raise exception 'station not found for authenticated driver tenant';
  end if;

  select * into v_vehicle
  from public.vehicles
  where driver_id = v_driver.id
    and tenant_id = v_driver.tenant_id
  order by (current_freight_id is not null) desc, updated_at desc
  limit 1;

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;
  if v_vehicle.current_freight_id is null then
    raise exception 'active freight not found for authenticated driver';
  end if;

  v_trip_cycle_id := private.trip_cycle_for_freight(
    v_vehicle.tenant_id, v_vehicle.current_freight_id
  );

  insert into public.freight_cash_entries (
    tenant_id, freight_id, trip_cycle_id, vehicle_id, driver_id,
    business_partner_id, origin, amount, notes, source, recorded_by
  ) values (
    v_vehicle.tenant_id, v_vehicle.current_freight_id, v_trip_cycle_id,
    v_vehicle.id, v_driver.id, p_station_partner_id, v_station_name,
    p_amount, nullif(btrim(p_notes), ''), 'driver_app', auth.uid()
  ) returning * into v_entry;

  insert into public.fleet_events (
    tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
    source, description, created_by, event_type, action_origin, metadata
  ) values (
    v_vehicle.tenant_id, v_vehicle.id, v_vehicle.current_freight_id,
    v_vehicle.status, v_vehicle.freight_stage, v_vehicle.city, v_vehicle.state,
    'Motorista', 'Vale de viagem retirado em ' || v_station_name,
    auth.uid(), 'driver_cash_entry_registered', 'driver_app',
    jsonb_build_object(
      'driver_id', v_driver.id,
      'cash_entry_id', v_entry.id,
      'station_partner_id', p_station_partner_id,
      'trip_cycle_id', v_trip_cycle_id
    )
  );

  return public.get_driver_app_context();
end;
$$;

create or replace function public.driver_app_register_expense_v2(
  p_category text,
  p_description text,
  p_amount numeric,
  p_notes text default null,
  p_payment_source text default 'company_payable'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_expense public.freight_expenses;
  v_trip_cycle_id uuid;
begin
  v_driver := private.current_driver();

  if p_category not in ('pedagio', 'alimentacao', 'estacionamento', 'manutencao', 'outros') then
    raise exception 'invalid expense category';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'expense amount required';
  end if;
  if nullif(btrim(coalesce(p_description, '')), '') is null then
    raise exception 'expense description required';
  end if;
  if p_payment_source not in ('trip_cash', 'company_payable') then
    raise exception 'invalid expense payment source';
  end if;

  select * into v_vehicle
  from public.vehicles
  where driver_id = v_driver.id
    and tenant_id = v_driver.tenant_id
  order by (current_freight_id is not null) desc, updated_at desc
  limit 1;

  if not found then
    raise exception 'vehicle not found for authenticated driver';
  end if;
  if v_vehicle.current_freight_id is null then
    raise exception 'active freight not found for authenticated driver';
  end if;

  v_trip_cycle_id := private.trip_cycle_for_freight(
    v_vehicle.tenant_id, v_vehicle.current_freight_id
  );

  insert into public.freight_expenses (
    tenant_id, freight_id, trip_cycle_id, vehicle_id, driver_id,
    category, description, amount, notes, payment_source, source, recorded_by
  ) values (
    v_vehicle.tenant_id, v_vehicle.current_freight_id, v_trip_cycle_id,
    v_vehicle.id, v_driver.id, p_category, btrim(p_description), p_amount,
    nullif(btrim(p_notes), ''), p_payment_source, 'driver_app', auth.uid()
  ) returning * into v_expense;

  insert into public.fleet_events (
    tenant_id, vehicle_id, freight_id, status, freight_stage, city, state,
    source, description, created_by, event_type, action_origin, metadata
  ) values (
    v_vehicle.tenant_id, v_vehicle.id, v_vehicle.current_freight_id,
    v_vehicle.status, v_vehicle.freight_stage, v_vehicle.city, v_vehicle.state,
    'Motorista', 'Despesa registrada pelo aplicativo do motorista', auth.uid(),
    'driver_expense_registered', 'driver_app',
    jsonb_build_object(
      'driver_id', v_driver.id,
      'expense_id', v_expense.id,
      'trip_cycle_id', v_trip_cycle_id,
      'payment_source', p_payment_source
    )
  );

  return public.get_driver_app_context();
end;
$$;

-- Enriquece o contexto sem duplicar a funcao extensa do app motorista.
do $$
declare
  v_definition text;
  v_cash_needle text := '''origin'', ce.origin,';
  v_expense_needle text := '''fuelRecordId'', fe.fuel_record_id,';
begin
  v_definition := pg_get_functiondef('public.get_driver_app_context()'::regprocedure);

  if position('''businessPartnerId''' in v_definition) = 0 then
    if position(v_cash_needle in v_definition) = 0 then
      raise exception 'DRIVER_CONTEXT_CASH_ENTRY_SHAPE_NOT_FOUND';
    end if;
    v_definition := replace(
      v_definition,
      v_cash_needle,
      v_cash_needle || E'\n        ''businessPartnerId'', ce.business_partner_id,\n        ''stationName'', coalesce((select bp.trade_name from public.business_partners bp where bp.id = ce.business_partner_id and bp.tenant_id = ce.tenant_id), ce.origin),'
    );
  end if;

  if position('''paymentSource''' in v_definition) = 0 then
    if position(v_expense_needle in v_definition) = 0 then
      raise exception 'DRIVER_CONTEXT_EXPENSE_SHAPE_NOT_FOUND';
    end if;
    v_definition := replace(
      v_definition,
      v_expense_needle,
      v_expense_needle || E'\n        ''paymentSource'', fe.payment_source,'
    );
  end if;

  execute v_definition;
end;
$$;

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
    and payment_source is distinct from 'company_payable';

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
      metadata = metadata || jsonb_build_object(
        'closingSummary', jsonb_build_object(
          'totalCashEntries', v_total_entries,
          'totalExpenses', v_total_expenses,
          'closingBalance', round((v_total_entries - v_total_expenses)::numeric, 2),
          'freightCount', v_freight_count,
          'completedFreightCount', v_completed_freight_count,
          'calculatedAt', now()
        )
      ),
      updated_at = now()
  where id = v_cycle_id
    and tenant_id = p_tenant_id;

  return v_cycle_id;
end;
$$;

revoke all on function private.ensure_driver_cash_advance_accounts(uuid)
  from public, anon, authenticated;
revoke all on function private.ensure_driver_trip_wallet(uuid)
  from public, anon, authenticated;
revoke all on function private.create_driver_cash_advance_financials()
  from public, anon, authenticated;
revoke all on function private.settle_driver_trip_cash_expense()
  from public, anon, authenticated;
revoke all on function public.get_driver_cash_entry_stations()
  from public, anon, authenticated;
revoke all on function public.driver_app_register_station_cash_entry(uuid, numeric, text)
  from public, anon, authenticated;
revoke all on function public.driver_app_register_expense_v2(text, text, numeric, text, text)
  from public, anon, authenticated;

grant execute on function public.get_driver_cash_entry_stations()
  to authenticated;
grant execute on function public.driver_app_register_station_cash_entry(uuid, numeric, text)
  to authenticated;
grant execute on function public.driver_app_register_expense_v2(text, text, numeric, text, text)
  to authenticated;

comment on column public.freight_cash_entries.business_partner_id is
  'Posto/fornecedor no qual o motorista retirou o vale de viagem.';
comment on column public.freight_expenses.payment_source is
  'trip_cash quando paga com o caixa da viagem; company_payable quando a empresa ainda pagara.';
comment on function public.get_driver_cash_entry_stations() is
  'Lista somente fornecedores ativos do tenant do motorista autenticado.';

notify pgrst, 'reload schema';
