-- Garante que fatos operacionais virem titulos financeiros automaticamente.
-- Fretes concluidos -> A Receber.
-- Abastecimentos e despesas do motorista -> A Pagar.

create or replace function private.ensure_financial_foundation_for_workspace(
  p_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace public.workspaces;
begin
  select * into v_workspace
  from public.workspaces
  where id = p_workspace_id;

  if not found then
    raise exception 'WORKSPACE_NOT_FOUND';
  end if;

  insert into public.chart_of_accounts (
    tenant_id, code, name, account_type, normal_balance, dre_group, is_postable, is_system
  )
  select v_workspace.tenant_id, seed.code, seed.name, seed.account_type, seed.normal_balance,
         seed.dre_group, seed.is_postable, true
  from (values
    ('3', 'Receitas', 'revenue', 'credit', null::text, false),
    ('4', 'Custos variaveis', 'expense', 'debit', null::text, false),
    ('5', 'Despesas operacionais', 'expense', 'debit', null::text, false),
    ('6', 'Depreciacao e amortizacao', 'expense', 'debit', null::text, false),
    ('7', 'Resultado financeiro', 'expense', 'debit', null::text, false),
    ('8', 'Impostos sobre resultado', 'expense', 'debit', null::text, false)
  ) as seed(code, name, account_type, normal_balance, dre_group, is_postable)
  on conflict (tenant_id, code) do nothing;

  insert into public.chart_of_accounts (
    tenant_id, parent_id, code, name, account_type, normal_balance,
    dre_group, is_postable, is_system
  )
  select v_workspace.tenant_id, parent.id, seed.code, seed.name, seed.account_type,
         seed.normal_balance, seed.dre_group, true, true
  from (values
    ('3.01', '3', 'Receitas operacionais de fretes', 'revenue', 'credit', 'gross_revenue'),
    ('3.02', '3', 'Outras receitas', 'revenue', 'credit', 'other_result'),
    ('3.09', '3', 'Impostos e deducoes sobre receita', 'contra_revenue', 'debit', 'revenue_deduction'),
    ('4.01', '4', 'Combustivel', 'expense', 'debit', 'variable_cost'),
    ('4.02', '4', 'ARLA', 'expense', 'debit', 'variable_cost'),
    ('4.03', '4', 'Pedagio', 'expense', 'debit', 'variable_cost'),
    ('4.04', '4', 'Comissoes operacionais', 'expense', 'debit', 'variable_cost'),
    ('4.05', '4', 'Despesas de viagem', 'expense', 'debit', 'variable_cost'),
    ('4.06', '4', 'Estacionamento', 'expense', 'debit', 'variable_cost'),
    ('4.99', '4', 'Nao classificado', 'expense', 'debit', 'variable_cost'),
    ('5.01', '5', 'Manutencao', 'expense', 'debit', 'operating_expense'),
    ('5.02', '5', 'Pneus', 'expense', 'debit', 'operating_expense'),
    ('5.03', '5', 'Salarios operacionais', 'expense', 'debit', 'operating_expense'),
    ('5.04', '5', 'Seguros', 'expense', 'debit', 'operating_expense'),
    ('5.05', '5', 'Despesas administrativas', 'expense', 'debit', 'operating_expense'),
    ('5.06', '5', 'Despesas comerciais', 'expense', 'debit', 'operating_expense'),
    ('6.01', '6', 'Depreciacao', 'expense', 'debit', 'depreciation_amortization'),
    ('7.01', '7', 'Despesas financeiras', 'expense', 'debit', 'financial_result'),
    ('7.02', '7', 'Financiamentos', 'expense', 'debit', 'financial_result'),
    ('8.01', '8', 'Impostos sobre resultado', 'expense', 'debit', 'income_tax'),
    ('8.99', '8', 'Outras receitas e despesas', 'expense', 'debit', 'other_result')
  ) as seed(code, parent_code, name, account_type, normal_balance, dre_group)
  join public.chart_of_accounts parent
    on parent.tenant_id = v_workspace.tenant_id and parent.code = seed.parent_code
  on conflict (tenant_id, code) do nothing;

  insert into public.cost_centers (tenant_id, workspace_id, code, name, is_system)
  values (v_workspace.tenant_id, v_workspace.id, 'EMPRESA', 'Empresa', true)
  on conflict (tenant_id, code) do nothing;

  insert into public.cost_centers (tenant_id, workspace_id, parent_id, code, name, is_system)
  select v_workspace.tenant_id, v_workspace.id, root.id, seed.code, seed.name, true
  from public.cost_centers root
  cross join (values
    ('OPERACAO', 'Operacao'),
    ('ADMINISTRATIVO', 'Administrativo'),
    ('OFICINA', 'Oficina')
  ) as seed(code, name)
  where root.tenant_id = v_workspace.tenant_id
    and root.code = 'EMPRESA'
  on conflict (tenant_id, code) do nothing;

  insert into public.financial_integration_settings (
    tenant_id, workspace_id, default_receivable_due_days, default_payable_due_days
  ) values (
    v_workspace.tenant_id, v_workspace.id, 0, 0
  )
  on conflict (workspace_id) do update set
    default_receivable_due_days = coalesce(
      public.financial_integration_settings.default_receivable_due_days,
      excluded.default_receivable_due_days
    ),
    default_payable_due_days = coalesce(
      public.financial_integration_settings.default_payable_due_days,
      excluded.default_payable_due_days
    ),
    active = true,
    updated_at = now();
end;
$$;

create or replace function private.ensure_financial_foundation_after_workspace()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.ensure_financial_foundation_for_workspace(new.id);
  return new;
end;
$$;

drop trigger if exists workspaces_ensure_financial_foundation on public.workspaces;
create trigger workspaces_ensure_financial_foundation
after insert on public.workspaces
for each row execute function private.ensure_financial_foundation_after_workspace();

create or replace function private.ensure_operational_expense_partner(
  p_tenant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_partner_id uuid;
begin
  select id into v_partner_id
  from public.business_partners
  where tenant_id = p_tenant_id
    and metadata->>'source' = 'driver_operational_expense'
  order by created_at
  limit 1;

  if v_partner_id is null then
    insert into public.business_partners (
      tenant_id, trade_name, requires_review, metadata
    ) values (
      p_tenant_id,
      'Despesas operacionais do motorista',
      false,
      jsonb_build_object('source', 'driver_operational_expense')
    ) returning id into v_partner_id;
  end if;

  insert into public.business_partner_roles (tenant_id, partner_id, role, active)
  values (p_tenant_id, v_partner_id, 'supplier', true)
  on conflict (partner_id, role) do update set active = true;

  return v_partner_id;
end;
$$;

create or replace function private.resolve_operational_freight_billing_partner(
  p_tenant_id uuid,
  p_payment_type text,
  p_sender_id uuid,
  p_recipient_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_legacy_table text;
  v_legacy_id uuid;
  v_partner_id uuid;
  v_sender public.senders;
  v_recipient public.recipients;
begin
  if p_payment_type = 'FOB' then
    v_legacy_table := 'recipients';
    v_legacy_id := p_recipient_id;
  else
    v_legacy_table := 'senders';
    v_legacy_id := p_sender_id;
  end if;

  if v_legacy_id is null then
    return null;
  end if;

  select partner_id into v_partner_id
  from public.legacy_partner_links
  where tenant_id = p_tenant_id
    and legacy_table = v_legacy_table
    and legacy_id = v_legacy_id;

  if v_partner_id is null and v_legacy_table = 'senders' then
    select * into v_sender from public.senders
    where tenant_id = p_tenant_id and id = v_legacy_id;
    if found then
      v_partner_id := private.sync_legacy_partner_row(
        v_sender.tenant_id, 'senders', v_sender.id, v_sender.name, v_sender.cnpj, v_sender.active
      );
    end if;
  elsif v_partner_id is null and v_legacy_table = 'recipients' then
    select * into v_recipient from public.recipients
    where tenant_id = p_tenant_id and id = v_legacy_id;
    if found then
      v_partner_id := private.sync_legacy_partner_row(
        v_recipient.tenant_id, 'recipients', v_recipient.id,
        v_recipient.name, v_recipient.cnpj, v_recipient.active
      );
    end if;
  end if;

  if v_partner_id is not null then
    insert into public.business_partner_roles (tenant_id, partner_id, role, active)
    values (p_tenant_id, v_partner_id, 'customer', true)
    on conflict (partner_id, role) do update set active = true;
  end if;

  return v_partner_id;
end;
$$;

create or replace function private.resolve_financial_due_days(
  p_workspace_id uuid,
  p_partner_id uuid,
  p_direction text,
  p_specific_due_days integer
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_due_days integer;
begin
  if p_specific_due_days is not null then
    if p_specific_due_days < 0 then
      raise exception 'FINANCIAL_INVALID_PAYMENT_TERM_DAYS';
    end if;
    return p_specific_due_days;
  end if;

  if p_partner_id is not null then
    if p_direction = 'receivable' then
      select default_receivable_due_days into v_due_days
      from public.business_partners
      where id = p_partner_id and active = true;
    elsif p_direction = 'payable' then
      select default_payable_due_days into v_due_days
      from public.business_partners
      where id = p_partner_id and active = true;
    end if;
    if v_due_days is not null then return v_due_days; end if;
  end if;

  if p_direction = 'receivable' then
    select default_receivable_due_days into v_due_days
    from public.financial_integration_settings
    where workspace_id = p_workspace_id and active = true;
  elsif p_direction = 'payable' then
    select default_payable_due_days into v_due_days
    from public.financial_integration_settings
    where workspace_id = p_workspace_id and active = true;
  end if;

  return coalesce(v_due_days, 0);
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
  v_payment_type text;
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
    v_workspace_id := coalesce(v_job.workspace_id, private.default_workspace_for_tenant(v_job.tenant_id));
    if v_workspace_id is null then
      v_review := array_append(v_review, 'missing_workspace');
    else
      perform private.ensure_financial_foundation_for_workspace(v_workspace_id);
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
      v_payment_type := coalesce(
        v_freight.freight_payment_type,
        case
          when v_freight.sender_id is not null then 'CIF'
          when v_freight.recipient_id is not null then 'FOB'
          else null
        end
      );
      v_partner_id := coalesce(
        v_freight.billing_partner_id,
        private.resolve_operational_freight_billing_partner(
          v_job.tenant_id,
          v_payment_type,
          v_freight.sender_id,
          v_freight.recipient_id
        )
      );

      if v_partner_id is not null and v_freight.billing_partner_id is null then
        update public.freights
        set freight_payment_type = v_payment_type,
            billing_partner_id = v_partner_id,
            snapshot = coalesce(snapshot, '{}'::jsonb) || jsonb_build_object(
              'freight_payment_type', v_payment_type,
              'billing_partner_id', v_partner_id,
              'billing_partner_backfilled_by', 'financial_operational_auto_posting'
            ),
            updated_at = now()
        where id = v_freight.id and tenant_id = v_job.tenant_id;
      end if;

      if v_partner_id is null then v_review := array_append(v_review, 'missing_customer'); end if;
      select id into v_chart_id from public.chart_of_accounts
      where tenant_id = v_job.tenant_id and code = '3.01' and active = true;
      v_due_days := private.resolve_financial_due_days(
        v_workspace_id, v_partner_id, 'receivable', v_freight.payment_term_days
      );

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
      v_due_days := private.resolve_financial_due_days(v_workspace_id, v_partner_id, 'payable', null);

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
      v_partner_id := private.ensure_operational_expense_partner(v_job.tenant_id);
      if v_partner_id is null then v_review := array_append(v_review, 'missing_supplier'); end if;
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
      v_due_days := private.resolve_financial_due_days(v_workspace_id, v_partner_id, 'payable', null);
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
    if v_direction = 'receivable' and v_partner_id is null then
      update public.financial_integration_jobs
      set status = 'needs_review', workspace_id = v_workspace_id,
          review_reasons = array(select distinct reason from unnest(v_review) as reason),
          processed_at = null, last_error = null
      where id = v_job.id returning * into v_job;
      perform private.log_financial_integration(v_job, 'review_required', 'needs_review');
      return 'needs_review';
    end if;

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
    else
      update public.financial_documents
      set partner_id = coalesce(partner_id, v_partner_id),
          chart_account_id = coalesce(chart_account_id, v_chart_id),
          description = coalesce(nullif(description, ''), v_description),
          competence_date = coalesce(competence_date, v_issue_date),
          issue_date = coalesce(issue_date, v_issue_date)
      where id = v_document_id
        and tenant_id = v_job.tenant_id
        and status = 'draft';

      update public.financial_allocations
      set freight_id = coalesce(freight_id, v_freight_id),
          vehicle_id = coalesce(vehicle_id, v_vehicle_id),
          business_partner_id = coalesce(business_partner_id, v_partner_id),
          cost_center_id = coalesce(cost_center_id, v_cost_center_id),
          product_id = coalesce(product_id, v_product_id),
          chart_account_id = coalesce(chart_account_id, v_chart_id)
      where document_id = v_document_id
        and tenant_id = v_job.tenant_id;
    end if;

    if not exists (
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
      'source_id', v_job.source_id, 'source_event', v_job.source_event,
      'payment_term_days', v_due_days,
      'due_date', v_issue_date + v_due_days
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

do $$
declare
  v_workspace public.workspaces;
  v_job record;
begin
  for v_workspace in select * from public.workspaces loop
    perform private.ensure_financial_foundation_for_workspace(v_workspace.id);
  end loop;

  update public.financial_integration_jobs
  set status = 'pending',
      attempts = 0,
      next_retry_at = null,
      last_error = null
  where source_type in ('freight', 'fuel_record', 'freight_expense')
    and status in ('failed', 'needs_review', 'pending');

  for v_job in
    select id
    from public.financial_integration_jobs
    where source_type in ('freight', 'fuel_record', 'freight_expense')
      and status in ('pending', 'failed', 'needs_review')
    order by detected_at, id
  loop
    perform private.process_financial_integration_job(v_job.id);
  end loop;

  update public.financial_documents fd
  set status = 'posted'
  where fd.status = 'draft'
    and fd.source_type in ('freight', 'fuel_record', 'freight_expense')
    and exists (
      select 1 from public.financial_installments fi
      where fi.document_id = fd.id
    );
end $$;
