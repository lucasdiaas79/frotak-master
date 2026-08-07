create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create or replace function private.is_active_profile()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.active = true
    );
$$;

create or replace function private.is_platform_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_active_profile()
    and exists (
      select 1
      from public.platform_users
      where platform_users.user_id = auth.uid()
        and platform_users.active = true
    );
$$;

create or replace function private.has_platform_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_active_profile()
    and p_roles <@ array['super_admin', 'operations', 'support', 'read_only']::text[]
    and exists (
      select 1
      from public.platform_users
      where platform_users.user_id = auth.uid()
        and platform_users.active = true
        and platform_users.platform_role = any(p_roles)
    );
$$;

create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_active_profile()
    and exists (
      select 1
      from public.workspace_memberships wm
      join public.workspaces w on w.id = wm.workspace_id
      join public.tenants t on t.id = w.tenant_id
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and w.status = 'active'
        and t.status in ('active', 'trial')
    );
$$;

create or replace function private.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_workspace_member(p_workspace_id)
    and exists (
      select 1
      from public.workspace_memberships
      where workspace_memberships.workspace_id = p_workspace_id
        and workspace_memberships.user_id = auth.uid()
        and workspace_memberships.status = 'active'
        and workspace_memberships.is_owner = true
    );
$$;

create or replace function private.workspace_has_module(
  p_workspace_id uuid,
  p_module_code text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.workspace_modules wm
    join public.workspaces w on w.id = wm.workspace_id
    join public.tenants t on t.id = w.tenant_id
    join public.modules m on m.id = wm.module_id
    where wm.workspace_id = p_workspace_id
      and w.status = 'active'
      and t.status in ('active', 'trial')
      and m.code = p_module_code
      and m.active = true
      and wm.enabled = true
      and wm.starts_at <= now()
      and (wm.expires_at is null or wm.expires_at > now())
  );
$$;

create or replace function private.has_permission(
  p_workspace_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_workspace_member(p_workspace_id)
    and exists (
      select 1
      from public.workspace_memberships wm
      join public.membership_roles mr
        on mr.membership_id = wm.id
       and mr.workspace_id = wm.workspace_id
      join public.workspace_roles wr
        on wr.id = mr.role_id
       and wr.workspace_id = wm.workspace_id
      join public.role_permissions rp on rp.role_id = wr.id
      join public.permissions p on p.id = rp.permission_id
      left join public.modules m on m.id = p.module_id
      where wm.workspace_id = p_workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wr.active = true
        and p.active = true
        and p.code = p_permission_code
        and (
          p.module_id is null
          or private.workspace_has_module(p_workspace_id, m.code)
        )
    );
$$;

revoke all on function private.is_active_profile() from public, anon, authenticated;
revoke all on function private.is_platform_user() from public, anon, authenticated;
revoke all on function private.has_platform_role(text[]) from public, anon, authenticated;
revoke all on function private.is_workspace_member(uuid) from public, anon, authenticated;
revoke all on function private.is_workspace_owner(uuid) from public, anon, authenticated;
revoke all on function private.workspace_has_module(uuid, text) from public, anon, authenticated;
revoke all on function private.has_permission(uuid, text) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_active_profile() to authenticated;
grant execute on function private.is_platform_user() to authenticated;
grant execute on function private.has_platform_role(text[]) to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_owner(uuid) to authenticated;
grant execute on function private.has_permission(uuid, text) to authenticated;
