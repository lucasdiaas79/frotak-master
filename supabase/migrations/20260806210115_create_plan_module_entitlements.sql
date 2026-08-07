create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_code_format_chk
    check (code ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'),
  constraint plans_name_not_blank_chk
    check (btrim(name) <> ''),
  constraint plans_metadata_object_chk
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.plans is
  'Commercial products sold by Frotak. A plan defines the commercial package contracted by a tenant.';
comment on column public.plans.code is
  'Globally unique commercial plan code, stored in uppercase with optional underscores.';
comment on column public.plans.name is
  'Human-readable plan name. Capitalization is preserved as entered.';
comment on column public.plans.description is
  'Commercial description shown in administrative and billing contexts.';
comment on column public.plans.active is
  'Controls whether the plan is available for new subscriptions.';
comment on column public.plans.metadata is
  'Plan-level flexible metadata reserved for future billing and commercial attributes.';

create unique index plans_code_uidx on public.plans (code);
create index plans_active_idx on public.plans (active);

create trigger plans_set_updated_at
before update on public.plans
for each row
execute function public.set_updated_at();

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modules_code_format_chk
    check (code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  constraint modules_name_not_blank_chk
    check (btrim(name) <> ''),
  constraint modules_metadata_object_chk
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.modules is
  'Global catalog of functional areas in the Frotak platform. A module is independent from user permissions.';
comment on column public.modules.code is
  'Globally unique module code, stored in lowercase with optional underscores.';
comment on column public.modules.name is
  'Human-readable module name. Capitalization is preserved as entered.';
comment on column public.modules.description is
  'Functional description of the module.';
comment on column public.modules.active is
  'Controls whether the module is available for commercial and operational activation.';
comment on column public.modules.metadata is
  'Module-level flexible metadata reserved for future catalog attributes.';

create unique index modules_code_uidx on public.modules (code);
create index modules_active_idx on public.modules (active);

create trigger modules_set_updated_at
before update on public.modules
for each row
execute function public.set_updated_at();

create table public.plan_modules (
  plan_id uuid not null
    references public.plans(id)
    on delete restrict,
  module_id uuid not null
    references public.modules(id)
    on delete restrict,
  included boolean not null default true,
  default_limits jsonb not null default '{}'::jsonb,
  default_configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint plan_modules_pkey primary key (plan_id, module_id),
  constraint plan_modules_default_limits_object_chk
    check (jsonb_typeof(default_limits) = 'object'),
  constraint plan_modules_default_configuration_object_chk
    check (jsonb_typeof(default_configuration) = 'object')
);

comment on table public.plan_modules is
  'Catalog relationship between commercial plans and modules included by default. This is not the same as an enabled module inside a workspace.';
comment on column public.plan_modules.plan_id is
  'Commercial plan that includes or references the module. on delete restrict preserves catalog integrity.';
comment on column public.plan_modules.module_id is
  'Module included in the plan catalog. on delete restrict prevents silent removal from commercial history.';
comment on column public.plan_modules.included is
  'Marks whether the module is included in the plan catalog entry.';
comment on column public.plan_modules.default_limits is
  'Default plan-level limits for this module, such as quantities or quotas.';
comment on column public.plan_modules.default_configuration is
  'Default plan-level configuration copied later during controlled provisioning.';

create index plan_modules_module_id_idx on public.plan_modules (module_id);

create table public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id)
    on delete restrict,
  plan_id uuid not null
    references public.plans(id)
    on delete restrict,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  trial_ends_at timestamptz,
  billing_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_subscriptions_status_chk
    check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled', 'expired')),
  constraint tenant_subscriptions_ends_at_chk
    check (ends_at is null or ends_at >= starts_at),
  constraint tenant_subscriptions_trial_ends_at_chk
    check (trial_ends_at is null or trial_ends_at >= starts_at),
  constraint tenant_subscriptions_billing_metadata_object_chk
    check (jsonb_typeof(billing_metadata) = 'object')
);

comment on table public.tenant_subscriptions is
  'Subscription history connecting tenants to commercial plans over time. Cancelled and expired rows are retained for audit and billing history.';
comment on column public.tenant_subscriptions.tenant_id is
  'Tenant that contracted the plan. on delete restrict prevents silent removal of subscription history.';
comment on column public.tenant_subscriptions.plan_id is
  'Commercial plan contracted by the tenant. on delete restrict protects billing history.';
comment on column public.tenant_subscriptions.status is
  'Subscription lifecycle. Current statuses are trial, active, past_due and suspended.';
comment on column public.tenant_subscriptions.starts_at is
  'Timestamp when the subscription period starts.';
comment on column public.tenant_subscriptions.ends_at is
  'Optional timestamp when the subscription period ends.';
comment on column public.tenant_subscriptions.trial_ends_at is
  'Optional timestamp when the trial period ends.';
comment on column public.tenant_subscriptions.billing_metadata is
  'Flexible billing metadata for future payment, invoicing and commercial references.';

create index tenant_subscriptions_tenant_id_idx on public.tenant_subscriptions (tenant_id);
create index tenant_subscriptions_plan_id_idx on public.tenant_subscriptions (plan_id);
create index tenant_subscriptions_status_idx on public.tenant_subscriptions (status);
create index tenant_subscriptions_tenant_id_status_idx on public.tenant_subscriptions (tenant_id, status);
create index tenant_subscriptions_ends_at_idx on public.tenant_subscriptions (ends_at);
create unique index tenant_subscriptions_current_tenant_uidx
  on public.tenant_subscriptions (tenant_id)
  where status in ('trial', 'active', 'past_due', 'suspended');

create trigger tenant_subscriptions_set_updated_at
before update on public.tenant_subscriptions
for each row
execute function public.set_updated_at();

create table public.workspace_modules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id)
    on delete restrict,
  module_id uuid not null
    references public.modules(id)
    on delete restrict,
  enabled boolean not null default false,
  source text not null default 'plan',
  limits jsonb not null default '{}'::jsonb,
  configuration jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_modules_source_chk
    check (source in ('plan', 'addon', 'trial', 'manual', 'promotion')),
  constraint workspace_modules_expires_at_chk
    check (expires_at is null or expires_at >= starts_at),
  constraint workspace_modules_limits_object_chk
    check (jsonb_typeof(limits) = 'object'),
  constraint workspace_modules_configuration_object_chk
    check (jsonb_typeof(configuration) = 'object')
);

comment on table public.workspace_modules is
  'Effective module activation inside a workspace. This is separate from plan catalog inclusion and future individual user permissions.';
comment on column public.workspace_modules.workspace_id is
  'Workspace where the module is effectively enabled or disabled. on delete restrict protects operational entitlement history.';
comment on column public.workspace_modules.module_id is
  'Module enabled in the workspace. on delete restrict prevents silent entitlement loss.';
comment on column public.workspace_modules.enabled is
  'Whether the module is currently enabled for the workspace.';
comment on column public.workspace_modules.source is
  'Origin of the workspace module entitlement: plan, addon, trial, manual or promotion.';
comment on column public.workspace_modules.limits is
  'Effective workspace-level limits for the module, such as quantities or quotas.';
comment on column public.workspace_modules.configuration is
  'Effective workspace-level module configuration.';
comment on column public.workspace_modules.starts_at is
  'Timestamp when the entitlement starts.';
comment on column public.workspace_modules.expires_at is
  'Optional timestamp when the entitlement expires.';
comment on column public.workspace_modules.created_by is
  'Optional auth user that created the entitlement. Kept nullable with on delete set null to preserve history.';

create index workspace_modules_workspace_id_idx on public.workspace_modules (workspace_id);
create index workspace_modules_module_id_idx on public.workspace_modules (module_id);
create index workspace_modules_workspace_id_enabled_idx on public.workspace_modules (workspace_id, enabled);
create index workspace_modules_expires_at_idx on public.workspace_modules (expires_at);
create unique index workspace_modules_workspace_id_module_id_uidx
  on public.workspace_modules (workspace_id, module_id);

create trigger workspace_modules_set_updated_at
before update on public.workspace_modules
for each row
execute function public.set_updated_at();

alter table public.plans enable row level security;
alter table public.modules enable row level security;
alter table public.plan_modules enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.workspace_modules enable row level security;

revoke all on table public.plans from anon;
revoke all on table public.modules from anon;
revoke all on table public.plan_modules from anon;
revoke all on table public.tenant_subscriptions from anon;
revoke all on table public.workspace_modules from anon;

revoke all on table public.plans from authenticated;
revoke all on table public.modules from authenticated;
revoke all on table public.plan_modules from authenticated;
revoke all on table public.tenant_subscriptions from authenticated;
revoke all on table public.workspace_modules from authenticated;
