create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete restrict,
  workspace_id uuid references public.workspaces(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_not_blank_chk
    check (btrim(action) <> ''),
  constraint audit_logs_entity_type_not_blank_chk
    check (btrim(entity_type) <> ''),
  constraint audit_logs_old_data_object_chk
    check (old_data is null or jsonb_typeof(old_data) = 'object'),
  constraint audit_logs_new_data_object_chk
    check (new_data is null or jsonb_typeof(new_data) = 'object'),
  constraint audit_logs_metadata_object_chk
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.audit_logs is
  'Administrative audit trail for controlled platform operations. Writes are performed by privileged RPCs, not directly by authenticated users.';

create index audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);
create index audit_logs_tenant_id_idx on public.audit_logs (tenant_id);
create index audit_logs_workspace_id_idx on public.audit_logs (workspace_id);
create index audit_logs_action_idx on public.audit_logs (action);
create index audit_logs_entity_type_idx on public.audit_logs (entity_type);
create index audit_logs_created_at_idx on public.audit_logs (created_at);

alter table public.audit_logs enable row level security;

revoke all on table public.audit_logs from anon;
revoke all on table public.audit_logs from authenticated;

create or replace function private.provision_tenant(
  p_owner_user_id uuid,
  p_owner_full_name text,
  p_legal_name text,
  p_trade_name text,
  p_cnpj text,
  p_tenant_slug text,
  p_workspace_name text,
  p_workspace_slug text,
  p_plan_code text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_subscription_period text,
  p_max_vehicles integer,
  p_enabled_module_codes text[],
  p_actor_user_id uuid
)
returns table (
  tenant_id uuid,
  workspace_id uuid,
  membership_id uuid,
  owner_role_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor_role text;
  v_plan_id uuid;
  v_fleet_module_id uuid;
  v_tenant_id uuid;
  v_workspace_id uuid;
  v_membership_id uuid;
  v_owner_role_id uuid;
  v_enabled_module_codes text[];
  v_missing_modules text[];
begin
  if p_owner_user_id is null then
    raise exception 'owner_user_id is required';
  end if;

  if p_actor_user_id is null then
    raise exception 'actor_user_id is required';
  end if;

  select platform_role
    into v_actor_role
  from public.platform_users
  where user_id = p_actor_user_id
    and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operations') then
    raise exception 'actor is not authorized to provision tenants';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_owner_user_id
      and active = true
  ) then
    raise exception 'owner profile not found or inactive';
  end if;

  if p_cnpj is not null and p_cnpj !~ '^[0-9]{14}$' then
    raise exception 'cnpj must contain exactly 14 digits';
  end if;

  if p_max_vehicles is null or p_max_vehicles < 1 then
    raise exception 'max_vehicles must be greater than zero';
  end if;

  if p_starts_at is null then
    raise exception 'starts_at is required';
  end if;

  if p_ends_at is not null and p_ends_at < p_starts_at then
    raise exception 'ends_at must be greater than or equal to starts_at';
  end if;

  if exists (
    select 1
    from public.tenants
    where slug = p_tenant_slug
  ) then
    raise exception 'tenant slug already exists';
  end if;

  select id
    into v_plan_id
  from public.plans
  where code = upper(btrim(p_plan_code))
    and active = true;

  if v_plan_id is null then
    raise exception 'plan not found or inactive';
  end if;

  select id
    into v_fleet_module_id
  from public.modules
  where code = 'fleet_core'
    and active = true;

  if v_fleet_module_id is null then
    raise exception 'required module fleet_core not found or inactive';
  end if;

  select array_agg(distinct module_code order by module_code)
    into v_enabled_module_codes
  from unnest(coalesce(p_enabled_module_codes, array[]::text[]) || array['fleet_core']) as module_code
  where btrim(module_code) <> '';

  select array_agg(module_code order by module_code)
    into v_missing_modules
  from unnest(coalesce(v_enabled_module_codes, array[]::text[])) as module_code
  where not exists (
    select 1
    from public.modules
    where modules.code = module_code
      and modules.active = true
  );

  if v_missing_modules is not null then
    raise exception 'module not found or inactive: %', array_to_string(v_missing_modules, ', ');
  end if;

  insert into public.tenants (
    slug,
    legal_name,
    trade_name,
    cnpj,
    status,
    settings,
    created_by
  )
  values (
    p_tenant_slug,
    p_legal_name,
    nullif(btrim(coalesce(p_trade_name, '')), ''),
    p_cnpj,
    'provisioning',
    jsonb_build_object(
      'subscriptionPeriod', p_subscription_period,
      'maxVehicles', p_max_vehicles
    ),
    p_actor_user_id
  )
  returning id into v_tenant_id;

  insert into public.workspaces (
    tenant_id,
    name,
    slug,
    status,
    is_default,
    settings
  )
  values (
    v_tenant_id,
    p_workspace_name,
    p_workspace_slug,
    'active',
    true,
    jsonb_build_object('maxVehicles', p_max_vehicles)
  )
  returning id into v_workspace_id;

  insert into public.tenant_subscriptions (
    tenant_id,
    plan_id,
    status,
    starts_at,
    ends_at,
    billing_metadata
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
    workspace_id,
    module_id,
    enabled,
    source,
    limits,
    configuration,
    starts_at,
    expires_at,
    created_by
  )
  select
    v_workspace_id,
    modules_to_enable.module_id,
    true,
    modules_to_enable.source,
    case
      when modules_to_enable.code = 'fleet_core'
        then coalesce(modules_to_enable.default_limits, '{}'::jsonb)
          || jsonb_build_object('max_vehicles', p_max_vehicles)
      else coalesce(modules_to_enable.default_limits, '{}'::jsonb)
    end,
    coalesce(modules_to_enable.default_configuration, '{}'::jsonb),
    p_starts_at,
    p_ends_at,
    p_actor_user_id
  from (
    select
      m.id as module_id,
      m.code,
      'plan'::text as source,
      pm.default_limits,
      pm.default_configuration
    from public.plan_modules pm
    join public.modules m on m.id = pm.module_id
    where pm.plan_id = v_plan_id
      and pm.included = true
      and m.active = true
    union
    select
      m.id as module_id,
      m.code,
      case when m.code = 'fleet_core' then 'plan' else 'addon' end as source,
      '{}'::jsonb as default_limits,
      '{}'::jsonb as default_configuration
    from public.modules m
    where m.code = any(v_enabled_module_codes)
      and m.active = true
  ) modules_to_enable;

  insert into public.workspace_roles (workspace_id, code, name, description, is_system, active)
  values
    (v_workspace_id, 'OWNER', 'Proprietario', 'Acesso total administrativo do workspace.', true, true),
    (v_workspace_id, 'ADMIN', 'Administrador', 'Administracao operacional do workspace.', true, true),
    (v_workspace_id, 'MANAGER', 'Gestor', 'Gestao de operacoes e cadastros.', true, true),
    (v_workspace_id, 'DISPATCHER', 'Operador', 'Operacao diaria e acompanhamento da frota.', true, true),
    (v_workspace_id, 'FINANCIAL', 'Financeiro', 'Rotinas financeiras e relatorios.', true, true),
    (v_workspace_id, 'VIEWER', 'Visualizador', 'Acesso de leitura.', true, true);

  select id
    into v_owner_role_id
  from public.workspace_roles
  where workspace_id = v_workspace_id
    and code = 'OWNER';

  insert into public.workspace_memberships (
    workspace_id,
    user_id,
    status,
    is_owner,
    invited_by,
    joined_at
  )
  values (
    v_workspace_id,
    p_owner_user_id,
    'active',
    true,
    p_actor_user_id,
    now()
  )
  returning id into v_membership_id;

  insert into public.membership_roles (membership_id, role_id, workspace_id)
  values (v_membership_id, v_owner_role_id, v_workspace_id);

  insert into public.role_permissions (role_id, permission_id)
  select v_owner_role_id, permissions.id
  from public.permissions
  where permissions.active = true;

  update public.profiles
  set
    full_name = nullif(btrim(p_owner_full_name), ''),
    must_change_password = true
  where id = p_owner_user_id;

  insert into public.audit_logs (
    actor_user_id,
    tenant_id,
    workspace_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    metadata
  )
  values (
    p_actor_user_id,
    v_tenant_id,
    v_workspace_id,
    'tenant.provisioned',
    'tenant',
    v_tenant_id,
    null,
    jsonb_build_object(
      'tenantId', v_tenant_id,
      'workspaceId', v_workspace_id,
      'ownerUserId', p_owner_user_id,
      'planCode', upper(btrim(p_plan_code)),
      'enabledModuleCodes', v_enabled_module_codes
    ),
    jsonb_build_object('source', 'master.provision_tenant')
  );

  update public.tenants
  set status = 'active'
  where id = v_tenant_id;

  return query
  select v_tenant_id, v_workspace_id, v_membership_id, v_owner_role_id;
end;
$$;

revoke all on function private.provision_tenant(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  integer,
  text[],
  uuid
) from public, anon, authenticated;

grant execute on function private.provision_tenant(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  integer,
  text[],
  uuid
) to service_role;

create or replace function public.provision_tenant(
  p_owner_user_id uuid,
  p_owner_full_name text,
  p_legal_name text,
  p_trade_name text,
  p_cnpj text,
  p_tenant_slug text,
  p_workspace_name text,
  p_workspace_slug text,
  p_plan_code text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_subscription_period text,
  p_max_vehicles integer,
  p_enabled_module_codes text[],
  p_actor_user_id uuid
)
returns table (
  tenant_id uuid,
  workspace_id uuid,
  membership_id uuid,
  owner_role_id uuid
)
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select *
  from private.provision_tenant(
    p_owner_user_id,
    p_owner_full_name,
    p_legal_name,
    p_trade_name,
    p_cnpj,
    p_tenant_slug,
    p_workspace_name,
    p_workspace_slug,
    p_plan_code,
    p_starts_at,
    p_ends_at,
    p_subscription_period,
    p_max_vehicles,
    p_enabled_module_codes,
    p_actor_user_id
  );
$$;

revoke all on function public.provision_tenant(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  integer,
  text[],
  uuid
) from public, anon, authenticated;

grant execute on function public.provision_tenant(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  integer,
  text[],
  uuid
) to service_role;
