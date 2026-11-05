-- Banco por cliente: o Central guarda so o cadastro do cliente, o contrato e as liberacoes. Os
-- dados da operacao e os logins ficam no banco do proprio cliente, criado pelo agente da VPS de
-- banco. Com banco unico, estas estruturas ficam vazias e nada muda.

begin;

create table if not exists public.client_databases (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  slug text not null unique,
  database_name text not null unique,
  status text not null default 'provisioning',
  owner_email text,
  client_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_databases_status_chk check (status in ('provisioning', 'active'))
);

comment on table public.client_databases is
  'Onde esta o banco de cada cliente. Nao guarda credencial: quem as tem e o agente da VPS de banco.';

alter table public.client_databases enable row level security;
revoke all on table public.client_databases from public, anon, authenticated;
grant select on table public.client_databases to service_role;

-- Registra o cliente antes de criar o banco dele. Mesmas regras de provision_tenant, sem login:
-- o dono do cliente so existe no banco do cliente.
create or replace function public.master_register_client(
  p_slug text,
  p_database_name text,
  p_legal_name text,
  p_trade_name text,
  p_cnpj text,
  p_workspace_name text,
  p_plan_code text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_subscription_period text,
  p_max_vehicles integer,
  p_enabled_module_codes text[],
  p_owner_email text,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_plan_id uuid;
  v_tenant_id uuid;
  v_workspace_id uuid;
  v_modules text[];
begin
  perform private.require_master_operator(p_actor_user_id);

  if p_cnpj is not null and p_cnpj !~ '^[0-9]{14}$' then
    raise exception 'cnpj must contain exactly 14 digits';
  end if;
  if p_max_vehicles is null or p_max_vehicles < 1 then
    raise exception 'max_vehicles must be greater than zero';
  end if;
  if exists (select 1 from public.tenants where slug = p_slug) then
    raise exception 'tenant slug already exists';
  end if;

  select id into v_plan_id
  from public.plans
  where code = upper(btrim(p_plan_code)) and active = true;
  if v_plan_id is null then
    raise exception 'plan not found or inactive';
  end if;

  select array_agg(distinct code) into v_modules
  from unnest(coalesce(p_enabled_module_codes, array[]::text[]) || array['fleet_core']) as code
  where btrim(code) <> '';

  insert into public.tenants (slug, legal_name, trade_name, cnpj, status, settings, created_by)
  values (
    p_slug,
    p_legal_name,
    nullif(btrim(coalesce(p_trade_name, '')), ''),
    p_cnpj,
    'provisioning',
    jsonb_build_object('subscriptionPeriod', p_subscription_period, 'maxVehicles', p_max_vehicles),
    p_actor_user_id
  )
  returning id into v_tenant_id;

  insert into public.workspaces (tenant_id, name, slug, status, is_default, settings)
  values (
    v_tenant_id,
    p_workspace_name,
    p_slug,
    'active',
    true,
    jsonb_build_object('maxVehicles', p_max_vehicles)
  )
  returning id into v_workspace_id;

  insert into public.tenant_subscriptions (
    tenant_id, plan_id, status, starts_at, ends_at, billing_metadata
  )
  values (
    v_tenant_id,
    v_plan_id,
    'active',
    p_starts_at,
    p_ends_at,
    jsonb_build_object('period', p_subscription_period)
  );

  insert into public.workspace_modules (
    workspace_id, module_id, enabled, source, limits, configuration, starts_at, expires_at, created_by
  )
  select
    v_workspace_id,
    m.id,
    true,
    case when m.code = 'fleet_core' then 'plan' else 'addon' end,
    case when m.code = 'fleet_core'
      then jsonb_build_object('max_vehicles', p_max_vehicles)
      else '{}'::jsonb
    end,
    '{}'::jsonb,
    p_starts_at,
    p_ends_at,
    p_actor_user_id
  from public.modules m
  where m.code = any(v_modules) and m.active = true;

  insert into public.client_databases (tenant_id, slug, database_name, owner_email)
  values (v_tenant_id, p_slug, p_database_name, p_owner_email);

  insert into public.audit_logs (
    actor_user_id, tenant_id, workspace_id, action, entity_type, entity_id, new_data, metadata
  )
  values (
    p_actor_user_id,
    v_tenant_id,
    v_workspace_id,
    'client_database.registered',
    'tenant',
    v_tenant_id,
    jsonb_build_object('slug', p_slug, 'databaseName', p_database_name, 'modules', v_modules),
    jsonb_build_object('source', 'master.register_client')
  );

  return v_tenant_id;
end;
$$;

create or replace function public.master_activate_client(
  p_tenant_id uuid,
  p_client_url text,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.require_master_operator(p_actor_user_id);

  update public.client_databases
  set status = 'active', client_url = p_client_url, updated_at = now()
  where tenant_id = p_tenant_id;

  update public.tenants
  set status = 'active'
  where id = p_tenant_id and status = 'provisioning';
end;
$$;

-- Desfaz o cadastro quando a criacao do banco falha. So apaga quem ainda esta em provisionamento.
create or replace function public.master_discard_client(
  p_tenant_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_slug text;
begin
  perform private.require_master_operator(p_actor_user_id);

  select slug into v_slug
  from public.client_databases
  where tenant_id = p_tenant_id and status = 'provisioning';

  if v_slug is null then
    return;
  end if;

  -- Cliente em provisionamento so tem o que master_register_client gravou.
  delete from public.workspace_modules
  where workspace_id in (select id from public.workspaces where tenant_id = p_tenant_id);
  delete from public.audit_logs where tenant_id = p_tenant_id;
  delete from public.tenant_subscriptions where tenant_id = p_tenant_id;
  delete from public.tenant_platform_products where tenant_id = p_tenant_id;
  delete from public.client_databases where tenant_id = p_tenant_id;
  delete from public.workspaces where tenant_id = p_tenant_id;
  delete from public.tenants where id = p_tenant_id;

  insert into public.audit_logs (actor_user_id, action, entity_type, metadata)
  values (
    p_actor_user_id,
    'client_database.discarded',
    'tenant',
    jsonb_build_object('slug', v_slug, 'source', 'master.discard_client')
  );
end;
$$;

revoke all on function public.master_register_client(
  text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text, uuid
) from public, anon, authenticated;
revoke all on function public.master_activate_client(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.master_discard_client(uuid, uuid) from public, anon, authenticated;
grant execute on function public.master_register_client(
  text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text, uuid
) to service_role;
grant execute on function public.master_activate_client(uuid, text, uuid) to service_role;
grant execute on function public.master_discard_client(uuid, uuid) to service_role;

commit;
