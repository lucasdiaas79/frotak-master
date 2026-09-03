-- FROTAK - Financeiro Fase 5
-- Salarios, despesas recorrentes e custos fixos gerando documentos canonicos.

create table public.financial_recurring_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  kind text not null,
  name text not null,
  partner_id uuid references public.business_partners(id) on delete restrict,
  employee_name text,
  driver_id uuid references public.drivers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  cost_center_id uuid not null references public.cost_centers(id) on delete restrict,
  chart_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  amount numeric(18,2) not null,
  due_day integer not null default 5,
  start_month date not null,
  end_month date,
  auto_post boolean not null default true,
  status text not null default 'active',
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_recurring_rules_kind_chk check (
    kind in ('salary', 'recurring_expense', 'fixed_cost')
  ),
  constraint financial_recurring_rules_name_chk check (btrim(name) <> ''),
  constraint financial_recurring_rules_amount_chk check (amount > 0),
  constraint financial_recurring_rules_due_day_chk check (due_day between 1 and 31),
  constraint financial_recurring_rules_months_chk check (
    start_month = date_trunc('month', start_month)::date
    and (end_month is null or end_month = date_trunc('month', end_month)::date)
    and (end_month is null or end_month >= start_month)
  ),
  constraint financial_recurring_rules_status_chk check (
    status in ('active', 'paused', 'ended')
  ),
  constraint financial_recurring_rules_workspace_fk
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id)
);

create index financial_recurring_rules_workspace_status_idx
  on public.financial_recurring_rules(workspace_id, status, start_month);
create index financial_recurring_rules_partner_idx
  on public.financial_recurring_rules(partner_id);
create index financial_recurring_rules_vehicle_idx
  on public.financial_recurring_rules(vehicle_id);

create trigger financial_recurring_rules_set_updated_at
before update on public.financial_recurring_rules
for each row execute function public.set_updated_at();

create or replace function private.validate_financial_recurring_rule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);

  if not exists (
    select 1 from public.chart_of_accounts coa
    where coa.id = new.chart_account_id
      and coa.tenant_id = new.tenant_id
      and coa.account_type = 'expense'
      and coa.is_postable = true
      and coa.active = true
  ) then
    raise exception 'FINANCIAL_RECURRING_INVALID_CHART_ACCOUNT';
  end if;

  if not exists (
    select 1 from public.cost_centers cc
    where cc.id = new.cost_center_id
      and cc.tenant_id = new.tenant_id
      and (cc.workspace_id = new.workspace_id or cc.workspace_id is null)
      and cc.active = true
  ) then
    raise exception 'FINANCIAL_RECURRING_INVALID_COST_CENTER';
  end if;

  if new.partner_id is not null and not exists (
    select 1 from public.business_partners bp
    where bp.id = new.partner_id and bp.tenant_id = new.tenant_id and bp.active = true
  ) then
    raise exception 'FINANCIAL_RECURRING_PARTNER_OTHER_TENANT';
  end if;

  if new.driver_id is not null and not exists (
    select 1 from public.drivers d
    where d.id = new.driver_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'FINANCIAL_RECURRING_DRIVER_OTHER_TENANT';
  end if;

  if new.vehicle_id is not null and not exists (
    select 1 from public.vehicles v
    where v.id = new.vehicle_id and v.tenant_id = new.tenant_id
  ) then
    raise exception 'FINANCIAL_RECURRING_VEHICLE_OTHER_TENANT';
  end if;

  return new;
end;
$$;

create trigger financial_recurring_rules_validate
before insert or update on public.financial_recurring_rules
for each row execute function private.validate_financial_recurring_rule();

alter table public.financial_recurring_rules enable row level security;

grant select on public.financial_recurring_rules to authenticated;
revoke insert, update, delete on public.financial_recurring_rules from authenticated;

create policy financial_recurring_rules_read
on public.financial_recurring_rules for select to authenticated
using (private.can_read_financial_workspace(workspace_id));

create policy financial_recurring_rules_manage
on public.financial_recurring_rules for all to authenticated
using (
  private.is_workspace_owner(workspace_id)
  or private.has_permission(workspace_id, 'financial.manage_recurring')
)
with check (
  private.is_workspace_owner(workspace_id)
  or private.has_permission(workspace_id, 'financial.manage_recurring')
);

create or replace view public.financial_recurring_rules_overview
with (security_invoker = true)
as
select
  r.*,
  bp.trade_name as partner_name,
  d.name as driver_name,
  v.plate as vehicle_plate,
  cc.name as cost_center_name,
  coa.name as chart_account_name,
  coalesce(count(fd.id), 0)::integer as generated_count,
  max(fd.competence_date) as last_generated_competence
from public.financial_recurring_rules r
left join public.business_partners bp on bp.id = r.partner_id
left join public.drivers d on d.id = r.driver_id
left join public.vehicles v on v.id = r.vehicle_id
left join public.cost_centers cc on cc.id = r.cost_center_id
left join public.chart_of_accounts coa on coa.id = r.chart_account_id
left join public.financial_documents fd
  on fd.tenant_id = r.tenant_id
 and fd.source_type = 'recurring_rule'
 and fd.source_id = r.id
 and fd.source_event like 'recurring:%'
group by r.id, bp.trade_name, d.name, v.plate, cc.name, coa.name;

grant select on public.financial_recurring_rules_overview to authenticated;

with permission_seed (code, name, description, risk_level) as (
  values
    (
      'financial.manage_recurring',
      'Gerenciar recorrencias financeiras',
      'Criar, editar e gerar salarios, despesas recorrentes e custos fixos.',
      'high'
    )
)
insert into public.permissions (module_id, code, name, description, risk_level, active)
select m.id, p.code, p.name, p.description, p.risk_level, true
from permission_seed p
left join public.modules m on m.code = 'financial'
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  risk_level = excluded.risk_level,
  active = true,
  updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select wr.id, p.id
from public.workspace_roles wr
join public.permissions p on p.code = 'financial.manage_recurring' and p.active = true
where wr.code in ('OWNER', 'FINANCIAL') and wr.active = true
on conflict do nothing;

create or replace function public.save_financial_recurring_rule(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_tenant_id uuid;
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'active');
begin
  perform private.require_financial_permission(v_workspace_id, 'financial.manage_recurring');
  select tenant_id into v_tenant_id
  from public.workspaces
  where id = v_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'FINANCIAL_INVALID_WORKSPACE'; end if;
  if v_status not in ('active', 'paused', 'ended') then
    raise exception 'FINANCIAL_RECURRING_INVALID_STATUS';
  end if;

  if v_id is not null and not (p_payload ? 'name') then
    update public.financial_recurring_rules
    set status = v_status
    where id = v_id and workspace_id = v_workspace_id
    returning id into v_id;
    if v_id is null then raise exception 'FINANCIAL_RECURRING_RULE_NOT_FOUND'; end if;
    return v_id;
  end if;

  if coalesce((p_payload->>'amount')::numeric, 0) <= 0 then
    raise exception 'FINANCIAL_INVALID_AMOUNT';
  end if;
  if coalesce((p_payload->>'dueDay')::integer, 0) not between 1 and 31 then
    raise exception 'FINANCIAL_RECURRING_INVALID_DUE_DAY';
  end if;

  if v_id is null then
    insert into public.financial_recurring_rules (
      tenant_id, workspace_id, kind, name, partner_id, employee_name, driver_id,
      vehicle_id, cost_center_id, chart_account_id, amount, due_day,
      start_month, end_month, auto_post, status, notes
    ) values (
      v_tenant_id,
      v_workspace_id,
      p_payload->>'kind',
      p_payload->>'name',
      nullif(p_payload->>'partnerId', '')::uuid,
      nullif(p_payload->>'employeeName', ''),
      nullif(p_payload->>'driverId', '')::uuid,
      nullif(p_payload->>'vehicleId', '')::uuid,
      (p_payload->>'costCenterId')::uuid,
      (p_payload->>'chartAccountId')::uuid,
      (p_payload->>'amount')::numeric,
      (p_payload->>'dueDay')::integer,
      date_trunc('month', (p_payload->>'startMonth')::date)::date,
      case when nullif(p_payload->>'endMonth', '') is null then null
        else date_trunc('month', (p_payload->>'endMonth')::date)::date end,
      coalesce((p_payload->>'autoPost')::boolean, true),
      v_status,
      nullif(p_payload->>'notes', '')
    ) returning id into v_id;
  else
    update public.financial_recurring_rules
    set kind = p_payload->>'kind',
        name = p_payload->>'name',
        partner_id = nullif(p_payload->>'partnerId', '')::uuid,
        employee_name = nullif(p_payload->>'employeeName', ''),
        driver_id = nullif(p_payload->>'driverId', '')::uuid,
        vehicle_id = nullif(p_payload->>'vehicleId', '')::uuid,
        cost_center_id = (p_payload->>'costCenterId')::uuid,
        chart_account_id = (p_payload->>'chartAccountId')::uuid,
        amount = (p_payload->>'amount')::numeric,
        due_day = (p_payload->>'dueDay')::integer,
        start_month = date_trunc('month', (p_payload->>'startMonth')::date)::date,
        end_month = case when nullif(p_payload->>'endMonth', '') is null then null
          else date_trunc('month', (p_payload->>'endMonth')::date)::date end,
        auto_post = coalesce((p_payload->>'autoPost')::boolean, true),
        status = v_status,
        notes = nullif(p_payload->>'notes', '')
    where id = v_id and workspace_id = v_workspace_id
    returning id into v_id;
    if v_id is null then raise exception 'FINANCIAL_RECURRING_RULE_NOT_FOUND'; end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.generate_financial_recurring_documents(
  p_workspace_id uuid,
  p_competence_month date,
  p_rule_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tenant_id uuid;
  v_month date := date_trunc('month', p_competence_month)::date;
  v_rule public.financial_recurring_rules;
  v_document_id uuid;
  v_due_date date;
  v_generated integer := 0;
  v_skipped integer := 0;
  v_document_ids uuid[] := '{}'::uuid[];
  v_source_event text;
begin
  perform private.require_financial_permission(p_workspace_id, 'financial.manage_recurring');
  select tenant_id into v_tenant_id
  from public.workspaces
  where id = p_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'FINANCIAL_INVALID_WORKSPACE'; end if;

  for v_rule in
    select *
    from public.financial_recurring_rules
    where tenant_id = v_tenant_id
      and workspace_id = p_workspace_id
      and status = 'active'
      and start_month <= v_month
      and (end_month is null or end_month >= v_month)
      and (p_rule_id is null or id = p_rule_id)
    order by name
  loop
    v_source_event := 'recurring:' || to_char(v_month, 'YYYY-MM');
    select id into v_document_id
    from public.financial_documents
    where tenant_id = v_tenant_id
      and source_type = 'recurring_rule'
      and source_id = v_rule.id
      and source_event = v_source_event;

    if v_document_id is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_due_date := make_date(
      extract(year from v_month)::integer,
      extract(month from v_month)::integer,
      least(
        v_rule.due_day,
        extract(day from (v_month + interval '1 month' - interval '1 day'))::integer
      )
    );

    insert into public.financial_documents (
      tenant_id, workspace_id, direction, partner_id, document_type,
      source_type, source_id, source_event, description, original_amount,
      competence_date, issue_date, currency, status, chart_account_id, notes
    ) values (
      v_tenant_id,
      p_workspace_id,
      'payable',
      v_rule.partner_id,
      case v_rule.kind
        when 'salary' then 'salary_expense'
        when 'fixed_cost' then 'fixed_cost'
        else 'recurring_expense'
      end,
      'recurring_rule',
      v_rule.id,
      v_source_event,
      v_rule.name || ' - ' || to_char(v_month, 'MM/YYYY'),
      v_rule.amount,
      v_month,
      v_month,
      'BRL',
      'draft',
      v_rule.chart_account_id,
      concat_ws(E'\n', 'Gerado automaticamente por recorrencia financeira.', v_rule.notes)
    ) returning id into v_document_id;

    insert into public.financial_installments (
      tenant_id, workspace_id, document_id, installment_number, amount, due_date
    ) values (
      v_tenant_id, p_workspace_id, v_document_id, 1, v_rule.amount, v_due_date
    );

    insert into public.financial_allocations (
      tenant_id, workspace_id, document_id, vehicle_id, business_partner_id,
      cost_center_id, chart_account_id, amount, percentage, description
    ) values (
      v_tenant_id,
      p_workspace_id,
      v_document_id,
      v_rule.vehicle_id,
      v_rule.partner_id,
      v_rule.cost_center_id,
      v_rule.chart_account_id,
      v_rule.amount,
      100,
      'Alocacao automatica de custo recorrente'
    );

    if v_rule.auto_post then
      update public.financial_documents
      set status = 'posted'
      where id = v_document_id;
    end if;

    v_generated := v_generated + 1;
    v_document_ids := array_append(v_document_ids, v_document_id);
  end loop;

  return jsonb_build_object(
    'generated', v_generated,
    'skipped', v_skipped,
    'documentIds', coalesce(to_jsonb(v_document_ids), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.validate_financial_recurring_rule() from public, anon, authenticated;
revoke all on function public.save_financial_recurring_rule(jsonb) from public, anon;
revoke all on function public.generate_financial_recurring_documents(uuid, date, uuid)
  from public, anon;

grant execute on function public.save_financial_recurring_rule(jsonb) to authenticated;
grant execute on function public.generate_financial_recurring_documents(uuid, date, uuid)
  to authenticated;

comment on table public.financial_recurring_rules is
  'Regras de salarios, despesas recorrentes e custos fixos. A geracao escreve somente em financial_documents e financial_allocations.';
