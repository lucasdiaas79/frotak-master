-- FROTAK - Financeiro Fase 5.1.1
-- Corrige auditoria generica da folha para avaliar campos apenas da tabela corrente.

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

  if tg_table_name = 'employee_financial_profiles' then
    v_employee_profile_id := v_row_id;
    if tg_op = 'UPDATE' and old.base_salary is distinct from new.base_salary then
      v_action := 'employee_base_salary_changed';
    end if;
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
    if tg_op = 'UPDATE' and old.status is distinct from new.status then
      v_action := 'payroll_entry_' || new.status;
    elsif tg_op = 'UPDATE' and old.due_date is distinct from new.due_date then
      v_action := 'payroll_due_date_changed';
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
    if tg_op = 'UPDATE' and old.status is distinct from new.status then
      v_action := 'recurring_rule_' || new.status;
    elsif tg_op = 'UPDATE' and old.amount is distinct from new.amount then
      v_action := 'recurring_rule_amount_changed';
    end if;
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

revoke all on function private.audit_payroll_row() from public, anon, authenticated;
