create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Reusable trigger function that keeps updated_at current on mutable public tables.';

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  legal_name text not null,
  trade_name text,
  cnpj text,
  status text not null default 'provisioning',
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_format_chk
    check (slug = btrim(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint tenants_legal_name_not_blank_chk
    check (btrim(legal_name) <> ''),
  constraint tenants_cnpj_digits_chk
    check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  constraint tenants_status_chk
    check (status in ('provisioning', 'trial', 'active', 'suspended', 'cancelled'))
);

comment on table public.tenants is
  'Customer company contracted by Frotak. A tenant owns one or more operational workspaces.';
comment on column public.tenants.id is 'Stable tenant identifier used across the platform.';
comment on column public.tenants.slug is
  'Globally unique normalized tenant slug. The database rejects unnormalized values instead of silently rewriting them.';
comment on column public.tenants.legal_name is 'Registered legal company name.';
comment on column public.tenants.trade_name is 'Optional trading name displayed in product surfaces.';
comment on column public.tenants.cnpj is
  'Optional Brazilian company tax identifier stored as exactly 14 digits. It is intentionally not globally unique in this foundation migration.';
comment on column public.tenants.status is
  'Tenant lifecycle state stored as text with a check constraint to keep future migrations simple.';
comment on column public.tenants.settings is
  'Tenant-level flexible configuration for future product flags and administrative metadata.';
comment on column public.tenants.created_by is
  'Optional auth user that created the tenant. Kept nullable with on delete set null to preserve tenant history.';

create unique index tenants_slug_uidx on public.tenants (slug);
create index tenants_status_idx on public.tenants (status);
create index tenants_cnpj_idx on public.tenants (cnpj);
create index tenants_created_at_idx on public.tenants (created_at);

create trigger tenants_set_updated_at
before update on public.tenants
for each row
execute function public.set_updated_at();

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id)
    on delete restrict,
  name text not null,
  slug text not null,
  status text not null default 'active',
  is_default boolean not null default false,
  timezone text not null default 'America/Bahia',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_not_blank_chk
    check (btrim(name) <> ''),
  constraint workspaces_slug_format_chk
    check (slug = btrim(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint workspaces_status_chk
    check (status in ('active', 'suspended', 'archived'))
);

comment on table public.workspaces is
  'Operational environment inside a tenant. Operational data will belong to a workspace, allowing future branches or test environments per customer.';
comment on column public.workspaces.tenant_id is
  'Owner tenant. on delete restrict prevents deleting a tenant and silently removing its operational structure.';
comment on column public.workspaces.name is 'Workspace display name. Capitalization is preserved as entered.';
comment on column public.workspaces.slug is
  'Normalized workspace slug unique only within its tenant.';
comment on column public.workspaces.status is
  'Workspace lifecycle state stored as text with a check constraint.';
comment on column public.workspaces.is_default is
  'Marks the primary workspace for a tenant. A partial unique index allows at most one default workspace per tenant.';
comment on column public.workspaces.timezone is
  'Operational timezone. America/Bahia is the initial Frotak operating timezone.';
comment on column public.workspaces.settings is
  'Workspace-level flexible configuration for future operational preferences without immediate schema churn.';

create index workspaces_tenant_id_idx on public.workspaces (tenant_id);
create index workspaces_status_idx on public.workspaces (status);
create index workspaces_tenant_id_status_idx on public.workspaces (tenant_id, status);
create unique index workspaces_tenant_id_slug_uidx on public.workspaces (tenant_id, slug);
create unique index workspaces_default_per_tenant_uidx
  on public.workspaces (tenant_id)
  where is_default = true;

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row
execute function public.set_updated_at();

alter table public.tenants enable row level security;
alter table public.workspaces enable row level security;

revoke all on table public.tenants from anon;
revoke all on table public.workspaces from anon;
revoke all on table public.tenants from authenticated;
revoke all on table public.workspaces from authenticated;
