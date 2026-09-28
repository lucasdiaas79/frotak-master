begin;

create table if not exists public.workspace_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  status text not null default 'inactive' check (status in ('active', 'inactive', 'error')),
  secret_ref text null,
  config jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_integrations_provider_check
    check (provider = lower(provider) and provider ~ '^[a-z0-9_]+$'),
  constraint workspace_integrations_tenant_workspace_fkey
    foreign key (tenant_id, workspace_id) references public.workspaces(tenant_id, id)
);

create unique index if not exists workspace_integrations_workspace_provider_uidx
  on public.workspace_integrations(workspace_id, provider);

create index if not exists workspace_integrations_tenant_provider_idx
  on public.workspace_integrations(tenant_id, provider, status);

drop trigger if exists workspace_integrations_touch_updated_at on public.workspace_integrations;
create trigger workspace_integrations_touch_updated_at before update on public.workspace_integrations
  for each row execute function public.touch_updated_at();

create or replace function public.ensure_workspace_integration_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_tenant_id uuid;
begin
  select tenant_id into v_workspace_tenant_id
  from public.workspaces
  where id = new.workspace_id;

  if v_workspace_tenant_id is null then
    raise exception 'workspace not found for integration';
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_workspace_tenant_id;
  end if;

  if new.tenant_id <> v_workspace_tenant_id then
    raise exception 'workspace integration tenant mismatch';
  end if;

  new.provider := lower(new.provider);
  return new;
end;
$$;

drop trigger if exists workspace_integrations_validate_tenant on public.workspace_integrations;
create trigger workspace_integrations_validate_tenant
  before insert or update of workspace_id, tenant_id, provider
  on public.workspace_integrations
  for each row execute function public.ensure_workspace_integration_tenant();

alter table public.workspace_integrations enable row level security;

grant select, insert, update, delete on table public.workspace_integrations to authenticated;

drop policy if exists "tenant admins can read workspace integrations" on public.workspace_integrations;
create policy "tenant admins can read workspace integrations"
  on public.workspace_integrations
  for select
  to authenticated
  using (private.is_platform_user() or private.is_workspace_owner(workspace_id));

drop policy if exists "tenant admins can insert workspace integrations" on public.workspace_integrations;
create policy "tenant admins can insert workspace integrations"
  on public.workspace_integrations
  for insert
  to authenticated
  with check (private.is_platform_user() or private.is_workspace_owner(workspace_id));

drop policy if exists "tenant admins can update workspace integrations" on public.workspace_integrations;
create policy "tenant admins can update workspace integrations"
  on public.workspace_integrations
  for update
  to authenticated
  using (private.is_platform_user() or private.is_workspace_owner(workspace_id))
  with check (private.is_platform_user() or private.is_workspace_owner(workspace_id));

drop policy if exists "tenant admins can delete workspace integrations" on public.workspace_integrations;
create policy "tenant admins can delete workspace integrations"
  on public.workspace_integrations
  for delete
  to authenticated
  using (private.is_platform_user() or private.is_workspace_owner(workspace_id));

comment on table public.workspace_integrations is
  'Tenant/workspace scoped integration configuration. Sensitive provider credentials must live in server-side env/secret manager and be referenced by secret_ref.';

comment on column public.workspace_integrations.secret_ref is
  'Server-side secret reference. For Sascar, secret_ref jo resolves to SASCAR_JO_USER and SASCAR_JO_PASSWORD in the application environment.';

commit;
