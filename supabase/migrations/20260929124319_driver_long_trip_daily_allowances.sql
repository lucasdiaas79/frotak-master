-- Diarias do motorista para ciclos de tiro longo.
-- A quantidade e informada pelo motorista; o valor unitario e controlado pela empresa.

create table public.driver_daily_allowance_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  enabled boolean not null default false,
  daily_amount numeric(18,2) not null default 0,
  payment_due_days integer not null default 5,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_daily_allowance_settings_amount_chk check (daily_amount >= 0),
  constraint driver_daily_allowance_settings_due_days_chk check (
    payment_due_days between 0 and 365
  )
);

create unique index driver_daily_allowance_settings_tenant_workspace_uidx
  on public.driver_daily_allowance_settings(tenant_id, workspace_id);

create trigger driver_daily_allowance_settings_set_updated_at
before update on public.driver_daily_allowance_settings
for each row execute function public.set_updated_at();

create table public.driver_trip_daily_allowances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  trip_cycle_id uuid not null references public.driver_trip_cycles(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  quantity integer not null,
  unit_amount numeric(18,2) not null,
  total_amount numeric(18,2) generated always as (quantity * unit_amount) stored,
  status text not null default 'submitted',
  notes text,
  submitted_by uuid references auth.users(id) on delete set null default auth.uid(),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  financial_document_id uuid references public.financial_documents(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_trip_daily_allowances_cycle_uidx unique(trip_cycle_id),
  constraint driver_trip_daily_allowances_quantity_chk check (quantity between 1 and 120),
  constraint driver_trip_daily_allowances_unit_amount_chk check (unit_amount > 0),
  constraint driver_trip_daily_allowances_status_chk check (
    status in ('submitted', 'approved', 'rejected', 'cancelled')
  )
);

create index driver_trip_daily_allowances_workspace_status_idx
  on public.driver_trip_daily_allowances(workspace_id, status, submitted_at desc);
create index driver_trip_daily_allowances_driver_idx
  on public.driver_trip_daily_allowances(tenant_id, driver_id, submitted_at desc);
create index driver_trip_daily_allowances_document_idx
  on public.driver_trip_daily_allowances(financial_document_id)
  where financial_document_id is not null;

create trigger driver_trip_daily_allowances_set_updated_at
before update on public.driver_trip_daily_allowances
for each row execute function public.set_updated_at();

alter table public.driver_daily_allowance_settings enable row level security;
alter table public.driver_trip_daily_allowances enable row level security;

create policy driver_daily_allowance_settings_workspace_read
on public.driver_daily_allowance_settings
for select to authenticated
using (private.is_workspace_member(workspace_id));

create policy driver_trip_daily_allowances_workspace_read
on public.driver_trip_daily_allowances
for select to authenticated
using (private.is_workspace_member(workspace_id));

grant select on public.driver_daily_allowance_settings to authenticated;
grant select on public.driver_trip_daily_allowances to authenticated;

create or replace function private.validate_driver_daily_allowance_setting()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not exists (
    select 1
    from public.workspaces w
    where w.id = new.workspace_id
      and w.tenant_id = new.tenant_id
  ) then
    raise exception 'DAILY_ALLOWANCE_WORKSPACE_TENANT_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger driver_daily_allowance_settings_validate
before insert or update on public.driver_daily_allowance_settings
for each row execute function private.validate_driver_daily_allowance_setting();

create or replace function private.validate_driver_trip_daily_allowance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not exists (
    select 1
    from public.workspaces w
    where w.id = new.workspace_id
      and w.tenant_id = new.tenant_id
  ) then
    raise exception 'DAILY_ALLOWANCE_WORKSPACE_TENANT_MISMATCH';
  end if;

  if not exists (
    select 1
    from public.driver_trip_cycles tc
    where tc.id = new.trip_cycle_id
      and tc.tenant_id = new.tenant_id
      and tc.driver_id = new.driver_id
      and tc.workspace_id is not distinct from new.workspace_id
      and tc.vehicle_id is not distinct from new.vehicle_id
  ) then
    raise exception 'DAILY_ALLOWANCE_CYCLE_CONTEXT_MISMATCH';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = new.driver_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DAILY_ALLOWANCE_DRIVER_TENANT_MISMATCH';
  end if;

  if new.vehicle_id is not null and not exists (
    select 1 from public.vehicles v
    where v.id = new.vehicle_id and v.tenant_id = new.tenant_id
  ) then
    raise exception 'DAILY_ALLOWANCE_VEHICLE_TENANT_MISMATCH';
  end if;

  if new.financial_document_id is not null and not exists (
    select 1
    from public.financial_documents fd
    where fd.id = new.financial_document_id
      and fd.tenant_id = new.tenant_id
      and fd.workspace_id = new.workspace_id
  ) then
    raise exception 'DAILY_ALLOWANCE_DOCUMENT_CONTEXT_MISMATCH';
  end if;

  return new;
end;
$$;

create trigger driver_trip_daily_allowances_validate
before insert or update on public.driver_trip_daily_allowances
for each row execute function private.validate_driver_trip_daily_allowance();

create or replace function public.get_driver_daily_allowance_context()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_cycle public.driver_trip_cycles;
  v_setting public.driver_daily_allowance_settings;
  v_allowance public.driver_trip_daily_allowances;
begin
  v_driver := private.current_driver();

  select * into v_cycle
  from public.driver_trip_cycles tc
  where tc.tenant_id = v_driver.tenant_id
    and tc.driver_id = v_driver.id
    and tc.status = 'open'
  order by tc.started_at desc
  limit 1;

  if v_cycle.id is null then
    return jsonb_build_object(
      'enabled', false,
      'reason', 'no_open_trip_cycle',
      'allowance', null
    );
  end if;

  select * into v_setting
  from public.driver_daily_allowance_settings s
  where s.workspace_id = v_cycle.workspace_id
    and s.tenant_id = v_driver.tenant_id;

  select * into v_allowance
  from public.driver_trip_daily_allowances a
  where a.trip_cycle_id = v_cycle.id
    and a.tenant_id = v_driver.tenant_id;

  return jsonb_build_object(
    'enabled', coalesce(v_setting.enabled, false),
    'configured', coalesce(v_setting.daily_amount, 0) > 0,
    'tripCycleId', v_cycle.id,
    'tripCycleStartedAt', v_cycle.started_at,
    'dailyAmount', coalesce(v_setting.daily_amount, 0),
    'allowance', case when v_allowance.id is null then null else jsonb_build_object(
      'id', v_allowance.id,
      'quantity', v_allowance.quantity,
      'unitAmount', v_allowance.unit_amount,
      'totalAmount', v_allowance.total_amount,
      'status', v_allowance.status,
      'notes', v_allowance.notes,
      'submittedAt', v_allowance.submitted_at,
      'reviewNotes', v_allowance.review_notes,
      'reviewedAt', v_allowance.reviewed_at
    ) end
  );
end;
$$;

create or replace function public.driver_app_submit_daily_allowance(
  p_quantity integer,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_cycle public.driver_trip_cycles;
  v_setting public.driver_daily_allowance_settings;
  v_allowance public.driver_trip_daily_allowances;
begin
  v_driver := private.current_driver();

  if p_quantity is null or p_quantity < 1 or p_quantity > 120 then
    raise exception 'DAILY_ALLOWANCE_INVALID_QUANTITY';
  end if;

  select * into v_cycle
  from public.driver_trip_cycles tc
  where tc.tenant_id = v_driver.tenant_id
    and tc.driver_id = v_driver.id
    and tc.status = 'open'
  order by tc.started_at desc
  limit 1
  for update;

  if v_cycle.id is null then
    raise exception 'DAILY_ALLOWANCE_OPEN_CYCLE_NOT_FOUND';
  end if;

  select * into v_setting
  from public.driver_daily_allowance_settings s
  where s.workspace_id = v_cycle.workspace_id
    and s.tenant_id = v_driver.tenant_id
    and s.enabled = true;

  if v_setting.workspace_id is null or v_setting.daily_amount <= 0 then
    raise exception 'DAILY_ALLOWANCE_NOT_CONFIGURED';
  end if;

  insert into public.driver_trip_daily_allowances (
    tenant_id, workspace_id, trip_cycle_id, driver_id, vehicle_id,
    quantity, unit_amount, status, notes, submitted_by, submitted_at
  ) values (
    v_driver.tenant_id, v_cycle.workspace_id, v_cycle.id, v_driver.id,
    v_cycle.vehicle_id, p_quantity, v_setting.daily_amount, 'submitted',
    nullif(btrim(p_notes), ''), auth.uid(), now()
  )
  on conflict (trip_cycle_id) do update
  set quantity = excluded.quantity,
      unit_amount = excluded.unit_amount,
      status = 'submitted',
      notes = excluded.notes,
      submitted_by = auth.uid(),
      submitted_at = now(),
      reviewed_by = null,
      reviewed_at = null,
      review_notes = null
  where driver_trip_daily_allowances.status in ('submitted', 'rejected')
  returning * into v_allowance;

  if v_allowance.id is null then
    raise exception 'DAILY_ALLOWANCE_ALREADY_FINALIZED';
  end if;

  return public.get_driver_daily_allowance_context();
end;
$$;

create or replace function public.get_driver_daily_allowance_settings(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tenant_id uuid;
  v_setting public.driver_daily_allowance_settings;
begin
  perform private.require_financial_permission(p_workspace_id, 'financial.view');

  select tenant_id into v_tenant_id
  from public.workspaces
  where id = p_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'DAILY_ALLOWANCE_WORKSPACE_NOT_FOUND'; end if;

  select * into v_setting
  from public.driver_daily_allowance_settings
  where workspace_id = p_workspace_id and tenant_id = v_tenant_id;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'tenantId', v_tenant_id,
    'available', v_setting.workspace_id is not null,
    'enabled', coalesce(v_setting.enabled, false),
    'dailyAmount', coalesce(v_setting.daily_amount, 0),
    'paymentDueDays', coalesce(v_setting.payment_due_days, 5)
  );
end;
$$;

create or replace function public.save_driver_daily_allowance_settings(
  p_workspace_id uuid,
  p_enabled boolean,
  p_daily_amount numeric,
  p_payment_due_days integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tenant_id uuid;
begin
  perform private.require_financial_permission(p_workspace_id, 'financial.create');

  if p_daily_amount is null or p_daily_amount < 0 then
    raise exception 'DAILY_ALLOWANCE_INVALID_AMOUNT';
  end if;
  if coalesce(p_payment_due_days, 5) not between 0 and 365 then
    raise exception 'DAILY_ALLOWANCE_INVALID_DUE_DAYS';
  end if;
  if coalesce(p_enabled, false) and p_daily_amount <= 0 then
    raise exception 'DAILY_ALLOWANCE_AMOUNT_REQUIRED';
  end if;

  select tenant_id into v_tenant_id
  from public.workspaces
  where id = p_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'DAILY_ALLOWANCE_WORKSPACE_NOT_FOUND'; end if;

  insert into public.driver_daily_allowance_settings (
    workspace_id, tenant_id, enabled, daily_amount, payment_due_days, updated_by
  ) values (
    p_workspace_id, v_tenant_id, coalesce(p_enabled, false), p_daily_amount,
    coalesce(p_payment_due_days, 5), auth.uid()
  )
  on conflict (workspace_id) do update
  set enabled = excluded.enabled,
      daily_amount = excluded.daily_amount,
      payment_due_days = excluded.payment_due_days,
      updated_by = auth.uid();

  return public.get_driver_daily_allowance_settings(p_workspace_id);
end;
$$;

create or replace function public.list_driver_daily_allowances(
  p_workspace_id uuid,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tenant_id uuid;
begin
  perform private.require_financial_permission(p_workspace_id, 'financial.view');

  select tenant_id into v_tenant_id
  from public.workspaces
  where id = p_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'DAILY_ALLOWANCE_WORKSPACE_NOT_FOUND'; end if;
  if p_status is not null and p_status not in ('submitted', 'approved', 'rejected', 'cancelled') then
    raise exception 'DAILY_ALLOWANCE_INVALID_STATUS';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'tripCycleId', a.trip_cycle_id,
      'driverId', a.driver_id,
      'driverName', d.name,
      'vehicleId', a.vehicle_id,
      'vehiclePlate', coalesce(v.plate, 'Sem placa'),
      'quantity', a.quantity,
      'unitAmount', a.unit_amount,
      'totalAmount', a.total_amount,
      'status', a.status,
      'notes', a.notes,
      'submittedAt', a.submitted_at,
      'reviewedAt', a.reviewed_at,
      'reviewNotes', a.review_notes,
      'financialDocumentId', a.financial_document_id,
      'tripStartedAt', tc.started_at,
      'tripClosedAt', tc.closed_at,
      'freightCount', (
        select count(*) from public.freights f
        where f.tenant_id = a.tenant_id and f.trip_cycle_id = a.trip_cycle_id
      )
    ) order by a.submitted_at desc)
    from public.driver_trip_daily_allowances a
    join public.driver_trip_cycles tc
      on tc.id = a.trip_cycle_id and tc.tenant_id = a.tenant_id
    join public.drivers d on d.id = a.driver_id and d.tenant_id = a.tenant_id
    left join public.vehicles v on v.id = a.vehicle_id and v.tenant_id = a.tenant_id
    where a.workspace_id = p_workspace_id
      and a.tenant_id = v_tenant_id
      and (p_status is null or a.status = p_status)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.review_driver_daily_allowance(
  p_allowance_id uuid,
  p_action text,
  p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_allowance public.driver_trip_daily_allowances;
  v_setting public.driver_daily_allowance_settings;
  v_account_id uuid;
  v_cost_center_id uuid;
  v_document_id uuid;
  v_freight record;
  v_freight_count integer;
  v_freight_index integer := 0;
  v_revenue_total numeric := 0;
  v_allocated numeric(18,2) := 0;
  v_allocation_amount numeric(18,2);
begin
  if p_action is null or p_action not in ('approve', 'reject') then
    raise exception 'DAILY_ALLOWANCE_INVALID_REVIEW_ACTION';
  end if;

  select * into v_allowance
  from public.driver_trip_daily_allowances
  where id = p_allowance_id
  for update;
  if v_allowance.id is null then raise exception 'DAILY_ALLOWANCE_NOT_FOUND'; end if;

  perform private.require_financial_permission(v_allowance.workspace_id, 'financial.create');

  if v_allowance.status <> 'submitted' then
    raise exception 'DAILY_ALLOWANCE_NOT_PENDING';
  end if;

  if p_action = 'reject' then
    update public.driver_trip_daily_allowances
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
        review_notes = nullif(btrim(p_review_notes), '')
    where id = v_allowance.id;
    return jsonb_build_object('id', v_allowance.id, 'status', 'rejected');
  end if;

  select * into v_setting
  from public.driver_daily_allowance_settings
  where workspace_id = v_allowance.workspace_id
    and tenant_id = v_allowance.tenant_id;

  select id into v_account_id
  from public.chart_of_accounts
  where tenant_id = v_allowance.tenant_id
    and code = '2.007.004.6'
    and active = true
    and is_postable = true;
  if v_account_id is null then raise exception 'DAILY_ALLOWANCE_CHART_ACCOUNT_NOT_FOUND'; end if;

  select id into v_cost_center_id
  from public.cost_centers
  where tenant_id = v_allowance.tenant_id
    and code = 'OPERACAO'
    and active = true
    and (workspace_id = v_allowance.workspace_id or workspace_id is null)
  order by (workspace_id = v_allowance.workspace_id) desc
  limit 1;
  if v_cost_center_id is null then raise exception 'DAILY_ALLOWANCE_COST_CENTER_NOT_FOUND'; end if;

  insert into public.financial_documents (
    tenant_id, workspace_id, direction, document_type, source_type, source_id,
    source_event, description, original_amount, competence_date, issue_date,
    entry_date, currency, status, chart_account_id, notes, posted_at, posted_by
  ) values (
    v_allowance.tenant_id, v_allowance.workspace_id, 'payable', 'driver_daily_allowance',
    'driver_daily_allowance', v_allowance.id, 'approved',
    'Diarias de viagem - ' || (select d.name from public.drivers d where d.id = v_allowance.driver_id),
    v_allowance.total_amount, v_allowance.submitted_at::date, current_date,
    current_date, 'BRL', 'posted', v_account_id,
    'Quantidade: ' || v_allowance.quantity || ' x ' || v_allowance.unit_amount,
    now(), auth.uid()
  )
  on conflict (tenant_id, source_type, source_id, source_event)
    where source_type is not null and source_id is not null and source_event is not null
  do update set updated_at = now()
  returning id into v_document_id;

  if not exists (
    select 1 from public.financial_installments where document_id = v_document_id
  ) then
    insert into public.financial_installments (
      tenant_id, workspace_id, document_id, installment_number, amount, due_date
    ) values (
      v_allowance.tenant_id, v_allowance.workspace_id, v_document_id, 1,
      v_allowance.total_amount,
      current_date + coalesce(v_setting.payment_due_days, 5)
    );
  end if;

  if not exists (
    select 1 from public.financial_allocations where document_id = v_document_id
  ) then
    select count(*), coalesce(sum(greatest(coalesce(f.freight_value, 0), 0)), 0)
      into v_freight_count, v_revenue_total
    from public.freights f
    where f.tenant_id = v_allowance.tenant_id
      and f.trip_cycle_id = v_allowance.trip_cycle_id
      and f.lifecycle_status = 'completed';

    if v_freight_count = 0 then
      insert into public.financial_allocations (
        tenant_id, workspace_id, document_id, vehicle_id, driver_id,
        cost_center_id, chart_account_id, amount, percentage, description
      ) values (
        v_allowance.tenant_id, v_allowance.workspace_id, v_document_id,
        v_allowance.vehicle_id, v_allowance.driver_id, v_cost_center_id,
        v_account_id, v_allowance.total_amount, 100,
        'Diarias do ciclo de tiro longo'
      );
    else
      for v_freight in
        select f.id, greatest(coalesce(f.freight_value, 0), 0) as revenue
        from public.freights f
        where f.tenant_id = v_allowance.tenant_id
          and f.trip_cycle_id = v_allowance.trip_cycle_id
          and f.lifecycle_status = 'completed'
        order by f.trip_sequence nulls last, f.created_at, f.id
      loop
        v_freight_index := v_freight_index + 1;
        if v_freight_index = v_freight_count then
          v_allocation_amount := v_allowance.total_amount - v_allocated;
        elsif v_revenue_total > 0 then
          v_allocation_amount := round(
            v_allowance.total_amount * v_freight.revenue / v_revenue_total, 2
          );
        else
          v_allocation_amount := round(v_allowance.total_amount / v_freight_count, 2);
        end if;

        if v_allocation_amount > 0 then
          insert into public.financial_allocations (
            tenant_id, workspace_id, document_id, freight_id, vehicle_id, driver_id,
            cost_center_id, chart_account_id, amount, percentage, description
          ) values (
            v_allowance.tenant_id, v_allowance.workspace_id, v_document_id,
            v_freight.id, v_allowance.vehicle_id, v_allowance.driver_id,
            v_cost_center_id, v_account_id, v_allocation_amount,
            round(v_allocation_amount * 100 / v_allowance.total_amount, 4),
            'Rateio de diaria do tiro longo por frete'
          );
          v_allocated := v_allocated + v_allocation_amount;
        end if;
      end loop;
    end if;
  end if;

  update public.driver_trip_daily_allowances
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
      review_notes = nullif(btrim(p_review_notes), ''),
      financial_document_id = v_document_id
  where id = v_allowance.id;

  return jsonb_build_object(
    'id', v_allowance.id,
    'status', 'approved',
    'financialDocumentId', v_document_id
  );
end;
$$;

-- Mantem compatibilidade com o app atual: o contexto principal passa a trazer
-- a diaria, enquanto a escrita continua isolada na RPC especifica.
do $$
declare
  v_definition text;
  v_needle text := '''expenses'', coalesce(('; 
begin
  v_definition := pg_get_functiondef('public.get_driver_app_context()'::regprocedure);
  if position('''dailyAllowance''' in v_definition) = 0 then
    if position(v_needle in v_definition) = 0 then
      raise exception 'DRIVER_CONTEXT_EXPENSES_SHAPE_NOT_FOUND';
    end if;
    v_definition := replace(
      v_definition,
      v_needle,
      '''dailyAllowance'', public.get_driver_daily_allowance_context(),' || E'\n    ' || v_needle
    );
    execute v_definition;
  end if;
end;
$$;

-- Ativa a experiencia somente para a JO. O valor fica inicialmente zerado para
-- impedir que uma taxa comercial nao confirmada gere obrigacoes financeiras.
insert into public.driver_daily_allowance_settings (
  workspace_id, tenant_id, enabled, daily_amount, payment_due_days
)
select w.id, w.tenant_id, false, 0, 5
from public.workspaces w
where w.id = '26586d2c-e864-4c2a-9f96-022201bf73d5'::uuid
  and w.tenant_id = 'ebfa57a2-f639-4e53-a006-3b1493c685a7'::uuid
on conflict (workspace_id) do nothing;

revoke all on function private.validate_driver_daily_allowance_setting()
  from public, anon, authenticated;
revoke all on function private.validate_driver_trip_daily_allowance()
  from public, anon, authenticated;
revoke all on function public.get_driver_daily_allowance_context()
  from public, anon, authenticated;
revoke all on function public.driver_app_submit_daily_allowance(integer, text)
  from public, anon, authenticated;
revoke all on function public.get_driver_daily_allowance_settings(uuid)
  from public, anon, authenticated;
revoke all on function public.save_driver_daily_allowance_settings(uuid, boolean, numeric, integer)
  from public, anon, authenticated;
revoke all on function public.list_driver_daily_allowances(uuid, text)
  from public, anon, authenticated;
revoke all on function public.review_driver_daily_allowance(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.get_driver_daily_allowance_context()
  to authenticated;
grant execute on function public.driver_app_submit_daily_allowance(integer, text)
  to authenticated;
grant execute on function public.get_driver_daily_allowance_settings(uuid)
  to authenticated;
grant execute on function public.save_driver_daily_allowance_settings(uuid, boolean, numeric, integer)
  to authenticated;
grant execute on function public.list_driver_daily_allowances(uuid, text)
  to authenticated;
grant execute on function public.review_driver_daily_allowance(uuid, text, text)
  to authenticated;

comment on table public.driver_trip_daily_allowances is
  'Quantidade de diarias declarada pelo motorista por ciclo de tiro longo, sujeita a aprovacao.';
comment on function public.driver_app_submit_daily_allowance(integer, text) is
  'Registra somente a quantidade; o valor unitario e sempre obtido da configuracao server-side.';

notify pgrst, 'reload schema';
