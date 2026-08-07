begin;

do $$
declare
  v_super_admin_id uuid := gen_random_uuid();
  v_operations_id uuid := gen_random_uuid();
  v_support_id uuid := gen_random_uuid();
  v_read_only_id uuid := gen_random_uuid();
  v_inactive_id uuid := gen_random_uuid();
  v_owner_id uuid := gen_random_uuid();
  v_other_owner_id uuid := gen_random_uuid();
  v_tenant_id uuid;
  v_workspace_id uuid;
  v_membership_id uuid;
  v_owner_role_id uuid;
  v_before_tenants integer;
  v_after_tenants integer;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values
    (v_super_admin_id, 'authenticated', 'authenticated', 'super-admin@test.local', now(), now(), now()),
    (v_operations_id, 'authenticated', 'authenticated', 'operations@test.local', now(), now(), now()),
    (v_support_id, 'authenticated', 'authenticated', 'support@test.local', now(), now(), now()),
    (v_read_only_id, 'authenticated', 'authenticated', 'read-only@test.local', now(), now(), now()),
    (v_inactive_id, 'authenticated', 'authenticated', 'inactive@test.local', now(), now(), now()),
    (v_owner_id, 'authenticated', 'authenticated', 'owner@test.local', now(), now(), now()),
    (v_other_owner_id, 'authenticated', 'authenticated', 'other-owner@test.local', now(), now(), now());

  insert into public.platform_users (user_id, platform_role, active)
  values
    (v_super_admin_id, 'super_admin', true),
    (v_operations_id, 'operations', true),
    (v_support_id, 'support', true),
    (v_read_only_id, 'read_only', true),
    (v_inactive_id, 'operations', false);

  begin
    perform *
    from private.provision_tenant(
      v_owner_id,
      'Owner Test',
      'Blocked Support Ltda',
      null,
      '12345678000191',
      'blocked-support',
      'Blocked Support',
      'blocked-support',
      'BASIC',
      now(),
      now() + interval '1 month',
      'Mensal',
      10,
      array['fleet_core'],
      v_support_id
    );
    raise exception 'Expected support platform role to be rejected';
  exception when others then
    if sqlerrm not like '%not authorized%' then
      raise;
    end if;
  end;

  begin
    perform *
    from private.provision_tenant(
      v_owner_id,
      'Owner Test',
      'Blocked Read Only Ltda',
      null,
      '12345678000191',
      'blocked-read-only',
      'Blocked Read Only',
      'blocked-read-only',
      'BASIC',
      now(),
      now() + interval '1 month',
      'Mensal',
      10,
      array['fleet_core'],
      v_read_only_id
    );
    raise exception 'Expected read_only platform role to be rejected';
  exception when others then
    if sqlerrm not like '%not authorized%' then
      raise;
    end if;
  end;

  begin
    perform *
    from private.provision_tenant(
      v_owner_id,
      'Owner Test',
      'Blocked Inactive Ltda',
      null,
      '12345678000191',
      'blocked-inactive',
      'Blocked Inactive',
      'blocked-inactive',
      'BASIC',
      now(),
      now() + interval '1 month',
      'Mensal',
      10,
      array['fleet_core'],
      v_inactive_id
    );
    raise exception 'Expected inactive platform user to be rejected';
  exception when others then
    if sqlerrm not like '%not authorized%' then
      raise;
    end if;
  end;

  select count(*) into v_before_tenants from public.tenants;
  begin
    perform *
    from private.provision_tenant(
      v_owner_id,
      'Owner Test',
      'Invalid CNPJ Ltda',
      null,
      '123',
      'invalid-cnpj',
      'Invalid CNPJ',
      'invalid-cnpj',
      'BASIC',
      now(),
      now() + interval '1 month',
      'Mensal',
      10,
      array['fleet_core'],
      v_operations_id
    );
    raise exception 'Expected invalid CNPJ to fail';
  exception when others then
    if sqlerrm not like '%cnpj%' then
      raise;
    end if;
  end;
  select count(*) into v_after_tenants from public.tenants;
  if v_after_tenants <> v_before_tenants then
    raise exception 'Expected invalid CNPJ to leave no partial tenant';
  end if;

  begin
    perform *
    from private.provision_tenant(
      v_owner_id,
      'Owner Test',
      'Invalid Plan Ltda',
      null,
      '12345678000191',
      'invalid-plan',
      'Invalid Plan',
      'invalid-plan',
      'DOES_NOT_EXIST',
      now(),
      now() + interval '1 month',
      'Mensal',
      10,
      array['fleet_core'],
      v_operations_id
    );
    raise exception 'Expected missing plan to fail';
  exception when others then
    if sqlerrm not like '%plan%' then
      raise;
    end if;
  end;

  begin
    perform *
    from private.provision_tenant(
      v_owner_id,
      'Owner Test',
      'Invalid Module Ltda',
      null,
      '12345678000191',
      'invalid-module',
      'Invalid Module',
      'invalid-module',
      'BASIC',
      now(),
      now() + interval '1 month',
      'Mensal',
      10,
      array['does_not_exist'],
      v_operations_id
    );
    raise exception 'Expected missing module to fail';
  exception when others then
    if sqlerrm not like '%module%' then
      raise;
    end if;
  end;

  begin
    perform *
    from private.provision_tenant(
      v_owner_id,
      'Owner Test',
      'Invalid Vehicles Ltda',
      null,
      '12345678000191',
      'invalid-vehicles',
      'Invalid Vehicles',
      'invalid-vehicles',
      'BASIC',
      now(),
      now() + interval '1 month',
      'Mensal',
      0,
      array['fleet_core'],
      v_operations_id
    );
    raise exception 'Expected invalid max vehicles to fail';
  exception when others then
    if sqlerrm not like '%max_vehicles%' then
      raise;
    end if;
  end;

  select tenant_id, workspace_id, membership_id, owner_role_id
    into v_tenant_id, v_workspace_id, v_membership_id, v_owner_role_id
  from private.provision_tenant(
    v_owner_id,
    'Owner Test',
    'Provision Success Ltda',
    'Provision Success',
    '12345678000191',
    'provision-success',
    'Provision Success',
    'provision-success',
    'BASIC',
    now(),
    now() + interval '1 month',
    'Mensal',
    25,
    array['financial'],
    v_super_admin_id
  );

  if not exists (select 1 from public.tenants where id = v_tenant_id and status = 'active') then
    raise exception 'Expected tenant to be active';
  end if;

  if not exists (
    select 1 from public.workspaces
    where id = v_workspace_id
      and tenant_id = v_tenant_id
      and is_default = true
  ) then
    raise exception 'Expected default workspace';
  end if;

  if not exists (
    select 1
    from public.tenant_subscriptions
    where tenant_id = v_tenant_id
      and status = 'active'
  ) then
    raise exception 'Expected active subscription';
  end if;

  if not exists (
    select 1
    from public.workspace_modules wm
    join public.modules m on m.id = wm.module_id
    where wm.workspace_id = v_workspace_id
      and m.code = 'fleet_core'
      and wm.enabled = true
      and wm.limits ->> 'max_vehicles' = '25'
  ) then
    raise exception 'Expected fleet_core with max vehicles limit';
  end if;

  if not exists (
    select 1
    from public.workspace_modules wm
    join public.modules m on m.id = wm.module_id
    where wm.workspace_id = v_workspace_id
      and m.code = 'financial'
      and wm.enabled = true
  ) then
    raise exception 'Expected selected financial module';
  end if;

  if exists (
    select 1
    from public.workspace_modules wm
    join public.modules m on m.id = wm.module_id
    where wm.workspace_id = v_workspace_id
      and m.code in ('cte_issuance', 'frotak_ai', 'frotak_tracking')
  ) then
    raise exception 'Expected unselected optional modules to remain disabled';
  end if;

  if (
    select count(*)
    from public.workspace_roles
    where workspace_id = v_workspace_id
      and code in ('OWNER', 'ADMIN', 'MANAGER', 'DISPATCHER', 'FINANCIAL', 'VIEWER')
  ) <> 6 then
    raise exception 'Expected exactly six default roles';
  end if;

  if not exists (
    select 1
    from public.workspace_memberships
    where id = v_membership_id
      and user_id = v_owner_id
      and workspace_id = v_workspace_id
      and status = 'active'
      and is_owner = true
  ) then
    raise exception 'Expected active owner membership';
  end if;

  if (select count(*) from public.workspace_memberships where workspace_id = v_workspace_id and is_owner = true and status <> 'revoked') <> 1 then
    raise exception 'Expected exactly one non-revoked owner';
  end if;

  if not exists (
    select 1
    from public.membership_roles
    where membership_id = v_membership_id
      and role_id = v_owner_role_id
      and workspace_id = v_workspace_id
  ) then
    raise exception 'Expected OWNER role assigned';
  end if;

  if not exists (
    select 1
    from public.role_permissions
    where role_id = v_owner_role_id
  ) then
    raise exception 'Expected OWNER to receive active permissions';
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where tenant_id = v_tenant_id
      and workspace_id = v_workspace_id
      and action = 'tenant.provisioned'
  ) then
    raise exception 'Expected audit log';
  end if;

  select tenant_id
    into v_tenant_id
  from private.provision_tenant(
    v_other_owner_id,
    'Other Owner',
    'Operations Success Ltda',
    null,
    '12345678000192',
    'operations-success',
    'Operations Success',
    'operations-success',
    'BASIC',
    now(),
    now() + interval '1 month',
    'Mensal',
    10,
    array['fleet_core'],
    v_operations_id
  );

  if v_tenant_id is null then
    raise exception 'Expected operations role to provision tenant';
  end if;
end $$;

rollback;
