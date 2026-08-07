create table public.profiles (
  id uuid primary key
    references auth.users(id)
    on delete cascade,
  full_name text,
  email text,
  phone text,
  active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_not_blank_chk
    check (full_name is null or btrim(full_name) <> ''),
  constraint profiles_email_normalized_chk
    check (email is null or (email = lower(btrim(email)) and btrim(email) <> ''))
);

comment on table public.profiles is
  'Public profile extension for auth.users. Authentication remains owned by Supabase Auth.';
comment on column public.profiles.id is
  'Same UUID as auth.users.id. The profile is deleted only when the corresponding Auth user is deleted.';
comment on column public.profiles.full_name is
  'Display name copied from Auth metadata only for presentation, never for authorization.';
comment on column public.profiles.email is
  'Lowercase email copy for display and search. Auth remains the source of identity uniqueness.';
comment on column public.profiles.must_change_password is
  'Boolean flag indicating whether the user should change credentials. No credential value is stored here.';

create index profiles_active_idx on public.profiles (active);
create index profiles_email_idx on public.profiles (email);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    case
      when new.email is null or btrim(new.email) = '' then null
      else lower(btrim(new.email))
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.handle_new_auth_user() from anon;
revoke all on function public.handle_new_auth_user() from authenticated;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

create table public.platform_users (
  user_id uuid primary key
    references public.profiles(id)
    on delete restrict,
  platform_role text not null,
  active boolean not null default true,
  created_by uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_users_platform_role_chk
    check (platform_role in ('super_admin', 'operations', 'support', 'read_only'))
);

comment on table public.platform_users is
  'Users authorized to access the Frotak master system. This is separate from tenant workspace membership.';
comment on column public.platform_users.platform_role is
  'Master platform role: super_admin, operations, support or read_only.';

create index platform_users_platform_role_idx on public.platform_users (platform_role);
create index platform_users_active_idx on public.platform_users (active);

create trigger platform_users_set_updated_at
before update on public.platform_users
for each row
execute function public.set_updated_at();

create table public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id)
    on delete restrict,
  user_id uuid not null
    references public.profiles(id)
    on delete restrict,
  status text not null default 'invited',
  is_owner boolean not null default false,
  invited_by uuid
    references auth.users(id)
    on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_memberships_status_chk
    check (status in ('invited', 'active', 'suspended', 'revoked')),
  constraint workspace_memberships_workspace_user_uidx
    unique (workspace_id, user_id),
  constraint workspace_memberships_id_workspace_uidx
    unique (id, workspace_id)
);

comment on table public.workspace_memberships is
  'Links a profile to a workspace. A user can belong to multiple workspaces.';
comment on column public.workspace_memberships.is_owner is
  'Marks the single non-revoked owner membership for a workspace.';

create index workspace_memberships_workspace_id_idx on public.workspace_memberships (workspace_id);
create index workspace_memberships_user_id_idx on public.workspace_memberships (user_id);
create index workspace_memberships_status_idx on public.workspace_memberships (status);
create index workspace_memberships_user_status_idx on public.workspace_memberships (user_id, status);
create index workspace_memberships_workspace_status_idx on public.workspace_memberships (workspace_id, status);
create unique index workspace_memberships_one_owner_uidx
  on public.workspace_memberships (workspace_id)
  where is_owner = true and status <> 'revoked';

create trigger workspace_memberships_set_updated_at
before update on public.workspace_memberships
for each row
execute function public.set_updated_at();

create table public.workspace_roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id)
    on delete restrict,
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_roles_code_format_chk
    check (code ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'),
  constraint workspace_roles_name_not_blank_chk
    check (btrim(name) <> ''),
  constraint workspace_roles_workspace_code_uidx
    unique (workspace_id, code),
  constraint workspace_roles_id_workspace_uidx
    unique (id, workspace_id)
);

comment on table public.workspace_roles is
  'Roles created inside a workspace. Roles are local to a workspace, while permissions are global.';
comment on column public.workspace_roles.is_system is
  'Marks roles created by provisioning logic rather than manually by administrators.';

create index workspace_roles_workspace_id_idx on public.workspace_roles (workspace_id);
create index workspace_roles_active_idx on public.workspace_roles (active);
create index workspace_roles_workspace_active_idx on public.workspace_roles (workspace_id, active);

create trigger workspace_roles_set_updated_at
before update on public.workspace_roles
for each row
execute function public.set_updated_at();

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid
    references public.modules(id)
    on delete restrict,
  code text not null,
  name text not null,
  description text,
  risk_level text not null default 'low',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permissions_code_format_chk
    check (code ~ '^[a-z0-9]+(\.[a-z0-9_]+)+$'),
  constraint permissions_name_not_blank_chk
    check (btrim(name) <> ''),
  constraint permissions_risk_level_chk
    check (risk_level in ('low', 'medium', 'high', 'critical'))
);

comment on table public.permissions is
  'Global permission catalog. Permissions may be general workspace permissions or tied to a commercial module.';
comment on column public.permissions.module_id is
  'When present, the permission is effective only if the corresponding module is enabled for the workspace.';
comment on column public.permissions.risk_level is
  'Operational risk level used by future administrative screens and approval flows.';

create unique index permissions_code_uidx on public.permissions (code);
create index permissions_module_id_idx on public.permissions (module_id);
create index permissions_active_idx on public.permissions (active);
create index permissions_risk_level_idx on public.permissions (risk_level);

create trigger permissions_set_updated_at
before update on public.permissions
for each row
execute function public.set_updated_at();

create table public.role_permissions (
  role_id uuid not null
    references public.workspace_roles(id)
    on delete restrict,
  permission_id uuid not null
    references public.permissions(id)
    on delete restrict,
  created_at timestamptz not null default now(),
  constraint role_permissions_pkey primary key (role_id, permission_id)
);

comment on table public.role_permissions is
  'Grants global permissions to workspace-local roles. Missing rows mean the role does not have the permission.';

create index role_permissions_permission_id_idx on public.role_permissions (permission_id);

create table public.membership_roles (
  membership_id uuid not null,
  role_id uuid not null,
  workspace_id uuid not null,
  created_at timestamptz not null default now(),
  constraint membership_roles_pkey primary key (membership_id, role_id),
  constraint membership_roles_membership_workspace_fkey
    foreign key (membership_id, workspace_id)
    references public.workspace_memberships(id, workspace_id)
    on delete restrict,
  constraint membership_roles_role_workspace_fkey
    foreign key (role_id, workspace_id)
    references public.workspace_roles(id, workspace_id)
    on delete restrict
);

comment on table public.membership_roles is
  'Assigns workspace-local roles to memberships. Composite foreign keys ensure role and membership belong to the same workspace.';

create index membership_roles_role_id_idx on public.membership_roles (role_id);
create index membership_roles_workspace_id_idx on public.membership_roles (workspace_id);

alter table public.profiles enable row level security;
alter table public.platform_users enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.membership_roles enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.platform_users from anon, authenticated;
revoke all on table public.workspace_memberships from anon, authenticated;
revoke all on table public.workspace_roles from anon, authenticated;
revoke all on table public.permissions from anon, authenticated;
revoke all on table public.role_permissions from anon, authenticated;
revoke all on table public.membership_roles from anon, authenticated;
