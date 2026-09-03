-- Frotak Financeiro - Fase 3.6: condicoes de pagamento e vencimentos automaticos.

alter table public.business_partners
  add column if not exists default_receivable_due_days integer,
  add column if not exists default_payable_due_days integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_partners_receivable_due_days_chk'
  ) then
    alter table public.business_partners
      add constraint business_partners_receivable_due_days_chk
      check (default_receivable_due_days is null or default_receivable_due_days >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_partners_payable_due_days_chk'
  ) then
    alter table public.business_partners
      add constraint business_partners_payable_due_days_chk
      check (default_payable_due_days is null or default_payable_due_days >= 0);
  end if;
end $$;

alter table public.freights
  add column if not exists payment_term_days integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'freights_payment_term_days_chk'
  ) then
    alter table public.freights
      add constraint freights_payment_term_days_chk
      check (payment_term_days is null or payment_term_days >= 0);
  end if;
end $$;

create or replace function private.audit_payment_term_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
begin
  if tg_table_name = 'freights' then
    if tg_op = 'UPDATE'
       and old.payment_term_days is not distinct from new.payment_term_days then
      return new;
    end if;
    v_workspace_id := new.workspace_id;
  elsif tg_table_name = 'business_partners' then
    if tg_op = 'UPDATE'
       and old.default_receivable_due_days is not distinct from new.default_receivable_due_days
       and old.default_payable_due_days is not distinct from new.default_payable_due_days then
      return new;
    end if;
    v_workspace_id := private.default_workspace_for_tenant(new.tenant_id);
  elsif tg_table_name = 'financial_integration_settings' then
    if tg_op = 'UPDATE'
       and old.default_receivable_due_days is not distinct from new.default_receivable_due_days
       and old.default_payable_due_days is not distinct from new.default_payable_due_days then
      return new;
    end if;
    v_workspace_id := new.workspace_id;
  end if;

  insert into public.audit_logs (
    actor_user_id, tenant_id, workspace_id, action, entity_type, entity_id,
    old_data, new_data, metadata
  ) values (
    auth.uid(),
    new.tenant_id,
    v_workspace_id,
    'financial.payment_terms.changed',
    tg_table_name,
    new.id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    jsonb_build_object('source', 'financial_phase_3_6')
  );
  return new;
end;
$$;

drop trigger if exists freights_audit_payment_term_change on public.freights;
create trigger freights_audit_payment_term_change
after insert or update of payment_term_days on public.freights
for each row execute function private.audit_payment_term_change();

drop trigger if exists business_partners_audit_payment_terms_change on public.business_partners;
create trigger business_partners_audit_payment_terms_change
after insert or update of default_receivable_due_days, default_payable_due_days
on public.business_partners
for each row execute function private.audit_payment_term_change();

drop trigger if exists financial_settings_audit_payment_terms_change
on public.financial_integration_settings;
create trigger financial_settings_audit_payment_terms_change
after insert or update of default_receivable_due_days, default_payable_due_days
on public.financial_integration_settings
for each row execute function private.audit_payment_term_change();

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

  return v_due_days;
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
    v_workspace_id := coalesce(v_job.workspace_id, private.default_workspace_for_tenant(v_job.tenant_id));
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
      v_partner_id := v_freight.billing_partner_id;
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
      v_partner_id := null;
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

    if v_due_days is null then v_review := array_append(v_review, 'payment_terms_missing'); end if;
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
      'source_id', v_job.source_id, 'source_event', v_job.source_event,
      'payment_term_days', v_due_days,
      'due_date', case when v_due_days is null then null else v_issue_date + v_due_days end
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
  perform private.require_financial_permission(p_workspace_id, 'financial.settings.manage');
  if p_default_receivable_due_days is not null
    and p_default_receivable_due_days < 0 then
    raise exception 'FINANCIAL_INVALID_RECEIVABLE_DUE_DAYS';
  end if;
  if p_default_payable_due_days is not null
    and p_default_payable_due_days < 0 then
    raise exception 'FINANCIAL_INVALID_PAYABLE_DUE_DAYS';
  end if;
  select tenant_id into v_tenant_id from public.workspaces
  where id = p_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'FINANCIAL_WORKSPACE_NOT_FOUND'; end if;

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
    and review_reasons <@ array['missing_due_policy', 'payment_terms_missing']::text[];

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'defaultReceivableDueDays', p_default_receivable_due_days,
    'defaultPayableDueDays', p_default_payable_due_days
  );
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
  v_receivable_days integer := nullif(p_payload->>'defaultReceivableDueDays', '')::integer;
  v_payable_days integer := nullif(p_payload->>'defaultPayableDueDays', '')::integer;
begin
  perform private.require_financial_permission(v_workspace_id, 'financial.create');
  select tenant_id into v_tenant_id from public.workspaces where id = v_workspace_id;
  if v_role not in ('customer', 'supplier') then raise exception 'FINANCIAL_INVALID_PARTNER_ROLE'; end if;
  if v_receivable_days is not null and v_receivable_days < 0 then
    raise exception 'FINANCIAL_INVALID_RECEIVABLE_DUE_DAYS';
  end if;
  if v_payable_days is not null and v_payable_days < 0 then
    raise exception 'FINANCIAL_INVALID_PAYABLE_DUE_DAYS';
  end if;
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
      tenant_id, legal_name, trade_name, tax_id, tax_id_type, active,
      default_receivable_due_days, default_payable_due_days
    ) values (
      v_tenant_id, nullif(p_payload->>'legalName', ''), p_payload->>'tradeName',
      v_tax_digits, case length(v_tax_digits) when 11 then 'cpf' when 14 then 'cnpj' end, true,
      v_receivable_days, v_payable_days
    ) returning id into v_id;
  else
    update public.business_partners set
      legal_name = nullif(p_payload->>'legalName', ''),
      trade_name = p_payload->>'tradeName',
      default_receivable_due_days = v_receivable_days,
      default_payable_due_days = v_payable_days,
      active = true
    where id = v_id and tenant_id = v_tenant_id;
  end if;
  insert into public.business_partner_roles (tenant_id, partner_id, role)
  values (v_tenant_id, v_id, v_role)
  on conflict (partner_id, role) do update set active = true;

  update public.financial_integration_jobs
  set status = 'pending', attempts = 0, next_retry_at = null, last_error = null
  where tenant_id = v_tenant_id
    and status = 'needs_review'
    and review_reasons <@ array['missing_due_policy', 'payment_terms_missing']::text[];

  return v_id;
end;
$$;

create or replace function public.link_vehicle_operation(
  p_vehicle_id uuid,
  p_driver_id uuid,
  p_trailer_id uuid,
  p_trailer_ids uuid[],
  p_sender_id uuid,
  p_recipient_id uuid,
  p_product_id uuid,
  p_freight_value numeric,
  p_freight_payment_type text,
  p_payment_term_days integer default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_vehicle public.vehicles;
  v_billing_partner_id uuid;
begin
  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and private.can_access_tenant(tenant_id);
  if not found then raise exception 'vehicle not found or not accessible'; end if;

  if p_sender_id is null or p_recipient_id is null then
    raise exception 'FREIGHT_ORIGIN_AND_DESTINATION_REQUIRED';
  end if;
  if p_payment_term_days is not null and p_payment_term_days < 0 then
    raise exception 'FINANCIAL_INVALID_PAYMENT_TERM_DAYS';
  end if;

  v_billing_partner_id := private.resolve_freight_billing_partner(
    v_vehicle.tenant_id,
    upper(nullif(btrim(p_freight_payment_type), '')),
    p_sender_id,
    p_recipient_id
  );

  v_vehicle := private.link_vehicle_operation_legacy_core(
    p_vehicle_id, p_driver_id, p_trailer_id, p_trailer_ids,
    p_sender_id, p_recipient_id, p_product_id, p_freight_value
  );

  update public.freights
  set freight_payment_type = upper(p_freight_payment_type),
      billing_partner_id = v_billing_partner_id,
      payment_term_days = p_payment_term_days,
      snapshot = snapshot || jsonb_build_object(
        'freight_payment_type', upper(p_freight_payment_type),
        'billing_partner_id', v_billing_partner_id,
        'payment_term_days', p_payment_term_days
      ),
      updated_at = now()
  where id = v_vehicle.current_freight_id
    and tenant_id = v_vehicle.tenant_id;

  if not found then raise exception 'CANONICAL_FREIGHT_NOT_CREATED'; end if;
  return v_vehicle;
end;
$$;

revoke all on function private.resolve_financial_due_days(uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function private.audit_payment_term_change()
  from public, anon, authenticated;
revoke all on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text, integer
) from public, anon;
grant execute on function public.link_vehicle_operation(
  uuid, uuid, uuid, uuid[], uuid, uuid, uuid, numeric, text, integer
) to authenticated;

comment on column public.business_partners.default_receivable_due_days is
  'Prazo padrao de recebimento do parceiro. Nulo usa fallback do tenant/workspace.';
comment on column public.business_partners.default_payable_due_days is
  'Prazo padrao de pagamento ao parceiro. Nulo usa fallback do tenant/workspace.';
comment on column public.freights.payment_term_days is
  'Prazo especifico do frete em dias. Nulo usa parceiro, depois tenant/workspace.';
