-- Frotak Financeiro - Fase 2: edicao segura de estruturas nao sistemicas.

create or replace function public.save_chart_account(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_tenant_id uuid;
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_system boolean;
begin
  perform private.require_financial_permission(v_workspace_id, 'financial.manage_chart');
  select tenant_id into v_tenant_id from public.workspaces where id = v_workspace_id;
  if v_tenant_id is null then raise exception 'FINANCIAL_INVALID_WORKSPACE'; end if;

  if v_id is null then
    insert into public.chart_of_accounts (
      tenant_id, parent_id, code, name, account_type, normal_balance, dre_group, active
    ) values (
      v_tenant_id, nullif(p_payload->>'parentId', '')::uuid,
      p_payload->>'code', p_payload->>'name', p_payload->>'accountType',
      p_payload->>'normalBalance', nullif(p_payload->>'dreGroup', ''),
      coalesce((p_payload->>'active')::boolean, true)
    ) returning id into v_id;
  else
    select is_system into v_system
    from public.chart_of_accounts
    where id = v_id and tenant_id = v_tenant_id;
    if v_system is null then raise exception 'FINANCIAL_CHART_ACCOUNT_NOT_FOUND'; end if;
    if v_system then raise exception 'FINANCIAL_SYSTEM_ACCOUNT_IMMUTABLE'; end if;

    update public.chart_of_accounts set
      parent_id = nullif(p_payload->>'parentId', '')::uuid,
      code = p_payload->>'code',
      name = p_payload->>'name',
      account_type = p_payload->>'accountType',
      normal_balance = p_payload->>'normalBalance',
      dre_group = nullif(p_payload->>'dreGroup', ''),
      active = coalesce((p_payload->>'active')::boolean, active)
    where id = v_id and tenant_id = v_tenant_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.save_cost_center(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_tenant_id uuid;
  v_workspace_id uuid := (p_payload->>'workspaceId')::uuid;
  v_system boolean;
begin
  perform private.require_financial_permission(v_workspace_id, 'financial.manage_cost_centers');
  select tenant_id into v_tenant_id from public.workspaces where id = v_workspace_id;
  if v_tenant_id is null then raise exception 'FINANCIAL_INVALID_WORKSPACE'; end if;

  if v_id is null then
    insert into public.cost_centers (tenant_id, workspace_id, parent_id, code, name, active)
    values (
      v_tenant_id, v_workspace_id, nullif(p_payload->>'parentId', '')::uuid,
      p_payload->>'code', p_payload->>'name', coalesce((p_payload->>'active')::boolean, true)
    ) returning id into v_id;
  else
    select is_system into v_system
    from public.cost_centers
    where id = v_id and tenant_id = v_tenant_id and workspace_id = v_workspace_id;
    if v_system is null then raise exception 'FINANCIAL_COST_CENTER_NOT_FOUND'; end if;
    if v_system then raise exception 'FINANCIAL_SYSTEM_COST_CENTER_IMMUTABLE'; end if;

    update public.cost_centers set
      parent_id = nullif(p_payload->>'parentId', '')::uuid,
      code = p_payload->>'code',
      name = p_payload->>'name',
      active = coalesce((p_payload->>'active')::boolean, active)
    where id = v_id and tenant_id = v_tenant_id and workspace_id = v_workspace_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_chart_account(jsonb) from public, anon;
revoke all on function public.save_cost_center(jsonb) from public, anon;
grant execute on function public.save_chart_account(jsonb) to authenticated;
grant execute on function public.save_cost_center(jsonb) to authenticated;
