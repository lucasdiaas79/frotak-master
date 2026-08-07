begin;

do $$
declare
  v_plan_id uuid;
  v_other_plan_id uuid;
  v_module_id uuid;
  v_other_module_id uuid;
  v_tenant_id uuid;
  v_workspace_id uuid;
  v_other_workspace_id uuid;
  v_count integer;
begin
  select count(*) into v_count from public.plans;
  if v_count <> 1 then
    raise exception 'Expected seed to contain exactly 1 plan, found %', v_count;
  end if;

  select count(*) into v_count from public.modules;
  if v_count <> 5 then
    raise exception 'Expected seed to contain exactly 5 modules, found %', v_count;
  end if;

  select count(*) into v_count from public.plan_modules;
  if v_count <> 1 then
    raise exception 'Expected seed to contain exactly 1 plan-module association, found %', v_count;
  end if;

  select count(*) into v_count
  from public.plan_modules
  join public.plans on plans.id = plan_modules.plan_id
  join public.modules on modules.id = plan_modules.module_id
  where plans.code = 'BASIC'
    and modules.code = 'fleet_core';

  if v_count <> 1 then
    raise exception 'Expected BASIC plan to be associated only with fleet_core';
  end if;

  insert into public.plans (code, name, description)
  values ('TEST_PLAN', 'Plano de Teste', 'Plano criado somente para testes transacionais')
  returning id into v_plan_id;

  begin
    insert into public.plans (code, name)
    values ('basic_test', 'Plano Invalido');
    raise exception 'Expected lowercase plan code to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.plans (code, name)
    values ('BASIC-PLAN', 'Plano Invalido');
    raise exception 'Expected hyphenated plan code to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.plans (code, name)
    values ('PLANO BASICO', 'Plano Invalido');
    raise exception 'Expected plan code with space to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.plans (code, name)
    values ('EMPTY_NAME', '   ');
    raise exception 'Expected blank plan name to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.plans (code, name, metadata)
    values ('BAD_METADATA', 'Metadata Invalido', '[]'::jsonb);
    raise exception 'Expected non-object plan metadata to be rejected';
  exception
    when check_violation then null;
  end;

  insert into public.modules (code, name, description)
  values ('test_module', 'Modulo de Teste', 'Modulo criado somente para testes transacionais')
  returning id into v_module_id;

  begin
    insert into public.modules (code, name)
    values ('Test_Module', 'Modulo Invalido');
    raise exception 'Expected uppercase module code to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.modules (code, name)
    values ('test-module', 'Modulo Invalido');
    raise exception 'Expected hyphenated module code to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.modules (code, name)
    values ('empty_module_name', '   ');
    raise exception 'Expected blank module name to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.modules (code, name, metadata)
    values ('bad_module_metadata', 'Metadata Invalido', '[]'::jsonb);
    raise exception 'Expected non-object module metadata to be rejected';
  exception
    when check_violation then null;
  end;

  insert into public.plan_modules (plan_id, module_id)
  values (v_plan_id, v_module_id);

  begin
    insert into public.plan_modules (plan_id, module_id)
    values (v_plan_id, v_module_id);
    raise exception 'Expected duplicate plan-module association to be rejected';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.plan_modules (plan_id, module_id, default_limits)
    values (v_plan_id, (select id from public.modules where code = 'financial'), '[]'::jsonb);
    raise exception 'Expected non-object plan module default_limits to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.plan_modules (plan_id, module_id, default_configuration)
    values (v_plan_id, (select id from public.modules where code = 'frotak_ai'), '[]'::jsonb);
    raise exception 'Expected non-object plan module default_configuration to be rejected';
  exception
    when check_violation then null;
  end;

  insert into public.tenants (slug, legal_name, status)
  values ('tenant-comercial-teste', 'Tenant Comercial Teste Ltda', 'active')
  returning id into v_tenant_id;

  insert into public.workspaces (tenant_id, name, slug, is_default)
  values (v_tenant_id, 'Operacao Principal', 'operacao-principal', true)
  returning id into v_workspace_id;

  insert into public.workspaces (tenant_id, name, slug)
  values (v_tenant_id, 'Filial Teste', 'filial-teste')
  returning id into v_other_workspace_id;

  insert into public.tenant_subscriptions (tenant_id, plan_id, status)
  values (v_tenant_id, v_plan_id, 'active');

  begin
    insert into public.tenant_subscriptions (tenant_id, plan_id, status)
    values (v_tenant_id, v_plan_id, 'blocked');
    raise exception 'Expected invalid subscription status to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.tenant_subscriptions (tenant_id, plan_id, status, starts_at, ends_at)
    values (v_tenant_id, v_plan_id, 'cancelled', now(), now() - interval '1 day');
    raise exception 'Expected ends_at before starts_at to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.tenant_subscriptions (tenant_id, plan_id, status, starts_at, trial_ends_at)
    values (v_tenant_id, v_plan_id, 'cancelled', now(), now() - interval '1 day');
    raise exception 'Expected trial_ends_at before starts_at to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.tenant_subscriptions (tenant_id, plan_id, status)
    values (v_tenant_id, v_plan_id, 'trial');
    raise exception 'Expected second current subscription to be rejected';
  exception
    when unique_violation then null;
  end;

  insert into public.plans (code, name)
  values ('HISTORY_PLAN', 'Plano Historico')
  returning id into v_other_plan_id;

  insert into public.tenant_subscriptions (tenant_id, plan_id, status)
  values
    (v_tenant_id, v_other_plan_id, 'cancelled'),
    (v_tenant_id, v_other_plan_id, 'expired');

  begin
    insert into public.tenant_subscriptions (tenant_id, plan_id, status, billing_metadata)
    values (v_tenant_id, v_other_plan_id, 'cancelled', '[]'::jsonb);
    raise exception 'Expected non-object billing_metadata to be rejected';
  exception
    when check_violation then null;
  end;

  insert into public.modules (code, name)
  values ('other_test_module', 'Outro Modulo de Teste')
  returning id into v_other_module_id;

  insert into public.workspace_modules (workspace_id, module_id, enabled)
  values (v_workspace_id, v_module_id, true);

  begin
    insert into public.workspace_modules (workspace_id, module_id, enabled)
    values (v_workspace_id, v_module_id, true);
    raise exception 'Expected duplicate workspace module to be rejected';
  exception
    when unique_violation then null;
  end;

  insert into public.workspace_modules (workspace_id, module_id, enabled)
  values (v_other_workspace_id, v_module_id, true);

  begin
    insert into public.workspace_modules (workspace_id, module_id, starts_at, expires_at)
    values (v_workspace_id, v_other_module_id, now(), now() - interval '1 day');
    raise exception 'Expected expires_at before starts_at to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.workspace_modules (workspace_id, module_id, source)
    values (v_workspace_id, v_other_module_id, 'invalid');
    raise exception 'Expected invalid workspace module source to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.workspace_modules (workspace_id, module_id, limits)
    values (v_workspace_id, v_other_module_id, '[]'::jsonb);
    raise exception 'Expected non-object workspace module limits to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.workspace_modules (workspace_id, module_id, configuration)
    values (v_workspace_id, v_other_module_id, '[]'::jsonb);
    raise exception 'Expected non-object workspace module configuration to be rejected';
  exception
    when check_violation then null;
  end;
end;
$$;

rollback;
