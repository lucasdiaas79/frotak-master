grant select on table public.profiles to authenticated;
grant select on table public.platform_users to authenticated;
grant select on table public.workspace_memberships to authenticated;
grant select on table public.workspace_roles to authenticated;
grant select on table public.permissions to authenticated;
grant select on table public.role_permissions to authenticated;
grant select on table public.membership_roles to authenticated;

grant select on table public.tenants to authenticated;
grant select on table public.workspaces to authenticated;
grant select on table public.modules to authenticated;
grant select on table public.workspace_modules to authenticated;
grant select on table public.plans to authenticated;
grant select on table public.plan_modules to authenticated;
grant select on table public.tenant_subscriptions to authenticated;

create policy profiles_read_self_or_platform
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or private.is_platform_user()
);

create policy platform_users_read_self_or_platform
on public.platform_users
for select
to authenticated
using (
  user_id = auth.uid()
  or private.is_platform_user()
);

create policy workspace_memberships_read_self_or_platform
on public.workspace_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or private.is_platform_user()
);

create policy workspace_roles_read_workspace_member_or_platform
on public.workspace_roles
for select
to authenticated
using (
  private.is_platform_user()
  or private.is_workspace_member(workspace_id)
);

create policy permissions_read_active_or_platform
on public.permissions
for select
to authenticated
using (
  private.is_platform_user()
  or (private.is_active_profile() and active = true)
);

create policy role_permissions_read_workspace_member_or_platform
on public.role_permissions
for select
to authenticated
using (
  private.is_platform_user()
  or exists (
    select 1
    from public.workspace_roles
    where workspace_roles.id = role_permissions.role_id
      and private.is_workspace_member(workspace_roles.workspace_id)
  )
);

create policy membership_roles_read_own_or_platform
on public.membership_roles
for select
to authenticated
using (
  private.is_platform_user()
  or exists (
    select 1
    from public.workspace_memberships
    where workspace_memberships.id = membership_roles.membership_id
      and workspace_memberships.user_id = auth.uid()
  )
);

create policy tenants_read_workspace_member_or_platform
on public.tenants
for select
to authenticated
using (
  private.is_platform_user()
  or exists (
    select 1
    from public.workspaces
    where workspaces.tenant_id = tenants.id
      and private.is_workspace_member(workspaces.id)
  )
);

create policy workspaces_read_member_or_platform
on public.workspaces
for select
to authenticated
using (
  private.is_platform_user()
  or private.is_workspace_member(id)
);

create policy modules_read_active_or_platform
on public.modules
for select
to authenticated
using (
  private.is_platform_user()
  or (private.is_active_profile() and active = true)
);

create policy workspace_modules_read_workspace_member_or_platform
on public.workspace_modules
for select
to authenticated
using (
  private.is_platform_user()
  or private.is_workspace_member(workspace_id)
);

create policy plans_read_platform
on public.plans
for select
to authenticated
using (private.is_platform_user());

create policy plan_modules_read_platform
on public.plan_modules
for select
to authenticated
using (private.is_platform_user());

create policy tenant_subscriptions_read_platform
on public.tenant_subscriptions
for select
to authenticated
using (private.is_platform_user());
