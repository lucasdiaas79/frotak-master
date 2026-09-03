-- Frotak Financeiro - Fase 2: contas a pagar/receber, contas financeiras e baixas.
-- Nenhuma automacao operacional e criada nesta migration.

alter table public.financial_documents
  add column document_number text,
  add column notes text;

alter table public.financial_installments
  add column settled_at timestamptz;

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null,
  account_type text not null,
  bank_name text,
  agency text,
  account_number text,
  opening_balance numeric(18,2) not null default 0,
  opening_balance_date date not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_accounts_name_chk check (btrim(name) <> ''),
  constraint financial_accounts_type_chk check (
    account_type in ('checking', 'savings', 'cash', 'wallet', 'other')
  ),
  constraint financial_accounts_tenant_workspace_fk
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id),
  constraint financial_accounts_workspace_name_uidx unique(workspace_id, name)
);

create unique index financial_accounts_tenant_workspace_id_uidx
  on public.financial_accounts(tenant_id, workspace_id, id);
create index financial_accounts_workspace_active_idx
  on public.financial_accounts(workspace_id, active);

create trigger financial_accounts_set_updated_at
before update on public.financial_accounts
for each row execute function public.set_updated_at();

create unique index financial_installments_tenant_workspace_id_uidx
  on public.financial_installments(tenant_id, workspace_id, id);

create table public.financial_settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  document_id uuid not null references public.financial_documents(id) on delete restrict,
  installment_id uuid not null references public.financial_installments(id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  settlement_type text not null default 'settlement',
  original_settlement_id uuid references public.financial_settlements(id) on delete restrict,
  principal_amount numeric(18,2) not null,
  interest_amount numeric(18,2) not null default 0,
  penalty_amount numeric(18,2) not null default 0,
  discount_amount numeric(18,2) not null default 0,
  net_amount numeric(18,2) generated always as (
    principal_amount + interest_amount + penalty_amount - discount_amount
  ) stored,
  settled_on date not null,
  payment_method text not null,
  notes text,
  reversal_reason text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint financial_settlements_type_chk check (
    settlement_type in ('settlement', 'reversal')
  ),
  constraint financial_settlements_amounts_chk check (
    principal_amount > 0 and interest_amount >= 0 and penalty_amount >= 0
    and discount_amount >= 0
    and principal_amount + interest_amount + penalty_amount >= discount_amount
  ),
  constraint financial_settlements_reversal_chk check (
    (settlement_type = 'settlement' and original_settlement_id is null and reversal_reason is null)
    or (settlement_type = 'reversal' and original_settlement_id is not null
      and nullif(btrim(reversal_reason), '') is not null)
  ),
  constraint financial_settlements_document_tenant_fk
    foreign key (tenant_id, workspace_id, document_id)
    references public.financial_documents(tenant_id, workspace_id, id),
  constraint financial_settlements_installment_tenant_fk
    foreign key (tenant_id, workspace_id, installment_id)
    references public.financial_installments(tenant_id, workspace_id, id),
  constraint financial_settlements_account_tenant_fk
    foreign key (tenant_id, workspace_id, financial_account_id)
    references public.financial_accounts(tenant_id, workspace_id, id)
);

create unique index financial_settlements_reversal_uidx
  on public.financial_settlements(original_settlement_id)
  where settlement_type = 'reversal';
create index financial_settlements_document_idx
  on public.financial_settlements(document_id, settled_on desc);
create index financial_settlements_installment_idx
  on public.financial_settlements(installment_id, settled_on desc);
create index financial_settlements_account_idx
  on public.financial_settlements(financial_account_id, settled_on desc);

alter table public.financial_accounts enable row level security;
alter table public.financial_settlements enable row level security;

grant select on public.financial_accounts, public.financial_settlements to authenticated;

revoke insert, update, delete on public.business_partners, public.business_partner_roles,
  public.chart_of_accounts, public.cost_centers, public.financial_documents,
  public.financial_installments, public.financial_allocations, public.accounting_periods
  from authenticated;

create policy financial_accounts_read on public.financial_accounts for select to authenticated
using (private.can_read_financial_workspace(workspace_id));
create policy financial_settlements_read on public.financial_settlements for select to authenticated
using (private.can_read_financial_workspace(workspace_id));

-- Catalogo granular da Fase 2.
with permission_seed (code, name, description, risk_level) as (
  values
    ('financial.view', 'Acessar Financeiro', 'Visualizar o modulo financeiro.', 'low'),
    ('financial.create', 'Criar titulos', 'Criar contas a pagar e receber.', 'high'),
    ('financial.edit_draft', 'Editar rascunhos', 'Editar titulos ainda nao contabilizados.', 'high'),
    ('financial.receive', 'Receber titulos', 'Registrar recebimentos financeiros.', 'high'),
    ('financial.pay', 'Pagar titulos', 'Registrar pagamentos financeiros.', 'high'),
    ('financial.reverse_settlement', 'Estornar baixas', 'Estornar pagamentos e recebimentos.', 'critical'),
    ('financial.export', 'Exportar Financeiro', 'Exportar dados e relatorios financeiros.', 'medium'),
    ('financial.manage_accounts', 'Gerenciar bancos e caixas', 'Gerenciar contas financeiras.', 'critical'),
    ('financial.manage_chart', 'Gerenciar plano de contas', 'Gerenciar categorias financeiras.', 'critical'),
    ('financial.manage_cost_centers', 'Gerenciar centros de custo', 'Gerenciar centros de custo.', 'high')
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

-- OWNER recebe tudo; FINANCIAL recebe o conjunto operacional padrao.
insert into public.role_permissions (role_id, permission_id)
select wr.id, p.id
from public.workspace_roles wr
join public.permissions p on p.code like 'financial.%' and p.active = true
where wr.code = 'OWNER' and wr.active = true
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select wr.id, p.id
from public.workspace_roles wr
join public.permissions p on p.code = any(array[
  'financial.view', 'financial.create', 'financial.edit_draft',
  'financial.receive', 'financial.pay', 'financial.reverse_settlement',
  'financial.export', 'financial.manage_accounts', 'financial.manage_chart',
  'financial.manage_cost_centers', 'financial.dashboard.read',
  'financial.transactions.read', 'financial.transactions.manage',
  'financial.reports.export', 'financial.settings.manage'
])
where wr.code = 'FINANCIAL' and wr.active = true
on conflict do nothing;

create or replace function private.can_read_financial_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_workspace_owner(p_workspace_id)
      or private.has_permission(p_workspace_id, 'financial.view')
      or private.has_permission(p_workspace_id, 'financial.transactions.read')
      or private.has_permission(p_workspace_id, 'financial.dashboard.read');
$$;

create or replace function private.can_manage_financial_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_workspace_owner(p_workspace_id)
      or private.has_permission(p_workspace_id, 'financial.create')
      or private.has_permission(p_workspace_id, 'financial.edit_draft')
      or private.has_permission(p_workspace_id, 'financial.transactions.manage');
$$;

create or replace function private.can_configure_financial_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_workspace_owner(p_workspace_id)
      or private.has_permission(p_workspace_id, 'financial.manage_accounts')
      or private.has_permission(p_workspace_id, 'financial.manage_chart')
      or private.has_permission(p_workspace_id, 'financial.manage_cost_centers')
      or private.has_permission(p_workspace_id, 'financial.settings.manage');
$$;

create or replace function private.require_financial_permission(
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
    raise exception 'FINANCIAL_FORBIDDEN:%', p_permission using errcode = '42501';
  end if;
end;
$$;

create or replace function public.get_financial_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
  v_tenant_id uuid;
  v_is_owner boolean;
  v_permissions text[];
begin
  select wm.workspace_id, w.tenant_id, wm.is_owner
    into v_workspace_id, v_tenant_id, v_is_owner
  from public.workspace_memberships wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = auth.uid() and wm.status = 'active' and w.status = 'active'
  order by wm.is_owner desc, wm.joined_at nulls last
  limit 1;

  if v_workspace_id is null then raise exception 'FINANCIAL_NO_WORKSPACE' using errcode = '42501'; end if;

  select coalesce(array_agg(distinct p.code) filter (where p.code is not null), '{}'::text[])
    into v_permissions
  from public.membership_roles mr
  join public.workspace_memberships wm on wm.id = mr.membership_id
  join public.role_permissions rp on rp.role_id = mr.role_id
  join public.permissions p on p.id = rp.permission_id and p.active = true
  where wm.user_id = auth.uid() and wm.workspace_id = v_workspace_id;

  return jsonb_build_object(
    'workspaceId', v_workspace_id,
    'tenantId', v_tenant_id,
    'isOwner', v_is_owner,
    'permissions', v_permissions,
    'canView', v_is_owner or 'financial.view' = any(v_permissions)
      or 'financial.transactions.read' = any(v_permissions)
  );
end;
$$;

create or replace function private.refresh_financial_document_status(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_original numeric(18,2);
  v_settled numeric(18,2);
begin
  select original_amount into v_original from public.financial_documents where id = p_document_id;
  select coalesce(sum(settled_amount), 0) into v_settled
  from public.financial_installments where document_id = p_document_id;

  update public.financial_documents
  set status = case
    when status = 'voided' then 'voided'
    when v_settled <= 0 then 'posted'
    when v_settled < v_original then 'partially_settled'
    else 'settled'
  end
  where id = p_document_id and status <> 'draft';
end;
$$;

create or replace function public.save_financial_document(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_tenant_id uuid;
  v_amount numeric(18,2) := (p_payload->>'originalAmount')::numeric;
  v_count integer := greatest(coalesce((p_payload->>'installmentCount')::integer, 1), 1);
  v_first_due date := (p_payload->>'firstDueDate')::date;
  v_custom jsonb := coalesce(p_payload->'installments', '[]'::jsonb);
  v_item jsonb;
  v_sum numeric(18,2) := 0;
  v_base numeric(18,2);
  v_value numeric(18,2);
  v_number integer := 0;
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'draft');
  v_existing_status text;
  v_cost_center_id uuid := nullif(p_payload->>'costCenterId', '')::uuid;
begin
  perform private.require_financial_permission(
    v_workspace_id,
    case when v_id is null then 'financial.create' else 'financial.edit_draft' end
  );
  select tenant_id into v_tenant_id from public.workspaces where id = v_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'FINANCIAL_INVALID_WORKSPACE'; end if;
  if v_amount <= 0 then raise exception 'FINANCIAL_INVALID_AMOUNT'; end if;
  if v_status not in ('draft', 'posted') then raise exception 'FINANCIAL_INVALID_STATUS'; end if;

  if v_id is not null then
    select status into v_existing_status from public.financial_documents
    where id = v_id and workspace_id = v_workspace_id for update;
    if v_existing_status is null then raise exception 'FINANCIAL_DOCUMENT_NOT_FOUND'; end if;
    if v_existing_status <> 'draft' then raise exception 'FINANCIAL_ONLY_DRAFT_EDITABLE'; end if;
    delete from public.financial_allocations where document_id = v_id;
    delete from public.financial_installments where document_id = v_id;
    update public.financial_documents set
      direction = p_payload->>'direction',
      partner_id = nullif(p_payload->>'partnerId', '')::uuid,
      document_type = coalesce(nullif(p_payload->>'documentType', ''), 'manual'),
      document_number = nullif(p_payload->>'documentNumber', ''),
      description = p_payload->>'description',
      original_amount = v_amount,
      competence_date = nullif(p_payload->>'competenceDate', '')::date,
      issue_date = nullif(p_payload->>'issueDate', '')::date,
      chart_account_id = nullif(p_payload->>'chartAccountId', '')::uuid,
      notes = nullif(p_payload->>'notes', ''),
      status = 'draft'
    where id = v_id;
  else
    insert into public.financial_documents (
      tenant_id, workspace_id, direction, partner_id, document_type, document_number,
      description, original_amount, competence_date, issue_date, chart_account_id,
      notes, status
    ) values (
      v_tenant_id, v_workspace_id, p_payload->>'direction',
      nullif(p_payload->>'partnerId', '')::uuid,
      coalesce(nullif(p_payload->>'documentType', ''), 'manual'),
      nullif(p_payload->>'documentNumber', ''), p_payload->>'description', v_amount,
      nullif(p_payload->>'competenceDate', '')::date,
      nullif(p_payload->>'issueDate', '')::date,
      nullif(p_payload->>'chartAccountId', '')::uuid,
      nullif(p_payload->>'notes', ''), 'draft'
    ) returning id into v_id;
  end if;

  if jsonb_array_length(v_custom) > 0 then
    for v_item in select value from jsonb_array_elements(v_custom) loop
      v_number := v_number + 1;
      v_value := (v_item->>'amount')::numeric;
      v_sum := v_sum + v_value;
      insert into public.financial_installments (
        tenant_id, workspace_id, document_id, installment_number, amount, due_date
      ) values (
        v_tenant_id, v_workspace_id, v_id, v_number, v_value, (v_item->>'dueDate')::date
      );
    end loop;
  else
    if v_first_due is null then raise exception 'FINANCIAL_DUE_DATE_REQUIRED'; end if;
    v_base := trunc((v_amount / v_count) * 100) / 100;
    for v_number in 1..v_count loop
      v_value := case when v_number = v_count
        then v_amount - (v_base * (v_count - 1)) else v_base end;
      v_sum := v_sum + v_value;
      insert into public.financial_installments (
        tenant_id, workspace_id, document_id, installment_number, amount, due_date
      ) values (
        v_tenant_id, v_workspace_id, v_id, v_number, v_value,
        (v_first_due + make_interval(months => v_number - 1))::date
      );
    end loop;
  end if;

  if v_sum <> v_amount then raise exception 'FINANCIAL_INSTALLMENTS_TOTAL_MISMATCH'; end if;

  if v_cost_center_id is not null
    or nullif(p_payload->>'vehicleId', '') is not null
    or nullif(p_payload->>'freightId', '') is not null
    or nullif(p_payload->>'productId', '') is not null then
    insert into public.financial_allocations (
      tenant_id, workspace_id, document_id, freight_id, vehicle_id,
      business_partner_id, cost_center_id, product_id, chart_account_id, amount
    ) values (
      v_tenant_id, v_workspace_id, v_id,
      nullif(p_payload->>'freightId', '')::uuid,
      nullif(p_payload->>'vehicleId', '')::uuid,
      nullif(p_payload->>'partnerId', '')::uuid,
      v_cost_center_id,
      nullif(p_payload->>'productId', '')::uuid,
      nullif(p_payload->>'chartAccountId', '')::uuid,
      v_amount
    );
  end if;

  if v_status = 'posted' then
    update public.financial_documents
    set status = 'posted'
    where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function private.audit_financial_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.financial_audit_events (
    tenant_id, workspace_id, financial_document_id, action, actor_id,
    old_status, new_status, metadata
  ) values (
    new.tenant_id,
    new.workspace_id,
    new.id,
    case when tg_op = 'INSERT' then 'created'
      when old.status is distinct from new.status then 'status_changed'
      else 'updated' end,
    auth.uid(),
    case when tg_op = 'UPDATE' then old.status end,
    new.status,
    jsonb_build_object(
      'before', case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
      'after', to_jsonb(new)
    )
  );
  return new;
end;
$$;

create or replace function public.void_financial_document(p_document_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_workspace_id uuid; v_status text;
begin
  select workspace_id, status into v_workspace_id, v_status
  from public.financial_documents where id = p_document_id for update;
  perform private.require_financial_permission(v_workspace_id, 'financial.edit_draft');
  if v_status = 'settled' or v_status = 'partially_settled' then
    raise exception 'FINANCIAL_SETTLED_DOCUMENT_CANNOT_BE_VOIDED';
  end if;
  update public.financial_documents
  set status = 'voided', notes = concat_ws(E'\n', notes, 'Cancelamento: ' || p_reason)
  where id = p_document_id;
  update public.financial_installments set status = 'voided' where document_id = p_document_id;
end;
$$;

create or replace function public.settle_financial_installment(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_installment public.financial_installments;
  v_document public.financial_documents;
  v_principal numeric(18,2) := (p_payload->>'amount')::numeric;
  v_id uuid;
begin
  select * into v_installment from public.financial_installments
  where id = (p_payload->>'installmentId')::uuid for update;
  if not found then raise exception 'FINANCIAL_INSTALLMENT_NOT_FOUND'; end if;
  select * into v_document from public.financial_documents where id = v_installment.document_id;
  perform private.require_financial_permission(
    v_installment.workspace_id,
    case when v_document.direction = 'receivable' then 'financial.receive' else 'financial.pay' end
  );
  if v_document.status in ('draft', 'voided') then raise exception 'FINANCIAL_DOCUMENT_NOT_POSTED'; end if;
  if v_principal <= 0 or v_principal > v_installment.balance then
    raise exception 'FINANCIAL_INVALID_SETTLEMENT_AMOUNT';
  end if;

  insert into public.financial_settlements (
    tenant_id, workspace_id, document_id, installment_id, financial_account_id,
    principal_amount, interest_amount, penalty_amount, discount_amount,
    settled_on, payment_method, notes
  ) values (
    v_installment.tenant_id, v_installment.workspace_id, v_document.id, v_installment.id,
    (p_payload->>'financialAccountId')::uuid, v_principal,
    coalesce((p_payload->>'interestAmount')::numeric, 0),
    coalesce((p_payload->>'penaltyAmount')::numeric, 0),
    coalesce((p_payload->>'discountAmount')::numeric, 0),
    (p_payload->>'settledOn')::date,
    coalesce(nullif(p_payload->>'paymentMethod', ''), 'other'),
    nullif(p_payload->>'notes', '')
  ) returning id into v_id;

  update public.financial_installments
  set settled_amount = settled_amount + v_principal,
      status = case when settled_amount + v_principal = amount then 'settled' else 'partially_settled' end,
      settled_at = case when settled_amount + v_principal = amount then now() else null end
  where id = v_installment.id;
  perform private.refresh_financial_document_status(v_document.id);
  return v_id;
end;
$$;

create or replace function public.reverse_financial_settlement(
  p_settlement_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_original public.financial_settlements; v_id uuid;
begin
  select * into v_original from public.financial_settlements
  where id = p_settlement_id and settlement_type = 'settlement' for update;
  if not found then raise exception 'FINANCIAL_SETTLEMENT_NOT_FOUND'; end if;
  perform private.require_financial_permission(
    v_original.workspace_id, 'financial.reverse_settlement'
  );
  if exists (select 1 from public.financial_settlements where original_settlement_id = v_original.id) then
    raise exception 'FINANCIAL_SETTLEMENT_ALREADY_REVERSED';
  end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'FINANCIAL_REVERSAL_REASON_REQUIRED'; end if;

  insert into public.financial_settlements (
    tenant_id, workspace_id, document_id, installment_id, financial_account_id,
    settlement_type, original_settlement_id, principal_amount, interest_amount,
    penalty_amount, discount_amount, settled_on, payment_method, notes, reversal_reason
  ) values (
    v_original.tenant_id, v_original.workspace_id, v_original.document_id,
    v_original.installment_id, v_original.financial_account_id, 'reversal', v_original.id,
    v_original.principal_amount, v_original.interest_amount, v_original.penalty_amount,
    v_original.discount_amount, current_date, v_original.payment_method,
    'Estorno da baixa ' || v_original.id, p_reason
  ) returning id into v_id;

  update public.financial_installments
  set settled_amount = greatest(0, settled_amount - v_original.principal_amount),
      status = case
        when settled_amount - v_original.principal_amount <= 0 then 'open'
        else 'partially_settled' end,
      settled_at = null
  where id = v_original.installment_id;
  perform private.refresh_financial_document_status(v_original.document_id);
  return v_id;
end;
$$;

create or replace function public.save_financial_account(p_payload jsonb)
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
  perform private.require_financial_permission(v_workspace_id, 'financial.manage_accounts');
  select tenant_id into v_tenant_id from public.workspaces where id = v_workspace_id;
  if v_id is null then
    insert into public.financial_accounts (
      tenant_id, workspace_id, name, account_type, bank_name, agency, account_number,
      opening_balance, opening_balance_date, active
    ) values (
      v_tenant_id, v_workspace_id, p_payload->>'name', p_payload->>'accountType',
      nullif(p_payload->>'bankName', ''), nullif(p_payload->>'agency', ''),
      nullif(p_payload->>'accountNumber', ''),
      coalesce((p_payload->>'openingBalance')::numeric, 0),
      (p_payload->>'openingBalanceDate')::date,
      coalesce((p_payload->>'active')::boolean, true)
    ) returning id into v_id;
  else
    update public.financial_accounts set
      name = p_payload->>'name', account_type = p_payload->>'accountType',
      bank_name = nullif(p_payload->>'bankName', ''), agency = nullif(p_payload->>'agency', ''),
      account_number = nullif(p_payload->>'accountNumber', ''),
      active = coalesce((p_payload->>'active')::boolean, active)
    where id = v_id and workspace_id = v_workspace_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.save_chart_account(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_id uuid := nullif(p_payload->>'id', '')::uuid; v_tenant_id uuid; v_workspace_id uuid := (p_payload->>'workspaceId')::uuid; v_system boolean;
begin
  perform private.require_financial_permission(v_workspace_id, 'financial.manage_chart');
  select tenant_id into v_tenant_id from public.workspaces where id = v_workspace_id;
  if v_id is null then
    insert into public.chart_of_accounts (tenant_id, parent_id, code, name, account_type, normal_balance, dre_group)
    values (v_tenant_id, nullif(p_payload->>'parentId', '')::uuid, p_payload->>'code', p_payload->>'name',
      p_payload->>'accountType', p_payload->>'normalBalance', nullif(p_payload->>'dreGroup', '')) returning id into v_id;
  else
    select is_system into v_system from public.chart_of_accounts where id = v_id and tenant_id = v_tenant_id;
    update public.chart_of_accounts set
      name = case when v_system then name else p_payload->>'name' end,
      active = case when v_system then active else coalesce((p_payload->>'active')::boolean, active) end,
      dre_group = case when v_system then dre_group else nullif(p_payload->>'dreGroup', '') end
    where id = v_id and tenant_id = v_tenant_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.save_business_partner(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_tenant_id uuid;
  v_tax_digits text;
  v_role text := p_payload->>'role';
begin
  perform private.require_financial_permission(v_workspace_id, 'financial.create');
  select tenant_id into v_tenant_id from public.workspaces where id = v_workspace_id;
  if v_role not in ('customer', 'supplier') then raise exception 'FINANCIAL_INVALID_PARTNER_ROLE'; end if;
  v_tax_digits := nullif(regexp_replace(coalesce(p_payload->>'taxId', ''), '[^0-9]', '', 'g'), '');
  if v_tax_digits is not null and length(v_tax_digits) not in (11, 14) then
    raise exception 'FINANCIAL_INVALID_PARTNER_TAX_ID';
  end if;
  if v_id is null and v_tax_digits is not null then
    select id into v_id from public.business_partners
    where tenant_id = v_tenant_id and tax_id = v_tax_digits;
  end if;
  if v_id is null then
    insert into public.business_partners (
      tenant_id, legal_name, trade_name, tax_id, tax_id_type, active
    ) values (
      v_tenant_id, nullif(p_payload->>'legalName', ''), p_payload->>'tradeName',
      v_tax_digits, case length(v_tax_digits) when 11 then 'cpf' when 14 then 'cnpj' end, true
    ) returning id into v_id;
  else
    update public.business_partners set
      legal_name = nullif(p_payload->>'legalName', ''),
      trade_name = p_payload->>'tradeName', active = true
    where id = v_id and tenant_id = v_tenant_id;
  end if;
  insert into public.business_partner_roles (tenant_id, partner_id, role)
  values (v_tenant_id, v_id, v_role)
  on conflict (partner_id, role) do update set active = true;
  return v_id;
end;
$$;

create or replace function public.save_cost_center(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_id uuid := nullif(p_payload->>'id', '')::uuid; v_tenant_id uuid; v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
begin
  perform private.require_financial_permission(v_workspace_id, 'financial.manage_cost_centers');
  select tenant_id into v_tenant_id from public.workspaces where id = v_workspace_id;
  if v_id is null then
    insert into public.cost_centers (tenant_id, workspace_id, parent_id, code, name)
    values (v_tenant_id, v_workspace_id, nullif(p_payload->>'parentId', '')::uuid,
      p_payload->>'code', p_payload->>'name') returning id into v_id;
  else
    update public.cost_centers set name = p_payload->>'name',
      active = coalesce((p_payload->>'active')::boolean, active)
    where id = v_id and tenant_id = v_tenant_id and is_system = false;
  end if;
  return v_id;
end;
$$;

create or replace view public.financial_account_balances
with (security_invoker = true)
as
select
  fa.id, fa.tenant_id, fa.workspace_id, fa.name, fa.account_type, fa.bank_name,
  fa.agency, fa.account_number, fa.opening_balance, fa.opening_balance_date, fa.active,
  fa.opening_balance + coalesce(sum(
    case
      when fs.id is null then 0
      when fd.direction = 'receivable' and fs.settlement_type = 'settlement' then fs.net_amount
      when fd.direction = 'receivable' and fs.settlement_type = 'reversal' then -fs.net_amount
      when fd.direction = 'payable' and fs.settlement_type = 'settlement' then -fs.net_amount
      else fs.net_amount
    end
  ), 0) as current_balance
from public.financial_accounts fa
left join public.financial_settlements fs on fs.financial_account_id = fa.id
left join public.financial_documents fd on fd.id = fs.document_id
group by fa.id;

grant select on public.financial_account_balances to authenticated;

create or replace function private.audit_financial_settlement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.financial_audit_events (
    tenant_id, workspace_id, financial_document_id, action, actor_id, metadata
  ) values (
    new.tenant_id, new.workspace_id, new.document_id,
    case when new.settlement_type = 'reversal' then 'settlement_reversed'
      when (select direction from public.financial_documents where id = new.document_id) = 'receivable'
        then 'received' else 'paid' end,
    auth.uid(),
    jsonb_build_object(
      'settlementId', new.id, 'installmentId', new.installment_id,
      'accountId', new.financial_account_id, 'principalAmount', new.principal_amount,
      'netAmount', new.net_amount, 'settledOn', new.settled_on,
      'originalSettlementId', new.original_settlement_id,
      'reversalReason', new.reversal_reason
    )
  );
  return new;
end;
$$;

create trigger financial_settlements_audit
after insert on public.financial_settlements
for each row execute function private.audit_financial_settlement();

revoke all on function public.get_financial_access() from public, anon;
revoke all on function public.save_financial_document(jsonb) from public, anon;
revoke all on function public.void_financial_document(uuid, text) from public, anon;
revoke all on function public.settle_financial_installment(jsonb) from public, anon;
revoke all on function public.reverse_financial_settlement(uuid, text) from public, anon;
revoke all on function public.save_financial_account(jsonb) from public, anon;
revoke all on function public.save_chart_account(jsonb) from public, anon;
revoke all on function public.save_cost_center(jsonb) from public, anon;
revoke all on function public.save_business_partner(jsonb) from public, anon;

grant execute on function public.get_financial_access() to authenticated;
grant execute on function public.save_financial_document(jsonb) to authenticated;
grant execute on function public.void_financial_document(uuid, text) to authenticated;
grant execute on function public.settle_financial_installment(jsonb) to authenticated;
grant execute on function public.reverse_financial_settlement(uuid, text) to authenticated;
grant execute on function public.save_financial_account(jsonb) to authenticated;
grant execute on function public.save_chart_account(jsonb) to authenticated;
grant execute on function public.save_cost_center(jsonb) to authenticated;
grant execute on function public.save_business_partner(jsonb) to authenticated;
