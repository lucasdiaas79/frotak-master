begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_other_user_id uuid := gen_random_uuid();
  v_platform_id uuid := gen_random_uuid();
  v_tenant_id uuid;
  v_workspace_id uuid;
  v_other_workspace_id uuid;
  v_membership_id uuid;
  v_role_id uuid;
  v_other_role_id uuid;
  v_admin_permission_id uuid;
  v_fleet_permission_id uuid;
  v_fleet_module_id uuid;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values
    (v_user_id, 'authenticated', 'authenticated', 'member@example.com', now(), now(), now()),
    (v_other_user_id, 'authenticated', 'authenticated', 'other-member@example.com', now(), now(), now()),
    (v_platform_id, 'authenticated', 'authenticated', 'platform@example.com', now(), now(), now());

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  update public.profiles set active = false where id = v_user_id;
  if private.is_active_profile() then
    raise exception 'Expected inactive profile to fail is_active_profile';
  end if;

  update public.profiles set active = true where id = v_user_id;

  perform set_config('request.jwt.claim.sub', v_platform_id::text, true);
  insert into public.platform_users (user_id, platform_role, active)
  values (v_platform_id, 'support', true);
  if not private.is_platform_user() then
    raise exception 'Expected active platform user to pass';
  end if;

  update public.platform_users set active = false where user_id = v_platform_id;
  if private.is_platform_user() then
    raise exception 'Expected inactive platform user to fail';
  end if;
  update public.platform_users set active = true where user_id = v_platform_id;

  insert into public.tenants (slug, legal_name, status)
  values ('authorization-test-tenant', 'Authorization Test Tenant Ltda', 'active')
  returning id into v_tenant_id;

  insert into public.workspaces (tenant_id, name, slug, status)
  values (v_tenant_id, 'Authorization Workspace', 'authorization-workspace', 'active')
  returning id into v_workspace_id;

  insert into public.workspaces (tenant_id, name, slug, status)
  values (v_tenant_id, 'Other Authorization Workspace', 'other-authorization-workspace', 'active')
  returning id into v_other_workspace_id;

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  insert into public.workspace_memberships (workspace_id, user_id, status)
  values (v_workspace_id, v_user_id, 'invited')
  returning id into v_membership_id;

  if private.is_workspace_member(v_workspace_id) then
    raise exception 'Expected invited membership to fail';
  end if;

  update public.workspace_memberships set status = 'active' where id = v_membership_id;
  if not private.is_workspace_member(v_workspace_id) then
    raise exception 'Expected active membership to pass';
  end if;

  update public.workspace_memberships set status = 'suspended' where id = v_membership_id;
  if private.is_workspace_member(v_workspace_id) then
    raise exception 'Expected suspended membership to fail';
  end if;
  update public.workspace_memberships set status = 'active' where id = v_membership_id;

  update public.tenants set status = 'suspended' where id = v_tenant_id;
  if private.is_workspace_member(v_workspace_id) then
    raise exception 'Expected suspended tenant to block membership';
  end if;
  update public.tenants set status = 'active' where id = v_tenant_id;

  update public.workspaces set status = 'suspended' where id = v_workspace_id;
  if private.is_workspace_member(v_workspace_id) then
    raise exception 'Expected suspended workspace to block membership';
  end if;
  update public.workspaces set status = 'active' where id = v_workspace_id;

  select id into v_fleet_module_id from public.modules where code = 'fleet_core';

  insert into public.workspace_modules (workspace_id, module_id, enabled)
  values (v_workspace_id, v_fleet_module_id, false);

  if private.workspace_has_module(v_workspace_id, 'fleet_core') then
    raise exception 'Expected disabled module to fail';
  end if;

  update public.workspace_modules
  set enabled = true, starts_at = now() - interval '1 day', expires_at = null
  where workspace_id = v_workspace_id and module_id = v_fleet_module_id;

  if not private.workspace_has_module(v_workspace_id, 'fleet_core') then
    raise exception 'Expected enabled module to pass';
  end if;

  update public.workspace_modules
  set expires_at = now() - interval '1 second'
  where workspace_id = v_workspace_id and module_id = v_fleet_module_id;

  if private.workspace_has_module(v_workspace_id, 'fleet_core') then
    raise exception 'Expected expired module to fail';
  end if;

  update public.workspace_modules
  set expires_at = null
  where workspace_id = v_workspace_id and module_id = v_fleet_module_id;

  select id into v_admin_permission_id from public.permissions where code = 'workspace.members.read';
  select id into v_fleet_permission_id from public.permissions where code = 'fleet.vehicles.read';

  insert into public.workspace_roles (workspace_id, code, name, active)
  values (v_workspace_id, 'ADMIN', 'Administrador', true)
  returning id into v_role_id;

  insert into public.workspace_roles (workspace_id, code, name, active)
  values (v_other_workspace_id, 'ADMIN', 'Administrador', true)
  returning id into v_other_role_id;

  insert into public.role_permissions (role_id, permission_id)
  values (v_role_id, v_admin_permission_id), (v_role_id, v_fleet_permission_id);

  insert into public.role_permissions (role_id, permission_id)
  values (v_other_role_id, v_admin_permission_id);

  if private.has_permission(v_workspace_id, 'workspace.members.read') then
    raise exception 'Expected user without role to have no permission';
  end if;

  insert into public.membership_roles (membership_id, role_id, workspace_id)
  values (v_membership_id, v_role_id, v_workspace_id);

  if not private.has_permission(v_workspace_id, 'workspace.members.read') then
    raise exception 'Expected permission without module to pass';
  end if;

  update public.workspace_modules set enabled = false
  where workspace_id = v_workspace_id and module_id = v_fleet_module_id;

  if private.has_permission(v_workspace_id, 'fleet.vehicles.read') then
    raise exception 'Expected module permission to fail when module is disabled';
  end if;

  update public.workspace_modules set enabled = true, expires_at = null
  where workspace_id = v_workspace_id and module_id = v_fleet_module_id;

  if not private.has_permission(v_workspace_id, 'fleet.vehicles.read') then
    raise exception 'Expected module permission to pass when module is enabled';
  end if;

  if private.has_permission(v_other_workspace_id, 'workspace.members.read') then
    raise exception 'Expected role from another workspace to never grant permission';
  end if;
end;
$$;

rollback;
