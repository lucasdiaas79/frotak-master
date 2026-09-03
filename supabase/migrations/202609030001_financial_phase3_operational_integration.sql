-- Frotak Financeiro - Fase 3: integracao idempotente operacao -> financeiro.
-- Os gatilhos nunca propagam falhas financeiras para o fluxo operacional.

create table public.financial_integration_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  default_receivable_due_days integer,
  default_payable_due_days integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_integration_settings_workspace_uidx unique (workspace_id),
  constraint financial_integration_settings_receivable_days_chk
    check (default_receivable_due_days is null or default_receivable_due_days >= 0),
  constraint financial_integration_settings_payable_days_chk
    check (default_payable_due_days is null or default_payable_due_days >= 0),
  constraint financial_integration_settings_workspace_tenant_fk
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id)
);

create trigger financial_integration_settings_set_updated_at
before update on public.financial_integration_settings
for each row execute function public.set_updated_at();

insert into public.financial_integration_settings (tenant_id, workspace_id)
select w.tenant_id, w.id from public.workspaces w
on conflict (workspace_id) do nothing;

create table public.financial_integration_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid references public.workspaces(id) on delete restrict,
  source_type text not null,
  source_id uuid not null,
  source_event text not null,
  status text not null default 'pending',
  financial_document_id uuid references public.financial_documents(id) on delete restrict,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  review_reasons text[] not null default '{}'::text[],
  last_error text,
  next_retry_at timestamptz,
  last_attempt_at timestamptz,
  processed_at timestamptz,
  detected_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_integration_jobs_source_type_chk
    check (source_type in ('freight', 'fuel_record', 'freight_expense')),
  constraint financial_integration_jobs_status_chk
    check (status in ('pending', 'processed', 'failed', 'needs_review')),
  constraint financial_integration_jobs_attempts_chk
    check (attempts >= 0 and max_attempts between 1 and 20),
  constraint financial_integration_jobs_source_uidx
    unique (tenant_id, source_type, source_id, source_event),
  constraint financial_integration_jobs_workspace_tenant_fk
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id)
);

create index financial_integration_jobs_workspace_status_idx
  on public.financial_integration_jobs(workspace_id, status, detected_at desc);
create index financial_integration_jobs_retry_idx
  on public.financial_integration_jobs(status, next_retry_at)
  where status in ('pending', 'failed');

create trigger financial_integration_jobs_set_updated_at
before update on public.financial_integration_jobs
for each row execute function public.set_updated_at();

create table public.financial_integration_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid references public.workspaces(id) on delete restrict,
  job_id uuid not null references public.financial_integration_jobs(id) on delete restrict,
  financial_document_id uuid references public.financial_documents(id) on delete restrict,
  action text not null,
  outcome text not null,
  actor_id uuid references auth.users(id) on delete set null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint financial_integration_events_outcome_chk
    check (outcome in ('pending', 'processed', 'failed', 'needs_review')),
  constraint financial_integration_events_workspace_tenant_fk
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id)
);

create index financial_integration_events_job_idx
  on public.financial_integration_events(job_id, created_at desc);

alter table public.financial_integration_settings enable row level security;
alter table public.financial_integration_jobs enable row level security;
alter table public.financial_integration_events enable row level security;

grant select on public.financial_integration_settings,
  public.financial_integration_jobs, public.financial_integration_events to authenticated;

create policy financial_integration_settings_read
on public.financial_integration_settings for select to authenticated
using (private.can_read_financial_workspace(workspace_id));

create policy financial_integration_jobs_read
on public.financial_integration_jobs for select to authenticated
using (workspace_id is not null and private.can_read_financial_workspace(workspace_id));

create policy financial_integration_events_read
on public.financial_integration_events for select to authenticated
using (workspace_id is not null and private.can_read_financial_workspace(workspace_id));

-- Categorias operacionais adicionais. Contas desconhecidas nunca sao
-- classificadas silenciosamente como combustivel.
insert into public.chart_of_accounts (
  tenant_id, parent_id, code, name, account_type, normal_balance,
  dre_group, is_postable, is_system
)
select t.id, parent.id, seed.code, seed.name, 'expense', 'debit',
       seed.dre_group, true, true
from public.tenants t
join public.chart_of_accounts parent
  on parent.tenant_id = t.id and parent.code = '4'
cross join (values
  ('4.05', 'Despesas de viagem', 'variable_cost'),
  ('4.06', 'Estacionamento', 'variable_cost'),
  ('4.99', 'Nao classificado', 'variable_cost')
) as seed(code, name, dre_group)
on conflict (tenant_id, code) do nothing;

-- Permissao especifica para reprocessamento administrativo.
insert into public.permissions (module_id, code, name, description, risk_level, active)
select m.id, 'financial.process_integrations', 'Processar integracoes financeiras',
  'Processar e repetir fatos operacionais pendentes.', 'high', true
from public.modules m where m.code = 'financial'
on conflict (code) do update set
  name = excluded.name, description = excluded.description,
  risk_level = excluded.risk_level, active = true, updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select wr.id, p.id
from public.workspace_roles wr
join public.permissions p on p.code = 'financial.process_integrations'
where wr.code in ('OWNER', 'FINANCIAL') and wr.active = true
on conflict do nothing;

create or replace function private.log_financial_integration(
  p_job public.financial_integration_jobs,
  p_action text,
  p_outcome text,
  p_message text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.financial_integration_events (
    tenant_id, workspace_id, job_id, financial_document_id,
    action, outcome, actor_id, message, metadata
  ) values (
    p_job.tenant_id, p_job.workspace_id, p_job.id, p_job.financial_document_id,
    p_action, p_outcome, auth.uid(), left(p_message, 500), coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function private.enqueue_financial_integration(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_source_event text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
begin
  insert into public.financial_integration_jobs (
    tenant_id, workspace_id, source_type, source_id, source_event, metadata
  ) values (
    p_tenant_id, p_workspace_id, p_source_type, p_source_id, p_source_event,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (tenant_id, source_type, source_id, source_event) do update set
    workspace_id = coalesce(excluded.workspace_id, public.financial_integration_jobs.workspace_id),
    metadata = public.financial_integration_jobs.metadata || excluded.metadata,
    status = case when public.financial_integration_jobs.status = 'processed'
      then 'processed' else 'pending' end,
    attempts = case when public.financial_integration_jobs.status = 'processed'
      then public.financial_integration_jobs.attempts else 0 end,
    last_error = case when public.financial_integration_jobs.status = 'processed'
      then public.financial_integration_jobs.last_error else null end,
    next_retry_at = null
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.ensure_station_partner(
  p_tenant_id uuid,
  p_station text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_partner_id uuid;
  v_name text := nullif(btrim(p_station), '');
begin
  if v_name is null then return null; end if;
  select id into v_partner_id from public.business_partners
  where tenant_id = p_tenant_id and lower(trade_name) = lower(v_name)
  order by created_at limit 1;
  if v_partner_id is null then
    insert into public.business_partners (
      tenant_id, trade_name, metadata
    ) values (
      p_tenant_id, v_name, jsonb_build_object('source', 'fuel_station')
    ) returning id into v_partner_id;
  end if;
  insert into public.business_partner_roles (tenant_id, partner_id, role)
  values (p_tenant_id, v_partner_id, 'supplier')
  on conflict (partner_id, role) do update set active = true;
  return v_partner_id;
end;
$$;

create or replace function private.process_financial_integration_job(p_job_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_job public.financial_integration_jobs;
  v_freight public.freights;
  v_fuel public.fuel_records;
  v_expense public.freight_expenses;
  v_workspace_id uuid;
  v_document_id uuid;
  v_partner_id uuid;
  v_chart_id uuid;
  v_cost_center_id uuid;
  v_freight_id uuid;
  v_vehicle_id uuid;
  v_product_id uuid;
  v_amount numeric(18,2);
  v_issue_date date;
  v_due_days integer;
  v_direction text;
  v_document_type text;
  v_description text;
  v_review text[] := '{}'::text[];
  v_final_status text;
  v_category_code text;
  v_error text;
begin
  select * into v_job from public.financial_integration_jobs
  where id = p_job_id for update;
  if not found then raise exception 'FINANCIAL_INTEGRATION_JOB_NOT_FOUND'; end if;
  if v_job.status = 'processed' then return 'processed'; end if;
  if v_job.attempts >= v_job.max_attempts then return v_job.status; end if;

  update public.financial_integration_jobs
  set attempts = attempts + 1, last_attempt_at = now(), last_error = null
  where id = v_job.id returning * into v_job;
  perform private.log_financial_integration(v_job, 'attempt', 'pending');

  begin
    v_workspace_id := coalesce(v_job.workspace_id,
      private.default_workspace_for_tenant(v_job.tenant_id));
    if v_workspace_id is null then
      v_review := array_append(v_review, 'missing_workspace');
    end if;

    if v_job.source_type = 'freight' then
      select * into v_freight from public.freights
      where id = v_job.source_id and tenant_id = v_job.tenant_id;
      if not found then raise exception 'SOURCE_FREIGHT_NOT_FOUND'; end if;
      if v_freight.lifecycle_status <> 'completed' or v_freight.completed_at is null then
        raise exception 'FREIGHT_NOT_COMPLETED';
      end if;
      if v_freight.freight_value is null or v_freight.freight_value <= 0 then
        v_review := array_append(v_review, 'missing_freight_value');
      end if;
      v_amount := v_freight.freight_value;
      v_issue_date := v_freight.completed_at::date;
      v_direction := 'receivable';
      v_document_type := 'freight_revenue';
      v_description := 'Receita de frete ' || v_freight.id::text;
      v_freight_id := v_freight.id;
      v_vehicle_id := v_freight.vehicle_id;
      v_product_id := v_freight.product_id;
      select l.partner_id into v_partner_id
      from public.legacy_partner_links l
      where l.tenant_id = v_job.tenant_id
        and l.legacy_table = 'senders' and l.legacy_id = v_freight.sender_id;
      if v_partner_id is null then v_review := array_append(v_review, 'missing_customer'); end if;
      select id into v_chart_id from public.chart_of_accounts
      where tenant_id = v_job.tenant_id and code = '3.01' and active = true;
      select default_receivable_due_days into v_due_days
      from public.financial_integration_settings
      where workspace_id = v_workspace_id and active = true;

    elsif v_job.source_type = 'fuel_record' then
      select * into v_fuel from public.fuel_records
      where id = v_job.source_id and tenant_id = v_job.tenant_id;
      if not found then raise exception 'SOURCE_FUEL_RECORD_NOT_FOUND'; end if;
      if v_fuel.amount is null or v_fuel.amount <= 0 then
        v_review := array_append(v_review, 'invalid_amount');
      end if;
      v_amount := v_fuel.amount;
      v_issue_date := v_fuel.recorded_at::date;
      v_direction := 'payable';
      v_document_type := 'fuel_expense';
      v_description := case when v_fuel.fuel_type = 'arla'
        then 'Abastecimento de ARLA - ' else 'Abastecimento de Diesel - ' end
        || coalesce(nullif(v_fuel.vehicle_plate, ''), v_fuel.id::text);
      v_vehicle_id := v_fuel.vehicle_id;
      if v_vehicle_id is null then v_review := array_append(v_review, 'missing_vehicle'); end if;
      select freight_id into v_freight_id from public.freight_expenses
      where tenant_id = v_job.tenant_id and fuel_record_id = v_fuel.id
      order by created_at limit 1;
      v_partner_id := private.ensure_station_partner(v_job.tenant_id, v_fuel.station);
      if v_partner_id is null then v_review := array_append(v_review, 'missing_supplier'); end if;
      v_category_code := case v_fuel.fuel_type
        when 'diesel_s10' then '4.01' when 'arla' then '4.02' else '4.99' end;
      if v_fuel.fuel_type not in ('diesel_s10', 'arla') then
        v_review := array_append(v_review, 'unknown_category');
      end if;
      select id into v_chart_id from public.chart_of_accounts
      where tenant_id = v_job.tenant_id and code = v_category_code and active = true;
      select default_payable_due_days into v_due_days
      from public.financial_integration_settings
      where workspace_id = v_workspace_id and active = true;

    elsif v_job.source_type = 'freight_expense' then
      select * into v_expense from public.freight_expenses
      where id = v_job.source_id and tenant_id = v_job.tenant_id;
      if not found then raise exception 'SOURCE_FREIGHT_EXPENSE_NOT_FOUND'; end if;
      if v_expense.fuel_record_id is not null then
        select id into v_document_id from public.financial_documents
        where tenant_id = v_job.tenant_id and source_type = 'fuel_record'
          and source_id = v_expense.fuel_record_id and source_event = 'fuel_expense';
        if v_document_id is null then
          perform private.process_financial_integration_job(
            private.enqueue_financial_integration(
              v_job.tenant_id, v_workspace_id, 'fuel_record',
              v_expense.fuel_record_id, 'fuel_expense',
              jsonb_build_object('linked_expense_id', v_expense.id)
            )
          );
          select id into v_document_id from public.financial_documents
          where tenant_id = v_job.tenant_id and source_type = 'fuel_record'
            and source_id = v_expense.fuel_record_id and source_event = 'fuel_expense';
        end if;
        if v_document_id is null then raise exception 'LINKED_FUEL_DOCUMENT_NOT_READY'; end if;
        update public.financial_allocations
        set freight_id = coalesce(freight_id, v_expense.freight_id),
            vehicle_id = coalesce(vehicle_id, v_expense.vehicle_id)
        where document_id = v_document_id;
        update public.financial_integration_jobs
        set status = 'processed', financial_document_id = v_document_id,
            processed_at = now(), review_reasons = '{}', last_error = null
        where id = v_job.id returning * into v_job;
        perform private.log_financial_integration(
          v_job, 'deduplicated_with_fuel_record', 'processed', null,
          jsonb_build_object('fuel_record_id', v_expense.fuel_record_id)
        );
        return 'processed';
      end if;
      if v_expense.amount is null or v_expense.amount <= 0 then
        v_review := array_append(v_review, 'invalid_amount');
      end if;
      v_amount := v_expense.amount;
      v_issue_date := v_expense.recorded_at::date;
      v_direction := 'payable';
      v_document_type := 'freight_expense';
      v_description := v_expense.description;
      v_freight_id := v_expense.freight_id;
      v_vehicle_id := v_expense.vehicle_id;
      v_review := array_append(v_review, 'missing_supplier');
      v_category_code := case v_expense.category
        when 'diesel_s10' then '4.01'
        when 'arla' then '4.02'
        when 'pedagio' then '4.03'
        when 'manutencao' then '5.01'
        when 'alimentacao' then '4.05'
        when 'estacionamento' then '4.06'
        when 'outros' then '4.99'
        else '4.99' end;
      if v_expense.category not in (
        'diesel_s10', 'arla', 'pedagio', 'manutencao', 'alimentacao', 'estacionamento'
      ) then v_review := array_append(v_review, 'unknown_category'); end if;
      select id into v_chart_id from public.chart_of_accounts
      where tenant_id = v_job.tenant_id and code = v_category_code and active = true;
      select default_payable_due_days into v_due_days
      from public.financial_integration_settings
      where workspace_id = v_workspace_id and active = true;
    else
      raise exception 'UNSUPPORTED_SOURCE_TYPE';
    end if;

    if v_workspace_id is null or v_amount is null or v_amount <= 0 then
      update public.financial_integration_jobs
      set status = 'needs_review', workspace_id = v_workspace_id,
          review_reasons = array(select distinct reason from unnest(v_review) as reason),
          processed_at = null, last_error = null
      where id = v_job.id returning * into v_job;
      perform private.log_financial_integration(v_job, 'review_required', 'needs_review');
      return 'needs_review';
    end if;
    if v_chart_id is null then
      v_review := array_append(v_review, 'missing_chart_account');
      update public.financial_integration_jobs
      set status = 'needs_review', workspace_id = v_workspace_id,
          review_reasons = array(select distinct reason from unnest(v_review) as reason)
      where id = v_job.id returning * into v_job;
      perform private.log_financial_integration(v_job, 'review_required', 'needs_review');
      return 'needs_review';
    end if;

    if v_due_days is null then v_review := array_append(v_review, 'missing_due_policy'); end if;
    select id into v_cost_center_id from public.cost_centers
    where tenant_id = v_job.tenant_id and code = 'OPERACAO' and active = true
      and (workspace_id = v_workspace_id or workspace_id is null)
    order by (workspace_id = v_workspace_id) desc limit 1;

    select id into v_document_id from public.financial_documents
    where tenant_id = v_job.tenant_id and source_type = v_job.source_type
      and source_id = v_job.source_id and source_event = v_job.source_event;

    if v_document_id is null then
      insert into public.financial_documents (
        tenant_id, workspace_id, direction, partner_id, document_type,
        source_type, source_id, source_event, description, original_amount,
        competence_date, issue_date, currency, status, chart_account_id,
        notes
      ) values (
        v_job.tenant_id, v_workspace_id, v_direction, v_partner_id, v_document_type,
        v_job.source_type, v_job.source_id, v_job.source_event, v_description, v_amount,
        v_issue_date, v_issue_date, 'BRL', 'draft', v_chart_id,
        'Gerado automaticamente pela integracao operacional.'
      ) returning id into v_document_id;

      insert into public.financial_allocations (
        tenant_id, workspace_id, document_id, freight_id, vehicle_id,
        business_partner_id, cost_center_id, product_id, chart_account_id,
        amount, percentage, description
      ) values (
        v_job.tenant_id, v_workspace_id, v_document_id, v_freight_id, v_vehicle_id,
        v_partner_id, v_cost_center_id, v_product_id, v_chart_id,
        v_amount, 100, 'Alocacao automatica da operacao'
      );
    end if;

    if v_due_days is not null and not exists (
      select 1 from public.financial_installments where document_id = v_document_id
    ) then
      insert into public.financial_installments (
        tenant_id, workspace_id, document_id, installment_number, amount, due_date
      ) values (
        v_job.tenant_id, v_workspace_id, v_document_id, 1, v_amount,
        v_issue_date + v_due_days
      );
      update public.financial_documents set status = 'posted'
      where id = v_document_id and status = 'draft';
    end if;

    v_final_status := case when cardinality(v_review) > 0
      then 'needs_review' else 'processed' end;
    update public.financial_integration_jobs
    set workspace_id = v_workspace_id, status = v_final_status,
        financial_document_id = v_document_id,
        review_reasons = array(select distinct reason from unnest(v_review) as reason),
        processed_at = case when v_final_status = 'processed' then now() else null end,
        last_error = null, next_retry_at = null
    where id = v_job.id returning * into v_job;

    update public.financial_audit_events
    set metadata = metadata || jsonb_build_object(
      'integration_job_id', v_job.id, 'source_type', v_job.source_type,
      'source_id', v_job.source_id, 'source_event', v_job.source_event
    )
    where financial_document_id = v_document_id;
    perform private.log_financial_integration(
      v_job, 'document_linked', v_final_status, null,
      jsonb_build_object('document_id', v_document_id, 'review_reasons', v_review)
    );
    return v_final_status;
  exception when others then
    get stacked diagnostics v_error = message_text;
    update public.financial_integration_jobs
    set status = 'failed', last_error = left(v_error, 500),
        next_retry_at = case when attempts < max_attempts
          then now() + make_interval(mins => least(60, attempts * 5)) else null end
    where id = v_job.id returning * into v_job;
    perform private.log_financial_integration(v_job, 'processing_failed', 'failed', v_error);
    return 'failed';
  end;
end;
$$;

create or replace function public.save_financial_integration_settings(
  p_workspace_id uuid,
  p_default_receivable_due_days integer,
  p_default_payable_due_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tenant_id uuid;
begin
  perform private.require_financial_permission(
    p_workspace_id,
    'financial.settings.manage'
  );
  if p_default_receivable_due_days is not null
    and p_default_receivable_due_days < 0 then
    raise exception 'FINANCIAL_INVALID_RECEIVABLE_DUE_DAYS';
  end if;
  if p_default_payable_due_days is not null
    and p_default_payable_due_days < 0 then
    raise exception 'FINANCIAL_INVALID_PAYABLE_DUE_DAYS';
  end if;

  select tenant_id into v_tenant_id
  from public.workspaces
  where id = p_workspace_id and status = 'active';
  if v_tenant_id is null then
    raise exception 'FINANCIAL_WORKSPACE_NOT_FOUND';
  end if;

  insert into public.financial_integration_settings (
    tenant_id, workspace_id,
    default_receivable_due_days, default_payable_due_days
  ) values (
    v_tenant_id, p_workspace_id,
    p_default_receivable_due_days, p_default_payable_due_days
  )
  on conflict (workspace_id) do update set
    default_receivable_due_days = excluded.default_receivable_due_days,
    default_payable_due_days = excluded.default_payable_due_days,
    active = true;

  update public.financial_integration_jobs
  set status = 'pending', attempts = 0, next_retry_at = null, last_error = null
  where workspace_id = p_workspace_id
    and status = 'needs_review'
    and review_reasons <@ array['missing_due_policy']::text[];

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'defaultReceivableDueDays', p_default_receivable_due_days,
    'defaultPayableDueDays', p_default_payable_due_days
  );
end;
$$;

create or replace function public.process_financial_integrations(
  p_limit integer default 50,
  p_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
  v_job record;
  v_status text;
  v_processed integer := 0;
  v_failed integer := 0;
  v_review integer := 0;
begin
  select workspace_id into v_workspace_id
  from public.workspace_memberships
  where user_id = auth.uid() and status = 'active'
  order by is_owner desc, joined_at nulls last limit 1;
  if v_workspace_id is null then raise exception 'FINANCIAL_NO_WORKSPACE'; end if;
  perform private.require_financial_permission(v_workspace_id, 'financial.process_integrations');

  for v_job in
    select id from public.financial_integration_jobs
    where workspace_id = v_workspace_id
      and (p_job_id is null or id = p_job_id)
      and (
        (p_job_id is null and status in ('pending', 'failed'))
        or (p_job_id is not null and status in ('pending', 'failed', 'needs_review'))
      )
      and attempts < max_attempts
      and (next_retry_at is null or next_retry_at <= now() or p_job_id is not null)
    order by detected_at
    limit least(greatest(p_limit, 1), 200)
  loop
    v_status := private.process_financial_integration_job(v_job.id);
    if v_status = 'processed' then v_processed := v_processed + 1;
    elsif v_status = 'needs_review' then v_review := v_review + 1;
    elsif v_status = 'failed' then v_failed := v_failed + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'processed', v_processed, 'needsReview', v_review, 'failed', v_failed
  );
end;
$$;

-- Triggers passivos: enfileiram e tentam processar, mas qualquer falha e
-- absorvida. Assim uma indisponibilidade financeira nunca bloqueia a operacao.
create or replace function private.capture_freight_financial_fact()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare v_job_id uuid;
begin
  if new.lifecycle_status = 'completed' and new.completed_at is not null then
    begin
      v_job_id := private.enqueue_financial_integration(
        new.tenant_id, new.workspace_id, 'freight', new.id, 'completion_revenue',
        jsonb_build_object('completed_at', new.completed_at)
      );
      perform private.process_financial_integration_job(v_job_id);
    exception when others then
      raise warning 'financial freight capture failed for %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

create or replace function private.capture_fuel_financial_fact()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare v_job_id uuid;
begin
  begin
    v_job_id := private.enqueue_financial_integration(
      new.tenant_id, private.default_workspace_for_tenant(new.tenant_id),
      'fuel_record', new.id, 'fuel_expense',
      jsonb_build_object('recorded_at', new.recorded_at)
    );
    perform private.process_financial_integration_job(v_job_id);
  exception when others then
    raise warning 'financial fuel capture failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create or replace function private.capture_expense_financial_fact()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare v_job_id uuid;
begin
  begin
    v_job_id := private.enqueue_financial_integration(
      new.tenant_id, private.default_workspace_for_tenant(new.tenant_id),
      'freight_expense', new.id, 'expense_posting',
      jsonb_build_object('recorded_at', new.recorded_at, 'fuel_record_id', new.fuel_record_id)
    );
    perform private.process_financial_integration_job(v_job_id);
  exception when others then
    raise warning 'financial expense capture failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create trigger freights_capture_financial_fact
after insert or update of lifecycle_status, completed_at, freight_value,
  workspace_id, vehicle_id, sender_id, product_id
on public.freights for each row execute function private.capture_freight_financial_fact();

create trigger fuel_records_capture_financial_fact
after insert or update of amount, vehicle_id, station, fuel_type, recorded_at
on public.fuel_records for each row execute function private.capture_fuel_financial_fact();

create trigger freight_expenses_capture_financial_fact
after insert or update of amount, vehicle_id, freight_id, fuel_record_id, category
on public.freight_expenses for each row execute function private.capture_expense_financial_fact();

-- Backfill apenas cria a fila. O processamento e disparado explicitamente
-- depois do dry run para manter a reconciliacao observavel.
insert into public.financial_integration_jobs (
  tenant_id, workspace_id, source_type, source_id, source_event, metadata
)
select f.tenant_id, f.workspace_id, 'freight', f.id, 'completion_revenue',
  jsonb_build_object('backfill', true, 'completed_at', f.completed_at)
from public.freights f
where f.lifecycle_status = 'completed' and f.completed_at is not null
on conflict (tenant_id, source_type, source_id, source_event) do nothing;

insert into public.financial_integration_jobs (
  tenant_id, workspace_id, source_type, source_id, source_event, metadata
)
select fr.tenant_id, private.default_workspace_for_tenant(fr.tenant_id),
  'fuel_record', fr.id, 'fuel_expense', jsonb_build_object('backfill', true)
from public.fuel_records fr
on conflict (tenant_id, source_type, source_id, source_event) do nothing;

insert into public.financial_integration_jobs (
  tenant_id, workspace_id, source_type, source_id, source_event, metadata
)
select fe.tenant_id, private.default_workspace_for_tenant(fe.tenant_id),
  'freight_expense', fe.id, 'expense_posting', jsonb_build_object('backfill', true)
from public.freight_expenses fe
on conflict (tenant_id, source_type, source_id, source_event) do nothing;

revoke all on public.financial_integration_settings,
  public.financial_integration_jobs, public.financial_integration_events
  from public, anon;
revoke insert, update, delete on public.financial_integration_settings,
  public.financial_integration_jobs, public.financial_integration_events
  from authenticated;

revoke all on function public.process_financial_integrations(integer, uuid)
  from public, anon;
grant execute on function public.process_financial_integrations(integer, uuid)
  to authenticated;
revoke all on function public.save_financial_integration_settings(uuid, integer, integer)
  from public, anon;
grant execute on function public.save_financial_integration_settings(uuid, integer, integer)
  to authenticated;

revoke all on function private.log_financial_integration(
  public.financial_integration_jobs, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function private.enqueue_financial_integration(
  uuid, uuid, text, uuid, text, jsonb
) from public, anon, authenticated;
revoke all on function private.ensure_station_partner(uuid, text)
  from public, anon, authenticated;
revoke all on function private.process_financial_integration_job(uuid)
  from public, anon, authenticated;

comment on table public.financial_integration_jobs is
  'Fila idempotente e reprocessavel de fatos operacionais para o Financeiro.';
comment on column public.financial_integration_settings.default_receivable_due_days is
  'Nulo exige revisao; nenhum prazo comercial e inventado.';
