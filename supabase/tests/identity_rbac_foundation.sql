begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_other_user_id uuid := gen_random_uuid();
  v_tenant_id uuid;
  v_workspace_id uuid;
  v_other_workspace_id uuid;
  v_membership_id uuid;
  v_other_membership_id uuid;
  v_role_id uuid;
  v_other_role_id uuid;
  v_permission_id uuid;
  v_count integer;
begin
  begin
    insert into public.profiles (id, email)
    values (gen_random_uuid(), 'orphan@example.com');
    raise exception 'Expected orphan profile to be rejected';
  exception
    when foreign_key_violation then null;
  end;

  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values
    (v_user_id, 'authenticated', 'authenticated', 'user@example.com', now(), now(), now()),
    (v_other_user_id, 'authenticated', 'authenticated', 'other@example.com', now(), now(), now());

  if not exists (select 1 from public.profiles where id = v_user_id and email = 'user@example.com') then
    raise exception 'Expected auth trigger to create profile';
  end if;

  begin
    insert into public.platform_users (user_id, platform_role)
    values (gen_random_uuid(), 'support');
    raise exception 'Expected platform user without profile to be rejected';
  exception
    when foreign_key_violation then null;
  end;

  begin
    insert into public.platform_users (user_id, platform_role)
    values (v_user_id, 'invalid');
    raise exception 'Expected invalid platform role to be rejected';
  exception
    when check_violation then null;
  end;

  insert into public.tenants (slug, legal_name, status)
  values ('identity-test-tenant', 'Identity Test Tenant Ltda', 'active')
  returning id into v_tenant_id;

  insert into public.workspaces (tenant_id, name, slug, status)
  values
    (v_tenant_id, 'Workspace A', 'workspace-a', 'active')
  returning id into v_workspace_id;

  insert into public.workspaces (tenant_id, name, slug, status)
  values
    (v_tenant_id, 'Workspace B', 'workspace-b', 'active')
  returning id into v_other_workspace_id;

  insert into public.workspace_memberships (workspace_id, user_id, status, is_owner)
  values (v_workspace_id, v_user_id, 'active', true)
  returning id into v_membership_id;

  begin
    insert into public.workspace_memberships (workspace_id, user_id, status)
    values (v_workspace_id, v_user_id, 'active');
    raise exception 'Expected duplicate workspace membership to be rejected';
  exception
    when unique_violation then null;
  end;

  insert into public.workspace_memberships (workspace_id, user_id, status)
  values (v_other_workspace_id, v_user_id, 'active')
  returning id into v_other_membership_id;

  begin
    insert into public.workspace_memberships (workspace_id, user_id, status, is_owner)
    values (v_workspace_id, v_other_user_id, 'active', true);
    raise exception 'Expected second non-revoked owner to be rejected';
  exception
    when unique_violation then null;
  end;

  insert into public.workspace_memberships (workspace_id, user_id, status, is_owner)
  values (v_workspace_id, v_other_user_id, 'revoked', true);

  begin
    insert into public.workspace_roles (workspace_id, code, name)
    values (v_workspace_id, 'bad-role', 'Cargo Invalido');
    raise exception 'Expected invalid role code to be rejected';
  exception
    when check_violation then null;
  end;

  insert into public.workspace_roles (workspace_id, code, name)
  values (v_workspace_id, 'ADMIN', 'Administrador')
  returning id into v_role_id;

  insert into public.workspace_roles (workspace_id, code, name)
  values (v_other_workspace_id, 'ADMIN', 'Administrador')
  returning id into v_other_role_id;

  begin
    insert into public.workspace_roles (workspace_id, code, name)
    values (v_workspace_id, 'ADMIN', 'Administrador duplicado');
    raise exception 'Expected duplicate role code in same workspace to be rejected';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.permissions (code, name)
    values ('invalid_permission', 'Permissao Invalida');
    raise exception 'Expected invalid permission code to be rejected';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.permissions (code, name, risk_level)
    values ('test.permission.invalid_risk', 'Risco Invalido', 'danger');
    raise exception 'Expected invalid permission risk to be rejected';
  exception
    when check_violation then null;
  end;

  insert into public.permissions (code, name, risk_level)
  values ('test.permission.read', 'Permissao de Teste', 'low')
  returning id into v_permission_id;

  begin
    insert into public.permissions (code, name)
    values ('test.permission.read', 'Permissao Duplicada');
    raise exception 'Expected duplicate permission to be rejected';
  exception
    when unique_violation then null;
  end;

  insert into public.role_permissions (role_id, permission_id)
  values (v_role_id, v_permission_id);

  begin
    insert into public.role_permissions (role_id, permission_id)
    values (v_role_id, v_permission_id);
    raise exception 'Expected duplicate role permission to be rejected';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.membership_roles (membership_id, role_id, workspace_id)
    values (v_membership_id, v_other_role_id, v_workspace_id);
    raise exception 'Expected cross-workspace membership role to be rejected';
  exception
    when foreign_key_violation then null;
  end;

  insert into public.membership_roles (membership_id, role_id, workspace_id)
  values (v_membership_id, v_role_id, v_workspace_id);

  select count(*) into v_count
  from pg_tables
  where schemaname = 'public'
    and tablename in (
      'profiles',
      'platform_users',
      'workspace_memberships',
      'workspace_roles',
      'permissions',
      'role_permissions',
      'membership_roles'
    )
    and rowsecurity = true;

  if v_count <> 7 then
    raise exception 'Expected RLS on all identity tables, found %', v_count;
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name in (
        'profiles',
        'platform_users',
        'workspace_memberships',
        'workspace_roles',
        'permissions',
        'role_permissions',
        'membership_roles'
      )
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) then
    raise exception 'Expected no direct write grants to authenticated';
  end if;

  if not exists (select 1 from public.permissions where code = 'workspace.members.read') then
    raise exception 'Expected seeded permission catalog to include workspace.members.read';
  end if;
end;
$$;

rollback;
