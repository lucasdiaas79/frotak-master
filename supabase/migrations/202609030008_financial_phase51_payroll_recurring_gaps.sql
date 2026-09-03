-- FROTAK - Financeiro Fase 5.1
-- Folha gerencial, recorrencias com frequencia e rastreabilidade historica.

alter table public.financial_recurring_rules
  add column if not exists frequency text not null default 'MONTHLY',
  add column if not exists interval_count integer not null default 1;

alter table public.financial_recurring_rules
  drop constraint if exists financial_recurring_rules_frequency_chk;
alter table public.financial_recurring_rules
  add constraint financial_recurring_rules_frequency_chk check (
    frequency in ('MONTHLY', 'WEEKLY', 'YEARLY') and interval_count = 1
  );

create table public.employee_financial_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  display_name text not null,
  driver_id uuid references public.drivers(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete restrict,
  business_partner_id uuid references public.business_partners(id) on delete restrict,
  job_title text,
  base_salary numeric(18,2) not null default 0,
  default_cost_center_id uuid not null references public.cost_centers(id) on delete restrict,
  default_chart_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  default_pay_day integer not null default 5,
  admission_date date,
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_financial_profiles_name_chk check (btrim(display_name) <> ''),
  constraint employee_financial_profiles_salary_chk check (base_salary >= 0),
  constraint employee_financial_profiles_pay_day_chk check (default_pay_day between 1 and 31),
  constraint employee_financial_profiles_workspace_fk
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id),
  constraint employee_financial_profiles_identity_chk check (
    driver_id is not null or profile_id is not null or business_partner_id is not null
    or btrim(display_name) <> ''
  )
);

create unique index employee_financial_profiles_driver_uidx
  on public.employee_financial_profiles(workspace_id, driver_id)
  where driver_id is not null;
create unique index employee_financial_profiles_profile_uidx
  on public.employee_financial_profiles(workspace_id, profile_id)
  where profile_id is not null;
create unique index employee_financial_profiles_partner_uidx
  on public.employee_financial_profiles(workspace_id, business_partner_id)
  where business_partner_id is not null;
create index employee_financial_profiles_workspace_active_idx
  on public.employee_financial_profiles(workspace_id, active, display_name);
create unique index employee_financial_profiles_tenant_workspace_id_uidx
  on public.employee_financial_profiles(tenant_id, workspace_id, id);

create trigger employee_financial_profiles_set_updated_at
before update on public.employee_financial_profiles
for each row execute function public.set_updated_at();

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  competence_month date not null,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_periods_month_chk check (competence_month = date_trunc('month', competence_month)::date),
  constraint payroll_periods_status_chk check (status in ('draft', 'closed', 'voided')),
  constraint payroll_periods_workspace_fk
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id),
  constraint payroll_periods_workspace_month_uidx unique(workspace_id, competence_month)
);

create trigger payroll_periods_set_updated_at
before update on public.payroll_periods
for each row execute function public.set_updated_at();

create unique index payroll_periods_tenant_workspace_id_uidx
  on public.payroll_periods(tenant_id, workspace_id, id);

create table public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  period_id uuid not null references public.payroll_periods(id) on delete restrict,
  employee_profile_id uuid not null references public.employee_financial_profiles(id) on delete restrict,
  employee_name_snapshot text not null,
  job_title_snapshot text,
  base_salary_snapshot numeric(18,2) not null default 0,
  cost_center_id uuid not null references public.cost_centers(id) on delete restrict,
  chart_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  due_date date not null,
  status text not null default 'draft',
  gross_amount numeric(18,2) not null default 0,
  deduction_amount numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  financial_document_id uuid references public.financial_documents(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_entries_status_chk check (
    status in ('draft', 'calculated', 'approved', 'posted', 'paid', 'voided')
  ),
  constraint payroll_entries_amounts_chk check (
    base_salary_snapshot >= 0 and gross_amount >= 0 and deduction_amount >= 0
    and net_amount = gross_amount - deduction_amount
  ),
  constraint payroll_entries_workspace_fk
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id),
  constraint payroll_entries_period_fk
    foreign key (tenant_id, workspace_id, period_id)
    references public.payroll_periods(tenant_id, workspace_id, id),
  constraint payroll_entries_employee_fk
    foreign key (tenant_id, workspace_id, employee_profile_id)
    references public.employee_financial_profiles(tenant_id, workspace_id, id),
  constraint payroll_entries_document_fk
    foreign key (tenant_id, workspace_id, financial_document_id)
    references public.financial_documents(tenant_id, workspace_id, id),
  constraint payroll_entries_period_employee_uidx unique(period_id, employee_profile_id)
);

create unique index payroll_entries_tenant_workspace_id_uidx
  on public.payroll_entries(tenant_id, workspace_id, id);
create index payroll_entries_workspace_status_idx
  on public.payroll_entries(workspace_id, status, due_date);
create unique index payroll_entries_financial_document_uidx
  on public.payroll_entries(financial_document_id)
  where financial_document_id is not null;

create trigger payroll_entries_set_updated_at
before update on public.payroll_entries
for each row execute function public.set_updated_at();

create table public.employee_advances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  employee_profile_id uuid not null references public.employee_financial_profiles(id) on delete restrict,
  financial_document_id uuid references public.financial_documents(id) on delete restrict,
  amount numeric(18,2) not null,
  paid_on date not null,
  description text not null,
  status text not null default 'available',
  applied_payroll_item_id uuid,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_advances_amount_chk check (amount > 0),
  constraint employee_advances_description_chk check (btrim(description) <> ''),
  constraint employee_advances_status_chk check (status in ('available', 'applied', 'voided')),
  constraint employee_advances_workspace_fk
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id),
  constraint employee_advances_employee_fk
    foreign key (tenant_id, workspace_id, employee_profile_id)
    references public.employee_financial_profiles(tenant_id, workspace_id, id),
  constraint employee_advances_document_fk
    foreign key (tenant_id, workspace_id, financial_document_id)
    references public.financial_documents(tenant_id, workspace_id, id)
);

create unique index employee_advances_tenant_workspace_id_uidx
  on public.employee_advances(tenant_id, workspace_id, id);
create unique index employee_advances_applied_item_uidx
  on public.employee_advances(applied_payroll_item_id)
  where applied_payroll_item_id is not null;
create index employee_advances_employee_status_idx
  on public.employee_advances(employee_profile_id, status, paid_on);

create trigger employee_advances_set_updated_at
before update on public.employee_advances
for each row execute function public.set_updated_at();

create table public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  payroll_entry_id uuid not null references public.payroll_entries(id) on delete cascade,
  item_type text not null,
  direction text not null,
  description text not null,
  amount numeric(18,2) not null,
  source_type text,
  source_id uuid,
  source_event text,
  employee_advance_id uuid references public.employee_advances(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_items_type_chk check (
    item_type in (
      'SALARY_BASE', 'COMMISSION', 'OVERTIME', 'DAILY_ALLOWANCE', 'BONUS',
      'ADDITIONAL', 'BENEFIT', 'OTHER_EARNING', 'ADVANCE', 'DISCOUNT', 'OTHER_DEDUCTION'
    )
  ),
  constraint payroll_items_direction_chk check (direction in ('earning', 'deduction')),
  constraint payroll_items_direction_type_chk check (
    (direction = 'earning' and item_type in (
      'SALARY_BASE', 'COMMISSION', 'OVERTIME', 'DAILY_ALLOWANCE', 'BONUS',
      'ADDITIONAL', 'BENEFIT', 'OTHER_EARNING'
    ))
    or
    (direction = 'deduction' and item_type in ('ADVANCE', 'DISCOUNT', 'OTHER_DEDUCTION'))
  ),
  constraint payroll_items_description_chk check (btrim(description) <> ''),
  constraint payroll_items_amount_chk check (amount > 0),
  constraint payroll_items_source_chk check (
    (source_type is null and source_id is null and source_event is null)
    or (source_type is not null and source_id is not null and source_event is not null)
  ),
  constraint payroll_items_workspace_fk
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id),
  constraint payroll_items_entry_fk
    foreign key (tenant_id, workspace_id, payroll_entry_id)
    references public.payroll_entries(tenant_id, workspace_id, id)
);

create unique index payroll_items_tenant_workspace_id_uidx
  on public.payroll_items(tenant_id, workspace_id, id);

alter table public.employee_advances
  add constraint employee_advances_applied_item_fk
  foreign key (tenant_id, workspace_id, applied_payroll_item_id)
  references public.payroll_items(tenant_id, workspace_id, id);

create unique index payroll_items_entry_salary_base_uidx
  on public.payroll_items(payroll_entry_id)
  where item_type = 'SALARY_BASE';
create unique index payroll_items_advance_uidx
  on public.payroll_items(employee_advance_id)
  where employee_advance_id is not null;
create index payroll_items_entry_idx on public.payroll_items(payroll_entry_id, direction);

create trigger payroll_items_set_updated_at
before update on public.payroll_items
for each row execute function public.set_updated_at();

create table public.payroll_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  employee_profile_id uuid references public.employee_financial_profiles(id) on delete set null,
  payroll_period_id uuid references public.payroll_periods(id) on delete set null,
  payroll_entry_id uuid references public.payroll_entries(id) on delete set null,
  payroll_item_id uuid references public.payroll_items(id) on delete set null,
  recurring_rule_id uuid references public.financial_recurring_rules(id) on delete set null,
  financial_document_id uuid references public.financial_documents(id) on delete set null,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint payroll_audit_events_workspace_fk
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id)
);

create index payroll_audit_events_workspace_created_idx
  on public.payroll_audit_events(workspace_id, created_at desc);
create index payroll_audit_events_entry_idx
  on public.payroll_audit_events(payroll_entry_id, created_at desc);
create index payroll_audit_events_recurring_idx
  on public.payroll_audit_events(recurring_rule_id, created_at desc);

alter table public.employee_financial_profiles enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_entries enable row level security;
alter table public.payroll_items enable row level security;
alter table public.employee_advances enable row level security;
alter table public.payroll_audit_events enable row level security;

grant select on public.employee_financial_profiles, public.payroll_periods,
  public.payroll_entries, public.payroll_items, public.employee_advances,
  public.payroll_audit_events to authenticated;
revoke insert, update, delete on public.employee_financial_profiles, public.payroll_periods,
  public.payroll_entries, public.payroll_items, public.employee_advances,
  public.payroll_audit_events from authenticated;

create policy employee_financial_profiles_read
on public.employee_financial_profiles for select to authenticated
using (private.is_workspace_owner(workspace_id) or private.has_permission(workspace_id, 'financial.payroll.view'));
create policy payroll_periods_read
on public.payroll_periods for select to authenticated
using (private.is_workspace_owner(workspace_id) or private.has_permission(workspace_id, 'financial.payroll.view'));
create policy payroll_entries_read
on public.payroll_entries for select to authenticated
using (private.is_workspace_owner(workspace_id) or private.has_permission(workspace_id, 'financial.payroll.view'));
create policy payroll_items_read
on public.payroll_items for select to authenticated
using (private.is_workspace_owner(workspace_id) or private.has_permission(workspace_id, 'financial.payroll.view'));
create policy employee_advances_read
on public.employee_advances for select to authenticated
using (private.is_workspace_owner(workspace_id) or private.has_permission(workspace_id, 'financial.payroll.view'));
create policy payroll_audit_events_read
on public.payroll_audit_events for select to authenticated
using (private.is_workspace_owner(workspace_id) or private.has_permission(workspace_id, 'financial.payroll.view'));

create or replace view public.payroll_entries_overview
with (security_invoker = true)
as
select
  e.*,
  p.competence_month,
  ep.display_name as employee_display_name,
  ep.driver_id,
  ep.profile_id,
  ep.business_partner_id,
  ep.active as employee_active,
  cc.name as cost_center_name,
  coa.name as chart_account_name,
  fd.status as financial_document_status,
  coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'itemType', i.item_type,
      'direction', i.direction,
      'description', i.description,
      'amount', i.amount,
      'employeeAdvanceId', i.employee_advance_id,
      'sourceType', i.source_type,
      'sourceId', i.source_id,
      'sourceEvent', i.source_event,
      'createdAt', i.created_at
    )
    order by i.created_at, i.id
  ) filter (where i.id is not null), '[]'::jsonb) as items
from public.payroll_entries e
join public.payroll_periods p on p.id = e.period_id
join public.employee_financial_profiles ep on ep.id = e.employee_profile_id
left join public.cost_centers cc on cc.id = e.cost_center_id
left join public.chart_of_accounts coa on coa.id = e.chart_account_id
left join public.financial_documents fd on fd.id = e.financial_document_id
left join public.payroll_items i on i.payroll_entry_id = e.id
group by e.id, p.competence_month, ep.id, cc.name, coa.name, fd.status;

grant select on public.payroll_entries_overview to authenticated;

create or replace view public.employee_advances_overview
with (security_invoker = true)
as
select
  a.*,
  ep.display_name as employee_display_name,
  fd.status as financial_document_status
from public.employee_advances a
join public.employee_financial_profiles ep on ep.id = a.employee_profile_id
left join public.financial_documents fd on fd.id = a.financial_document_id;

grant select on public.employee_advances_overview to authenticated;

with permission_seed (code, name, description, risk_level) as (
  values
    ('financial.payroll.view', 'Visualizar folha gerencial', 'Visualizar salarios e fechamentos da folha gerencial.', 'high'),
    ('financial.payroll.manage', 'Gerenciar folha gerencial', 'Criar funcionarios financeiros, periodos e itens de folha.', 'high'),
    ('financial.payroll.approve', 'Aprovar folha gerencial', 'Aprovar valores da folha antes do lancamento financeiro.', 'critical'),
    ('financial.payroll.post', 'Postar folha gerencial', 'Gerar contas a pagar a partir de folha aprovada.', 'critical'),
    ('financial.payroll.void', 'Cancelar folha gerencial', 'Cancelar folha e estornar titulo financeiro quando permitido.', 'critical')
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
join public.permissions p on p.code like 'financial.payroll.%' and p.active = true
where wr.code = 'OWNER' and wr.active = true
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select wr.id, p.id
from public.workspace_roles wr
join public.permissions p on p.code in (
  'financial.payroll.view', 'financial.payroll.manage',
  'financial.payroll.approve', 'financial.payroll.post', 'financial.payroll.void'
) and p.active = true
where wr.code = 'FINANCIAL' and wr.active = true
on conflict do nothing;

create or replace function private.require_payroll_permission(
  p_workspace_id uuid,
  p_permission text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.is_workspace_owner(p_workspace_id)
    and not private.has_permission(p_workspace_id, p_permission) then
    raise exception 'PAYROLL_FORBIDDEN:%', p_permission using errcode = '42501';
  end if;
end;
$$;

create or replace function private.validate_employee_financial_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.driver_id is not null and not exists (
    select 1 from public.drivers d where d.id = new.driver_id and d.tenant_id = new.tenant_id
  ) then raise exception 'PAYROLL_DRIVER_OTHER_TENANT'; end if;
  if new.profile_id is not null and not exists (
    select 1 from public.workspace_memberships wm
    where wm.workspace_id = new.workspace_id and wm.user_id = new.profile_id
      and wm.status = 'active'
  ) then raise exception 'PAYROLL_PROFILE_NOT_IN_WORKSPACE'; end if;
  if new.business_partner_id is not null and not exists (
    select 1 from public.business_partners bp
    where bp.id = new.business_partner_id and bp.tenant_id = new.tenant_id and bp.active = true
  ) then raise exception 'PAYROLL_PARTNER_OTHER_TENANT'; end if;
  if not exists (
    select 1 from public.cost_centers cc
    where cc.id = new.default_cost_center_id and cc.tenant_id = new.tenant_id
      and (cc.workspace_id = new.workspace_id or cc.workspace_id is null) and cc.active = true
  ) then raise exception 'PAYROLL_INVALID_COST_CENTER'; end if;
  if not exists (
    select 1 from public.chart_of_accounts coa
    where coa.id = new.default_chart_account_id and coa.tenant_id = new.tenant_id
      and coa.account_type = 'expense' and coa.is_postable = true and coa.active = true
  ) then raise exception 'PAYROLL_INVALID_CHART_ACCOUNT'; end if;
  return new;
end;
$$;

create trigger employee_financial_profiles_validate
before insert or update on public.employee_financial_profiles
for each row execute function private.validate_employee_financial_profile();

create or replace function private.audit_payroll_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_action text;
  v_tenant_id uuid;
  v_workspace_id uuid;
  v_row_id uuid;
  v_employee_profile_id uuid;
  v_payroll_period_id uuid;
  v_payroll_entry_id uuid;
  v_payroll_item_id uuid;
  v_recurring_rule_id uuid;
  v_financial_document_id uuid;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_tenant_id := old.tenant_id;
    v_workspace_id := old.workspace_id;
    v_row_id := old.id;
  else
    v_new := to_jsonb(new);
    v_tenant_id := new.tenant_id;
    v_workspace_id := new.workspace_id;
    v_row_id := new.id;
  end if;

  v_action := lower(tg_table_name) || '_' || lower(tg_op);
  if tg_table_name = 'employee_financial_profiles' and tg_op = 'UPDATE'
     and old.base_salary is distinct from new.base_salary then
    v_action := 'employee_base_salary_changed';
  elsif tg_table_name = 'payroll_entries' and tg_op = 'UPDATE'
     and old.status is distinct from new.status then
    v_action := 'payroll_entry_' || new.status;
  elsif tg_table_name = 'payroll_entries' and tg_op = 'UPDATE'
     and old.due_date is distinct from new.due_date then
    v_action := 'payroll_due_date_changed';
  elsif tg_table_name = 'financial_recurring_rules' and tg_op = 'UPDATE'
     and old.status is distinct from new.status then
    v_action := 'recurring_rule_' || new.status;
  elsif tg_table_name = 'financial_recurring_rules' and tg_op = 'UPDATE'
     and old.amount is distinct from new.amount then
    v_action := 'recurring_rule_amount_changed';
  end if;

  if tg_table_name = 'employee_financial_profiles' then
    v_employee_profile_id := v_row_id;
  elsif tg_table_name = 'payroll_periods' then
    v_payroll_period_id := v_row_id;
  elsif tg_table_name = 'payroll_entries' then
    v_payroll_entry_id := v_row_id;
    if tg_op = 'DELETE' then
      v_employee_profile_id := old.employee_profile_id;
      v_payroll_period_id := old.period_id;
      v_financial_document_id := old.financial_document_id;
    else
      v_employee_profile_id := new.employee_profile_id;
      v_payroll_period_id := new.period_id;
      v_financial_document_id := new.financial_document_id;
    end if;
  elsif tg_table_name = 'payroll_items' then
    v_payroll_item_id := v_row_id;
    if tg_op = 'DELETE' then
      v_payroll_entry_id := old.payroll_entry_id;
    else
      v_payroll_entry_id := new.payroll_entry_id;
    end if;
  elsif tg_table_name = 'financial_recurring_rules' then
    v_recurring_rule_id := v_row_id;
  end if;

  insert into public.payroll_audit_events (
    tenant_id, workspace_id, employee_profile_id, payroll_period_id,
    payroll_entry_id, payroll_item_id, recurring_rule_id, financial_document_id,
    action, actor_id, metadata
  ) values (
    v_tenant_id,
    v_workspace_id,
    v_employee_profile_id,
    v_payroll_period_id,
    v_payroll_entry_id,
    v_payroll_item_id,
    v_recurring_rule_id,
    v_financial_document_id,
    v_action,
    auth.uid(),
    jsonb_build_object('before', v_old, 'after', v_new)
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger employee_financial_profiles_audit
after insert or update on public.employee_financial_profiles
for each row execute function private.audit_payroll_row();
create trigger payroll_periods_audit
after insert or update on public.payroll_periods
for each row execute function private.audit_payroll_row();
create trigger payroll_entries_audit
after insert or update on public.payroll_entries
for each row execute function private.audit_payroll_row();
create trigger payroll_items_audit
after insert or update or delete on public.payroll_items
for each row execute function private.audit_payroll_row();
create trigger financial_recurring_rules_audit
after insert or update on public.financial_recurring_rules
for each row execute function private.audit_payroll_row();

create or replace function private.refresh_payroll_entry_totals(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_gross numeric(18,2);
  v_deduction numeric(18,2);
begin
  select
    coalesce(sum(amount) filter (where direction = 'earning'), 0),
    coalesce(sum(amount) filter (where direction = 'deduction'), 0)
  into v_gross, v_deduction
  from public.payroll_items
  where payroll_entry_id = p_entry_id;

  update public.payroll_entries
  set gross_amount = v_gross,
      deduction_amount = v_deduction,
      net_amount = v_gross - v_deduction,
      status = case when status = 'draft' then 'calculated' else status end
  where id = p_entry_id
    and status in ('draft', 'calculated', 'approved');
end;
$$;

create or replace function private.sync_payroll_paid_status(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update public.payroll_entries pe
  set status = 'paid'
  from public.financial_documents fd
  where pe.financial_document_id = fd.id
    and fd.id = p_document_id
    and fd.status = 'settled'
    and pe.status = 'posted';
end;
$$;

create or replace function private.payroll_document_status_bridge()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.sync_payroll_paid_status(new.id);
  return new;
end;
$$;

create trigger payroll_document_status_bridge
after update of status on public.financial_documents
for each row
when (new.source_type = 'payroll' and new.status = 'settled')
execute function private.payroll_document_status_bridge();

create or replace function public.save_employee_financial_profile(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_tenant_id uuid;
begin
  perform private.require_payroll_permission(v_workspace_id, 'financial.payroll.manage');
  select tenant_id into v_tenant_id from public.workspaces
  where id = v_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'PAYROLL_INVALID_WORKSPACE'; end if;

  if v_id is null then
    insert into public.employee_financial_profiles (
      tenant_id, workspace_id, display_name, driver_id, profile_id, business_partner_id,
      job_title, base_salary, default_cost_center_id, default_chart_account_id,
      default_pay_day, admission_date, active, notes
    ) values (
      v_tenant_id, v_workspace_id, p_payload->>'displayName',
      nullif(p_payload->>'driverId', '')::uuid,
      nullif(p_payload->>'profileId', '')::uuid,
      nullif(p_payload->>'businessPartnerId', '')::uuid,
      nullif(p_payload->>'jobTitle', ''),
      coalesce((p_payload->>'baseSalary')::numeric, 0),
      (p_payload->>'defaultCostCenterId')::uuid,
      (p_payload->>'defaultChartAccountId')::uuid,
      coalesce((p_payload->>'defaultPayDay')::integer, 5),
      nullif(p_payload->>'admissionDate', '')::date,
      coalesce((p_payload->>'active')::boolean, true),
      nullif(p_payload->>'notes', '')
    ) returning id into v_id;
  else
    update public.employee_financial_profiles
    set display_name = p_payload->>'displayName',
        driver_id = nullif(p_payload->>'driverId', '')::uuid,
        profile_id = nullif(p_payload->>'profileId', '')::uuid,
        business_partner_id = nullif(p_payload->>'businessPartnerId', '')::uuid,
        job_title = nullif(p_payload->>'jobTitle', ''),
        base_salary = coalesce((p_payload->>'baseSalary')::numeric, 0),
        default_cost_center_id = (p_payload->>'defaultCostCenterId')::uuid,
        default_chart_account_id = (p_payload->>'defaultChartAccountId')::uuid,
        default_pay_day = coalesce((p_payload->>'defaultPayDay')::integer, 5),
        admission_date = nullif(p_payload->>'admissionDate', '')::date,
        active = coalesce((p_payload->>'active')::boolean, true),
        notes = nullif(p_payload->>'notes', '')
    where id = v_id and workspace_id = v_workspace_id
    returning id into v_id;
    if v_id is null then raise exception 'PAYROLL_EMPLOYEE_NOT_FOUND'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.create_payroll_entry(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_tenant_id uuid;
  v_month date := date_trunc('month', (p_payload->>'competenceMonth')::date)::date;
  v_period_id uuid;
  v_employee public.employee_financial_profiles;
  v_entry_id uuid;
  v_due_day integer;
  v_due_date date;
begin
  perform private.require_payroll_permission(v_workspace_id, 'financial.payroll.manage');
  select tenant_id into v_tenant_id from public.workspaces
  where id = v_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'PAYROLL_INVALID_WORKSPACE'; end if;

  select * into v_employee
  from public.employee_financial_profiles
  where id = (p_payload->>'employeeProfileId')::uuid
    and workspace_id = v_workspace_id
    and active = true;
  if not found then raise exception 'PAYROLL_EMPLOYEE_NOT_FOUND'; end if;

  insert into public.payroll_periods (tenant_id, workspace_id, competence_month)
  values (v_tenant_id, v_workspace_id, v_month)
  on conflict (workspace_id, competence_month) do update set updated_at = now()
  returning id into v_period_id;

  v_due_day := coalesce((p_payload->>'dueDay')::integer, v_employee.default_pay_day);
  v_due_date := make_date(
    extract(year from (v_month + interval '1 month'))::integer,
    extract(month from (v_month + interval '1 month'))::integer,
    least(v_due_day, extract(day from (date_trunc('month', v_month + interval '2 months') - interval '1 day'))::integer)
  );

  insert into public.payroll_entries (
    tenant_id, workspace_id, period_id, employee_profile_id, employee_name_snapshot,
    job_title_snapshot, base_salary_snapshot, cost_center_id, chart_account_id, due_date
  ) values (
    v_tenant_id, v_workspace_id, v_period_id, v_employee.id, v_employee.display_name,
    v_employee.job_title, v_employee.base_salary,
    coalesce(nullif(p_payload->>'costCenterId', '')::uuid, v_employee.default_cost_center_id),
    coalesce(nullif(p_payload->>'chartAccountId', '')::uuid, v_employee.default_chart_account_id),
    coalesce(nullif(p_payload->>'dueDate', '')::date, v_due_date)
  )
  on conflict (period_id, employee_profile_id) do update
    set updated_at = now()
  returning id into v_entry_id;

  insert into public.payroll_items (
    tenant_id, workspace_id, payroll_entry_id, item_type, direction, description, amount
  )
  select v_tenant_id, v_workspace_id, v_entry_id, 'SALARY_BASE', 'earning',
    'Salario base historico', v_employee.base_salary
  where v_employee.base_salary > 0
  on conflict do nothing;

  perform private.refresh_payroll_entry_totals(v_entry_id);
  return v_entry_id;
end;
$$;

create or replace function public.save_payroll_item(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_entry public.payroll_entries;
  v_item_type text := p_payload->>'itemType';
  v_direction text;
  v_amount numeric(18,2) := (p_payload->>'amount')::numeric;
  v_advance public.employee_advances;
begin
  select * into v_entry
  from public.payroll_entries
  where id = (p_payload->>'payrollEntryId')::uuid for update;
  if not found then raise exception 'PAYROLL_ENTRY_NOT_FOUND'; end if;
  perform private.require_payroll_permission(v_entry.workspace_id, 'financial.payroll.manage');
  if v_entry.status not in ('draft', 'calculated') then raise exception 'PAYROLL_ENTRY_LOCKED'; end if;
  if v_amount <= 0 then raise exception 'PAYROLL_INVALID_AMOUNT'; end if;

  v_direction := case
    when v_item_type in ('ADVANCE', 'DISCOUNT', 'OTHER_DEDUCTION') then 'deduction'
    else 'earning'
  end;

  if nullif(p_payload->>'employeeAdvanceId', '') is not null then
    select * into v_advance
    from public.employee_advances
    where id = (p_payload->>'employeeAdvanceId')::uuid
      and employee_profile_id = v_entry.employee_profile_id
    for update;
    if not found then raise exception 'PAYROLL_ADVANCE_NOT_FOUND'; end if;
    if v_advance.status <> 'available' and v_advance.applied_payroll_item_id is distinct from v_id then
      raise exception 'PAYROLL_ADVANCE_ALREADY_APPLIED';
    end if;
    if v_advance.amount <> v_amount then raise exception 'PAYROLL_ADVANCE_AMOUNT_MISMATCH'; end if;
    v_item_type := 'ADVANCE';
    v_direction := 'deduction';
  end if;

  if v_id is null then
    insert into public.payroll_items (
      tenant_id, workspace_id, payroll_entry_id, item_type, direction, description, amount,
      source_type, source_id, source_event, employee_advance_id
    ) values (
      v_entry.tenant_id, v_entry.workspace_id, v_entry.id, v_item_type, v_direction,
      p_payload->>'description', v_amount,
      nullif(p_payload->>'sourceType', ''),
      nullif(p_payload->>'sourceId', '')::uuid,
      nullif(p_payload->>'sourceEvent', ''),
      nullif(p_payload->>'employeeAdvanceId', '')::uuid
    ) returning id into v_id;
  else
    update public.payroll_items
    set item_type = v_item_type,
        direction = v_direction,
        description = p_payload->>'description',
        amount = v_amount,
        source_type = nullif(p_payload->>'sourceType', ''),
        source_id = nullif(p_payload->>'sourceId', '')::uuid,
        source_event = nullif(p_payload->>'sourceEvent', ''),
        employee_advance_id = nullif(p_payload->>'employeeAdvanceId', '')::uuid
    where id = v_id and payroll_entry_id = v_entry.id
    returning id into v_id;
    if v_id is null then raise exception 'PAYROLL_ITEM_NOT_FOUND'; end if;
  end if;

  if nullif(p_payload->>'employeeAdvanceId', '') is not null then
    update public.employee_advances
    set status = 'applied', applied_payroll_item_id = v_id
    where id = (p_payload->>'employeeAdvanceId')::uuid;
  end if;

  perform private.refresh_payroll_entry_totals(v_entry.id);
  return v_id;
end;
$$;

create or replace function public.delete_payroll_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_item public.payroll_items;
  v_status text;
begin
  select * into v_item from public.payroll_items where id = p_item_id for update;
  if not found then return; end if;
  select status into v_status from public.payroll_entries where id = v_item.payroll_entry_id for update;
  perform private.require_payroll_permission(v_item.workspace_id, 'financial.payroll.manage');
  if v_status not in ('draft', 'calculated') then raise exception 'PAYROLL_ENTRY_LOCKED'; end if;
  if v_item.employee_advance_id is not null then
    update public.employee_advances
    set status = 'available', applied_payroll_item_id = null
    where id = v_item.employee_advance_id;
  end if;
  delete from public.payroll_items where id = p_item_id;
  perform private.refresh_payroll_entry_totals(v_item.payroll_entry_id);
end;
$$;

create or replace function public.calculate_payroll_entry(p_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_entry public.payroll_entries;
begin
  select * into v_entry from public.payroll_entries where id = p_entry_id for update;
  if not found then raise exception 'PAYROLL_ENTRY_NOT_FOUND'; end if;
  perform private.require_payroll_permission(v_entry.workspace_id, 'financial.payroll.manage');
  if v_entry.status not in ('draft', 'calculated') then raise exception 'PAYROLL_ENTRY_LOCKED'; end if;
  perform private.refresh_payroll_entry_totals(p_entry_id);
  update public.payroll_entries
  set status = 'calculated'
  where id = p_entry_id and status in ('draft', 'calculated');
  return p_entry_id;
end;
$$;

create or replace function public.approve_payroll_entry(p_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_entry public.payroll_entries;
begin
  select * into v_entry from public.payroll_entries where id = p_entry_id for update;
  if not found then raise exception 'PAYROLL_ENTRY_NOT_FOUND'; end if;
  perform private.require_payroll_permission(v_entry.workspace_id, 'financial.payroll.approve');
  if v_entry.status not in ('calculated', 'approved') then raise exception 'PAYROLL_ENTRY_NOT_CALCULATED'; end if;
  if v_entry.net_amount <= 0 then raise exception 'PAYROLL_NET_AMOUNT_REQUIRED'; end if;
  update public.payroll_entries
  set status = 'approved', approved_by = auth.uid(), approved_at = coalesce(approved_at, now())
  where id = p_entry_id;
  return p_entry_id;
end;
$$;

create or replace function public.post_payroll_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_entry public.payroll_entries;
  v_period public.payroll_periods;
  v_document_id uuid;
  v_existing_status text;
  v_snapshot jsonb;
begin
  select * into v_entry from public.payroll_entries where id = p_entry_id for update;
  if not found then raise exception 'PAYROLL_ENTRY_NOT_FOUND'; end if;
  perform private.require_payroll_permission(v_entry.workspace_id, 'financial.payroll.post');
  if v_entry.status not in ('approved', 'posted', 'paid') then raise exception 'PAYROLL_ENTRY_NOT_APPROVED'; end if;
  if v_entry.net_amount <= 0 then raise exception 'PAYROLL_NET_AMOUNT_REQUIRED'; end if;

  select * into v_period from public.payroll_periods where id = v_entry.period_id;
  v_snapshot := jsonb_build_object(
    'employeeName', v_entry.employee_name_snapshot,
    'jobTitle', v_entry.job_title_snapshot,
    'baseSalary', v_entry.base_salary_snapshot,
    'grossAmount', v_entry.gross_amount,
    'deductionAmount', v_entry.deduction_amount,
    'netAmount', v_entry.net_amount,
    'costCenterId', v_entry.cost_center_id,
    'chartAccountId', v_entry.chart_account_id,
    'competenceMonth', v_period.competence_month,
    'dueDate', v_entry.due_date,
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at, i.id)
      from public.payroll_items i where i.payroll_entry_id = v_entry.id), '[]'::jsonb)
  );

  select id, status into v_document_id, v_existing_status
  from public.financial_documents
  where tenant_id = v_entry.tenant_id
    and source_type = 'payroll'
    and source_id = v_entry.id
    and source_event = 'payroll_posting';

  if v_document_id is null then
    insert into public.financial_documents (
      tenant_id, workspace_id, direction, document_type, source_type, source_id, source_event,
      description, original_amount, competence_date, issue_date, currency, status,
      chart_account_id, notes
    ) values (
      v_entry.tenant_id,
      v_entry.workspace_id,
      'payable',
      'payroll',
      'payroll',
      v_entry.id,
      'payroll_posting',
      'Folha ' || v_entry.employee_name_snapshot || ' - ' || to_char(v_period.competence_month, 'MM/YYYY'),
      v_entry.net_amount,
      (date_trunc('month', v_period.competence_month) + interval '1 month - 1 day')::date,
      current_date,
      'BRL',
      'posted',
      v_entry.chart_account_id,
      'Snapshot folha gerencial: ' || v_snapshot::text
    ) returning id into v_document_id;

    insert into public.financial_installments (
      tenant_id, workspace_id, document_id, installment_number, amount, due_date
    ) values (
      v_entry.tenant_id, v_entry.workspace_id, v_document_id, 1, v_entry.net_amount, v_entry.due_date
    );

    insert into public.financial_allocations (
      tenant_id, workspace_id, document_id, cost_center_id, chart_account_id,
      amount, percentage, description
    ) values (
      v_entry.tenant_id, v_entry.workspace_id, v_document_id, v_entry.cost_center_id,
      v_entry.chart_account_id, v_entry.net_amount, 100, 'Alocacao da folha gerencial'
    );
  end if;

  update public.payroll_entries
  set status = case when v_existing_status = 'settled' then 'paid' else 'posted' end,
      financial_document_id = v_document_id,
      posted_by = coalesce(posted_by, auth.uid()),
      posted_at = coalesce(posted_at, now())
  where id = v_entry.id;

  return jsonb_build_object('documentId', v_document_id, 'created', v_existing_status is null);
end;
$$;

create or replace function public.void_payroll_entry(p_entry_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_entry public.payroll_entries;
  v_document_status text;
begin
  select * into v_entry from public.payroll_entries where id = p_entry_id for update;
  if not found then raise exception 'PAYROLL_ENTRY_NOT_FOUND'; end if;
  perform private.require_payroll_permission(v_entry.workspace_id, 'financial.payroll.void');
  if nullif(btrim(p_reason), '') is null then raise exception 'PAYROLL_VOID_REASON_REQUIRED'; end if;
  if v_entry.status = 'paid' then raise exception 'PAYROLL_PAID_ENTRY_CANNOT_BE_VOIDED'; end if;
  if v_entry.financial_document_id is not null then
    select status into v_document_status
    from public.financial_documents
    where id = v_entry.financial_document_id for update;
    if v_document_status in ('settled', 'partially_settled') then
      raise exception 'PAYROLL_SETTLED_DOCUMENT_CANNOT_BE_VOIDED';
    end if;
    update public.financial_documents
    set status = 'voided', notes = concat_ws(E'\n', notes, 'Cancelamento folha: ' || p_reason)
    where id = v_entry.financial_document_id;
    update public.financial_installments
    set status = 'voided'
    where document_id = v_entry.financial_document_id;
  end if;
  update public.payroll_entries
  set status = 'voided', voided_by = auth.uid(), voided_at = now(), void_reason = p_reason
  where id = p_entry_id;
  return p_entry_id;
end;
$$;

create or replace function public.create_employee_advance(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_tenant_id uuid;
  v_employee public.employee_financial_profiles;
  v_amount numeric(18,2) := (p_payload->>'amount')::numeric;
  v_due_date date := (p_payload->>'paidOn')::date;
  v_advance_id uuid;
  v_document_id uuid;
begin
  perform private.require_payroll_permission(v_workspace_id, 'financial.payroll.manage');
  select tenant_id into v_tenant_id from public.workspaces
  where id = v_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'PAYROLL_INVALID_WORKSPACE'; end if;
  select * into v_employee from public.employee_financial_profiles
  where id = (p_payload->>'employeeProfileId')::uuid and workspace_id = v_workspace_id;
  if not found then raise exception 'PAYROLL_EMPLOYEE_NOT_FOUND'; end if;
  if v_amount <= 0 then raise exception 'PAYROLL_INVALID_AMOUNT'; end if;

  insert into public.employee_advances (
    tenant_id, workspace_id, employee_profile_id, amount, paid_on, description, notes
  ) values (
    v_tenant_id, v_workspace_id, v_employee.id, v_amount, v_due_date,
    coalesce(nullif(p_payload->>'description', ''), 'Adiantamento salarial'),
    nullif(p_payload->>'notes', '')
  ) returning id into v_advance_id;

  insert into public.financial_documents (
    tenant_id, workspace_id, direction, document_type, source_type, source_id, source_event,
    description, original_amount, competence_date, issue_date, currency, status,
    chart_account_id, notes
  ) values (
    v_tenant_id, v_workspace_id, 'payable', 'payroll_advance',
    'payroll_advance', v_advance_id, 'advance_payment',
    'Adiantamento ' || v_employee.display_name,
    v_amount, v_due_date, current_date, 'BRL', 'posted',
    v_employee.default_chart_account_id,
    'Adiantamento pago. Quando aplicado na folha, entra como desconto e nao duplica despesa.'
  ) returning id into v_document_id;

  insert into public.financial_installments (
    tenant_id, workspace_id, document_id, installment_number, amount, due_date
  ) values (v_tenant_id, v_workspace_id, v_document_id, 1, v_amount, v_due_date);

  insert into public.financial_allocations (
    tenant_id, workspace_id, document_id, cost_center_id, chart_account_id,
    amount, percentage, description
  ) values (
    v_tenant_id, v_workspace_id, v_document_id,
    v_employee.default_cost_center_id, v_employee.default_chart_account_id,
    v_amount, 100, 'Adiantamento salarial'
  );

  update public.employee_advances
  set financial_document_id = v_document_id
  where id = v_advance_id;

  return v_advance_id;
end;
$$;

create or replace function private.recurring_due_date(
  p_frequency text,
  p_period_start date,
  p_due_day integer
)
returns date
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if p_frequency = 'WEEKLY' then
    return p_period_start + (least(greatest(p_due_day, 1), 7) - 1);
  end if;
  return make_date(
    extract(year from p_period_start)::integer,
    extract(month from p_period_start)::integer,
    least(p_due_day, extract(day from (date_trunc('month', p_period_start) + interval '1 month - 1 day'))::integer)
  );
end;
$$;

create or replace function private.recurring_matches_period(
  p_frequency text,
  p_start_month date,
  p_period_start date
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if p_frequency = 'WEEKLY' then
    return p_period_start >= p_start_month;
  elsif p_frequency = 'YEARLY' then
    return extract(month from p_period_start) = extract(month from p_start_month)
      and p_period_start >= p_start_month;
  end if;
  return date_trunc('month', p_period_start)::date >= p_start_month;
end;
$$;

drop view if exists public.financial_recurring_rules_overview;

create view public.financial_recurring_rules_overview
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
  v_frequency text := coalesce(nullif(p_payload->>'frequency', ''), 'MONTHLY');
begin
  perform private.require_financial_permission(v_workspace_id, 'financial.manage_recurring');
  select tenant_id into v_tenant_id
  from public.workspaces
  where id = v_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'FINANCIAL_INVALID_WORKSPACE'; end if;
  if v_status not in ('active', 'paused', 'ended') then
    raise exception 'FINANCIAL_RECURRING_INVALID_STATUS';
  end if;
  if v_frequency not in ('MONTHLY', 'WEEKLY', 'YEARLY') then
    raise exception 'FINANCIAL_RECURRING_INVALID_FREQUENCY';
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
      start_month, end_month, auto_post, status, notes, frequency
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
      nullif(p_payload->>'notes', ''),
      v_frequency
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
        notes = nullif(p_payload->>'notes', ''),
        frequency = v_frequency
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
  v_anchor date := date_trunc('month', p_competence_month)::date;
  v_rule public.financial_recurring_rules;
  v_document_id uuid;
  v_due_date date;
  v_generated integer := 0;
  v_skipped integer := 0;
  v_document_ids uuid[] := '{}'::uuid[];
  v_source_event text;
  v_period_start date;
  v_periods date[];
  v_snapshot jsonb;
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
      and start_month <= (v_anchor + interval '1 month - 1 day')::date
      and (end_month is null or end_month >= v_anchor)
      and (p_rule_id is null or id = p_rule_id)
    order by name
  loop
    v_periods := case v_rule.frequency
      when 'WEEKLY' then array(
        select gs::date from generate_series(v_anchor, (v_anchor + interval '1 month - 1 day')::date, interval '1 week') gs
      )
      else array[v_anchor]
    end;

    foreach v_period_start in array v_periods loop
      if not private.recurring_matches_period(v_rule.frequency, v_rule.start_month, v_period_start) then
        continue;
      end if;
      if v_rule.end_month is not null and v_period_start > (v_rule.end_month + interval '1 month - 1 day')::date then
        continue;
      end if;

      v_source_event := case v_rule.frequency
        when 'WEEKLY' then 'recurring:WEEKLY:' || to_char(v_period_start, 'IYYY-IW')
        when 'YEARLY' then 'recurring:YEARLY:' || to_char(v_period_start, 'YYYY')
        else 'recurring:MONTHLY:' || to_char(v_period_start, 'YYYY-MM')
      end;
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

      v_due_date := private.recurring_due_date(v_rule.frequency, v_period_start, v_rule.due_day);
      v_snapshot := jsonb_build_object(
        'ruleId', v_rule.id,
        'name', v_rule.name,
        'kind', v_rule.kind,
        'frequency', v_rule.frequency,
        'amount', v_rule.amount,
        'partnerId', v_rule.partner_id,
        'employeeName', v_rule.employee_name,
        'driverId', v_rule.driver_id,
        'vehicleId', v_rule.vehicle_id,
        'costCenterId', v_rule.cost_center_id,
        'chartAccountId', v_rule.chart_account_id,
        'periodStart', v_period_start,
        'dueDate', v_due_date,
        'sourceEvent', v_source_event
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
          when 'salary' then 'salary_expense_simple'
          when 'fixed_cost' then 'fixed_cost'
          else 'recurring_expense'
        end,
        'recurring_rule',
        v_rule.id,
        v_source_event,
        v_rule.name || ' - ' || case v_rule.frequency
          when 'WEEKLY' then to_char(v_period_start, 'DD/MM/YYYY')
          when 'YEARLY' then to_char(v_period_start, 'YYYY')
          else to_char(v_period_start, 'MM/YYYY')
        end,
        v_rule.amount,
        v_period_start,
        v_period_start,
        'BRL',
        'draft',
        v_rule.chart_account_id,
        concat_ws(E'\n',
          'Gerado automaticamente por recorrencia financeira.',
          'Snapshot recorrencia: ' || v_snapshot::text,
          v_rule.notes
        )
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

      insert into public.payroll_audit_events (
        tenant_id, workspace_id, recurring_rule_id, financial_document_id,
        action, actor_id, metadata
      ) values (
        v_tenant_id, p_workspace_id, v_rule.id, v_document_id,
        'recurring_rule_manual_generation', auth.uid(), v_snapshot
      );

      v_generated := v_generated + 1;
      v_document_ids := array_append(v_document_ids, v_document_id);
    end loop;
  end loop;

  return jsonb_build_object(
    'generated', v_generated,
    'skipped', v_skipped,
    'documentIds', coalesce(to_jsonb(v_document_ids), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.require_payroll_permission(uuid, text) from public, anon, authenticated;
revoke all on function private.validate_employee_financial_profile() from public, anon, authenticated;
revoke all on function private.audit_payroll_row() from public, anon, authenticated;
revoke all on function private.refresh_payroll_entry_totals(uuid) from public, anon, authenticated;
revoke all on function private.sync_payroll_paid_status(uuid) from public, anon, authenticated;
revoke all on function private.payroll_document_status_bridge() from public, anon, authenticated;
revoke all on function private.recurring_due_date(text, date, integer) from public, anon, authenticated;
revoke all on function private.recurring_matches_period(text, date, date) from public, anon, authenticated;

revoke all on function public.save_employee_financial_profile(jsonb) from public, anon;
revoke all on function public.create_payroll_entry(jsonb) from public, anon;
revoke all on function public.save_payroll_item(jsonb) from public, anon;
revoke all on function public.delete_payroll_item(uuid) from public, anon;
revoke all on function public.calculate_payroll_entry(uuid) from public, anon;
revoke all on function public.approve_payroll_entry(uuid) from public, anon;
revoke all on function public.post_payroll_entry(uuid) from public, anon;
revoke all on function public.void_payroll_entry(uuid, text) from public, anon;
revoke all on function public.create_employee_advance(jsonb) from public, anon;

grant execute on function public.save_employee_financial_profile(jsonb) to authenticated;
grant execute on function public.create_payroll_entry(jsonb) to authenticated;
grant execute on function public.save_payroll_item(jsonb) to authenticated;
grant execute on function public.delete_payroll_item(uuid) to authenticated;
grant execute on function public.calculate_payroll_entry(uuid) to authenticated;
grant execute on function public.approve_payroll_entry(uuid) to authenticated;
grant execute on function public.post_payroll_entry(uuid) to authenticated;
grant execute on function public.void_payroll_entry(uuid, text) to authenticated;
grant execute on function public.create_employee_advance(jsonb) to authenticated;

comment on table public.employee_financial_profiles is
  'Camada financeira complementar de funcionarios. Reutiliza driver, profile/user ou business_partner quando existirem.';
comment on table public.payroll_periods is
  'Competencias mensais da folha gerencial Frotak.';
comment on table public.payroll_entries is
  'Fechamento de folha por funcionario e competencia, postado em financial_documents.';
comment on table public.payroll_items is
  'Proventos e descontos manuais da folha gerencial.';
comment on table public.employee_advances is
  'Adiantamentos pagos como saida financeira e aplicaveis uma unica vez como desconto de folha.';
comment on column public.financial_recurring_rules.frequency is
  'Frequencia da despesa recorrente. O kind salary fica apenas para despesa salarial simples legada; a folha oficial usa payroll_entries.';
