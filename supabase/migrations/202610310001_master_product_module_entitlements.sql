-- FrotaK Master · Fase 1: produtos e módulos liberados por cliente.
--
-- Referência: "FrotaK Master · Arquitetura" (PDF, 2026-10-29), adaptado ao banco único atual.
-- O Master liga e desliga produtos (TMS, View) e módulos do TMS por cliente. O app cliente
-- consulta public.get_workspace_entitlements e o banco recusa o acesso a módulos desligados
-- (MODULE_DISABLED) nos pontos centrais: financeiro, app motorista e Frotak IA (servidor).
--
-- Compatibilidade: todos os clientes existentes recebem o produto TMS, e os módulos que passam
-- a ser exigidos (fleet_core, frotak_ai, frotak_tracking, driver_app) são ligados nos workspaces
-- ativos que ainda não tinham registro. O comportamento atual fica preservado; quem não contratou
-- deve ser desligado no Master depois da aplicação.

-- 0. Pré-condição: nenhum cliente em uso pode estar parado em "provisioning", porque
--    private.workspace_has_module só libera tenants active/trial e a migration passaria a
--    bloquear o financeiro do dono e o app motorista desses clientes.
do $$
declare
  v_blocked text;
begin
  select string_agg(t.slug, ', ' order by t.slug)
    into v_blocked
  from public.tenants t
  where t.status = 'provisioning'
    and exists (
      select 1
      from public.workspaces w
      join public.workspace_memberships wm on wm.workspace_id = w.id
      where w.tenant_id = t.id
        and w.status = 'active'
        and wm.status = 'active'
    );

  if v_blocked is not null then
    raise exception
      'Tenants em uso com status provisioning: %. Corrija o status antes de aplicar esta migration.',
      v_blocked;
  end if;
end;
$$;

-- 1. Produtos
create table public.platform_products (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_products_code_format_chk
    check (code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  constraint platform_products_name_not_blank_chk
    check (btrim(name) <> '')
);

comment on table public.platform_products is
  'Produtos FrotaK contratáveis por cliente (TMS, View). Módulos pertencem a um produto.';

create unique index platform_products_code_uidx on public.platform_products (code);

create trigger platform_products_set_updated_at
before update on public.platform_products
for each row
execute function public.set_updated_at();

insert into public.platform_products (code, name, description, sort_order)
values
  (
    'tms',
    'TMS FrotaK',
    'Gestão de transporte: frota, fretes, financeiro, CT-e, IA e app do motorista.',
    10
  ),
  (
    'view',
    'FrotaK View',
    'Videotelemetria Hikvision: vídeo, gravações, alertas ADAS/DSM e GPS.',
    20
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

-- 2. Módulos pertencem a um produto; o módulo core não pode ser desligado com o produto ligado
alter table public.modules
  add column platform_product_id uuid references public.platform_products(id) on delete restrict,
  add column is_core boolean not null default false,
  add column sort_order integer not null default 0;

comment on column public.modules.platform_product_id is
  'Produto ao qual o módulo pertence. O módulo só vale se o produto estiver liberado para o cliente.';
comment on column public.modules.is_core is
  'Módulo base do produto: fica ligado enquanto o produto estiver liberado.';

create index modules_platform_product_id_idx on public.modules (platform_product_id);

insert into public.modules (code, name, description, active)
values (
  'driver_app',
  'App Motorista',
  'Aplicativo do motorista: viagens, abastecimentos, despesas, documentos e prestação de contas.',
  true
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  active = excluded.active,
  updated_at = now();

update public.modules
set
  description = 'Gestão de frota, Smart Flow, fretes, cadastros, documentos, abastecimentos, histórico e mapa operacional.',
  updated_at = now()
where code = 'fleet_core';

update public.modules m
set
  platform_product_id = p.id,
  is_core = (m.code = 'fleet_core'),
  sort_order = case m.code
    when 'fleet_core' then 10
    when 'financial' then 20
    when 'cte_issuance' then 30
    when 'frotak_ai' then 40
    when 'driver_app' then 50
    when 'frotak_tracking' then 60
    else 100
  end
from public.platform_products p
where p.code = 'tms'
  and m.code in (
    'fleet_core',
    'financial',
    'cte_issuance',
    'frotak_ai',
    'driver_app',
    'frotak_tracking'
  );

create unique index modules_one_core_per_product_uidx
  on public.modules (platform_product_id)
  where is_core;

-- 3. Produtos liberados por cliente
create table public.tenant_platform_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id)
    on delete restrict,
  platform_product_id uuid not null
    references public.platform_products(id)
    on delete restrict,
  enabled boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_platform_products_ends_at_chk
    check (ends_at is null or ends_at >= starts_at)
);

comment on table public.tenant_platform_products is
  'Produtos liberados para cada cliente. Desligar não apaga dados; só bloqueia o acesso.';

create unique index tenant_platform_products_tenant_id_product_id_uidx
  on public.tenant_platform_products (tenant_id, platform_product_id);
create index tenant_platform_products_product_id_idx on public.tenant_platform_products (platform_product_id);

create trigger tenant_platform_products_set_updated_at
before update on public.tenant_platform_products
for each row
execute function public.set_updated_at();

alter table public.platform_products enable row level security;
alter table public.tenant_platform_products enable row level security;

revoke all on table public.platform_products from anon;
revoke all on table public.tenant_platform_products from anon;
revoke all on table public.platform_products from authenticated;
revoke all on table public.tenant_platform_products from authenticated;

grant select on table public.platform_products to authenticated;
grant select on table public.tenant_platform_products to authenticated;

create policy platform_products_read_active_or_platform
on public.platform_products
for select
to authenticated
using (
  private.is_platform_user()
  or (private.is_active_profile() and active = true)
);

create policy tenant_platform_products_read_tenant_member_or_platform
on public.tenant_platform_products
for select
to authenticated
using (
  private.is_platform_user()
  or exists (
    select 1
    from public.workspaces
    where workspaces.tenant_id = tenant_platform_products.tenant_id
      and private.is_workspace_member(workspaces.id)
  )
);

-- 4. Backfill: preserva o acesso atual de todos os clientes
insert into public.tenant_platform_products (tenant_id, platform_product_id, enabled, starts_at)
select t.id, p.id, true, least(t.created_at, now())
from public.tenants t
cross join public.platform_products p
where p.code = 'tms'
on conflict (tenant_id, platform_product_id) do nothing;

insert into public.workspace_modules (workspace_id, module_id, enabled, source, starts_at)
select w.id, m.id, true, 'manual', now()
from public.workspaces w
join public.modules m
  on m.code in ('fleet_core', 'frotak_ai', 'frotak_tracking', 'driver_app')
 and m.active = true
where w.status = 'active'
on conflict (workspace_id, module_id) do nothing;

-- Clientes novos nascem com o TMS liberado, como no provisionamento atual.
create or replace function private.grant_default_tenant_products()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.tenant_platform_products (tenant_id, platform_product_id, enabled, created_by)
  select new.id, p.id, true, new.created_by
  from public.platform_products p
  where p.code = 'tms'
    and p.active = true
  on conflict (tenant_id, platform_product_id) do nothing;

  return new;
end;
$$;

revoke all on function private.grant_default_tenant_products() from public, anon, authenticated;

create trigger tenants_grant_default_products
after insert on public.tenants
for each row
execute function private.grant_default_tenant_products();

-- 5. Regras de acesso: módulo só vale com o produto dele liberado
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
      and (
        m.platform_product_id is null
        or exists (
          select 1
          from public.tenant_platform_products tp
          join public.platform_products p on p.id = tp.platform_product_id
          where tp.tenant_id = t.id
            and tp.platform_product_id = m.platform_product_id
            and tp.enabled = true
            and p.active = true
            and tp.starts_at <= now()
            and (tp.ends_at is null or tp.ends_at > now())
        )
      )
  );
$$;

create or replace function private.tenant_has_module(
  p_tenant_id uuid,
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
    from public.workspaces w
    where w.tenant_id = p_tenant_id
      and private.workspace_has_module(w.id, p_module_code)
  );
$$;

revoke all on function private.tenant_has_module(uuid, text) from public, anon, authenticated;

-- 6. Financeiro: o dono deixa de passar quando o módulo está desligado
create or replace function private.can_read_financial_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.workspace_has_module(p_workspace_id, 'financial')
    and (
      private.is_workspace_owner(p_workspace_id)
      or private.has_permission(p_workspace_id, 'financial.view')
      or private.has_permission(p_workspace_id, 'financial.transactions.read')
      or private.has_permission(p_workspace_id, 'financial.dashboard.read')
    );
$$;

create or replace function private.can_manage_financial_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.workspace_has_module(p_workspace_id, 'financial')
    and (
      private.is_workspace_owner(p_workspace_id)
      or private.has_permission(p_workspace_id, 'financial.create')
      or private.has_permission(p_workspace_id, 'financial.edit_draft')
      or private.has_permission(p_workspace_id, 'financial.transactions.manage')
    );
$$;

create or replace function private.can_configure_financial_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.workspace_has_module(p_workspace_id, 'financial')
    and (
      private.is_workspace_owner(p_workspace_id)
      or private.has_permission(p_workspace_id, 'financial.manage_accounts')
      or private.has_permission(p_workspace_id, 'financial.manage_chart')
      or private.has_permission(p_workspace_id, 'financial.manage_cost_centers')
      or private.has_permission(p_workspace_id, 'financial.settings.manage')
    );
$$;

create or replace function private.require_financial_permission(
  p_workspace_id uuid,
  p_permission text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.workspace_has_module(p_workspace_id, 'financial') then
    raise exception 'MODULE_DISABLED:financial' using errcode = '42501';
  end if;

  if not private.is_workspace_owner(p_workspace_id)
    and not private.has_permission(p_workspace_id, p_permission) then
    raise exception 'FINANCIAL_FORBIDDEN:%', p_permission using errcode = '42501';
  end if;
end;
$$;

create or replace function public.get_financial_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
  v_tenant_id uuid;
  v_is_owner boolean;
  v_permissions text[];
  v_module_enabled boolean;
begin
  select wm.workspace_id, w.tenant_id, wm.is_owner
    into v_workspace_id, v_tenant_id, v_is_owner
  from public.workspace_memberships wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = auth.uid() and wm.status = 'active' and w.status = 'active'
  order by wm.is_owner desc, wm.joined_at nulls last
  limit 1;

  if v_workspace_id is null then raise exception 'FINANCIAL_NO_WORKSPACE' using errcode = '42501'; end if;

  select coalesce(array_agg(distinct p.code) filter (where p.code is not null), '{}'::text[])
    into v_permissions
  from public.membership_roles mr
  join public.workspace_memberships wm on wm.id = mr.membership_id
  join public.role_permissions rp on rp.role_id = mr.role_id
  join public.permissions p on p.id = rp.permission_id and p.active = true
  where wm.user_id = auth.uid() and wm.workspace_id = v_workspace_id;

  v_module_enabled := private.workspace_has_module(v_workspace_id, 'financial');

  return jsonb_build_object(
    'workspaceId', v_workspace_id,
    'tenantId', v_tenant_id,
    'isOwner', v_is_owner,
    'permissions', v_permissions,
    'moduleEnabled', v_module_enabled,
    'canView', v_module_enabled and (
      v_is_owner or 'financial.view' = any(v_permissions)
      or 'financial.transactions.read' = any(v_permissions)
    )
  );
end;
$$;

-- 7. App motorista: toda chamada do app passa por private.current_driver()
create or replace function private.current_driver()
returns public.drivers
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
begin
  select *
    into v_driver
  from public.drivers
  where auth_user_id = auth.uid()
    and active = true
  limit 1;

  if not found then
    raise exception 'driver not found for authenticated user';
  end if;

  if not private.tenant_has_module(v_driver.tenant_id, 'driver_app') then
    raise exception 'MODULE_DISABLED:driver_app' using errcode = '42501';
  end if;

  return v_driver;
end;
$$;

-- 8. Leitura do que está liberado, para o app cliente e para os servidores
create or replace function public.get_workspace_entitlements(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tenant_id uuid;
  v_tenant_status text;
  v_workspace_status text;
  v_products text[];
  v_modules text[];
begin
  if p_workspace_id is null then
    raise exception 'WORKSPACE_REQUIRED' using errcode = '22023';
  end if;

  if not (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or private.is_platform_user()
    or private.is_workspace_member(p_workspace_id)
  ) then
    raise exception 'WORKSPACE_FORBIDDEN' using errcode = '42501';
  end if;

  select w.tenant_id, w.status, t.status
    into v_tenant_id, v_workspace_status, v_tenant_status
  from public.workspaces w
  join public.tenants t on t.id = w.tenant_id
  where w.id = p_workspace_id;

  if v_tenant_id is null then
    raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(p.code order by p.sort_order), '{}'::text[])
    into v_products
  from public.tenant_platform_products tp
  join public.platform_products p on p.id = tp.platform_product_id
  where tp.tenant_id = v_tenant_id
    and tp.enabled = true
    and p.active = true
    and tp.starts_at <= now()
    and (tp.ends_at is null or tp.ends_at > now());

  select coalesce(array_agg(m.code order by m.sort_order), '{}'::text[])
    into v_modules
  from public.modules m
  where private.workspace_has_module(p_workspace_id, m.code);

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'tenantId', v_tenant_id,
    'tenantStatus', v_tenant_status,
    'workspaceStatus', v_workspace_status,
    'products', to_jsonb(v_products),
    'modules', to_jsonb(v_modules)
  );
end;
$$;

revoke all on function public.get_workspace_entitlements(uuid) from public, anon;
grant execute on function public.get_workspace_entitlements(uuid) to authenticated, service_role;

-- 9. Comandos do Master (somente service_role, com o ator validado e auditado)
create or replace function private.require_master_operator(p_actor_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not exists (
    select 1
    from public.platform_users
    where user_id = p_actor_user_id
      and active = true
      and platform_role in ('super_admin', 'operations')
  ) then
    raise exception 'ACTOR_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_master_operator(uuid) from public, anon, authenticated;

create or replace function public.master_set_tenant_product(
  p_tenant_id uuid,
  p_product_code text,
  p_enabled boolean,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_product public.platform_products;
  v_old jsonb;
  v_new public.tenant_platform_products;
begin
  perform private.require_master_operator(p_actor_user_id);

  if p_enabled is null then
    raise exception 'ENABLED_REQUIRED' using errcode = '22023';
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_product
  from public.platform_products
  where code = p_product_code
    and active = true;

  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select to_jsonb(tp) into v_old
  from public.tenant_platform_products tp
  where tp.tenant_id = p_tenant_id
    and tp.platform_product_id = v_product.id
  for update;

  insert into public.tenant_platform_products (tenant_id, platform_product_id, enabled, starts_at, created_by)
  values (p_tenant_id, v_product.id, p_enabled, now(), p_actor_user_id)
  on conflict (tenant_id, platform_product_id) do update
  set
    enabled = excluded.enabled,
    ends_at = case when excluded.enabled then null else tenant_platform_products.ends_at end
  returning * into v_new;

  insert into public.audit_logs (
    actor_user_id,
    tenant_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    metadata
  )
  values (
    p_actor_user_id,
    p_tenant_id,
    case when p_enabled then 'tenant.product.enabled' else 'tenant.product.disabled' end,
    'tenant_platform_product',
    v_new.id,
    v_old,
    to_jsonb(v_new),
    jsonb_build_object('product_code', p_product_code, 'source', 'frotak-master')
  );

  return jsonb_build_object(
    'tenantId', p_tenant_id,
    'productCode', p_product_code,
    'enabled', v_new.enabled
  );
end;
$$;

create or replace function public.master_set_tenant_module(
  p_tenant_id uuid,
  p_module_code text,
  p_enabled boolean,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_module public.modules;
  v_workspace record;
  v_old jsonb;
  v_new public.workspace_modules;
  v_count integer := 0;
begin
  perform private.require_master_operator(p_actor_user_id);

  if p_enabled is null then
    raise exception 'ENABLED_REQUIRED' using errcode = '22023';
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_module
  from public.modules
  where code = p_module_code
    and active = true;

  if not found then
    raise exception 'MODULE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_module.is_core and not p_enabled then
    raise exception 'CORE_MODULE_REQUIRED' using errcode = '23514';
  end if;

  for v_workspace in
    select id
    from public.workspaces
    where tenant_id = p_tenant_id
      and status <> 'archived'
    order by is_default desc, created_at
  loop
    v_old := null;

    select to_jsonb(wm) into v_old
    from public.workspace_modules wm
    where wm.workspace_id = v_workspace.id
      and wm.module_id = v_module.id
    for update;

    insert into public.workspace_modules (
      workspace_id,
      module_id,
      enabled,
      source,
      starts_at,
      created_by
    )
    values (v_workspace.id, v_module.id, p_enabled, 'manual', now(), p_actor_user_id)
    on conflict (workspace_id, module_id) do update
    set
      enabled = excluded.enabled,
      source = 'manual',
      expires_at = case when excluded.enabled then null else workspace_modules.expires_at end
    returning * into v_new;

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
      p_tenant_id,
      v_workspace.id,
      case when p_enabled then 'tenant.module.enabled' else 'tenant.module.disabled' end,
      'workspace_module',
      v_new.id,
      v_old,
      to_jsonb(v_new),
      jsonb_build_object('module_code', p_module_code, 'source', 'frotak-master')
    );

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'TENANT_HAS_NO_WORKSPACE' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'tenantId', p_tenant_id,
    'moduleCode', p_module_code,
    'enabled', p_enabled,
    'workspacesUpdated', v_count
  );
end;
$$;

revoke all on function public.master_set_tenant_product(uuid, text, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.master_set_tenant_module(uuid, text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.master_set_tenant_product(uuid, text, boolean, uuid)
  to service_role;
grant execute on function public.master_set_tenant_module(uuid, text, boolean, uuid)
  to service_role;

-- 10. Uso por cliente para o painel do Master (contagens reais, uma consulta só)
create or replace function public.master_tenant_usage()
returns table (
  tenant_id uuid,
  vehicles bigint,
  vehicles_in_route bigint,
  vehicles_in_maintenance bigint,
  vehicles_broken bigint,
  drivers bigint,
  trailers bigint,
  senders bigint,
  recipients bigint,
  products bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    t.id,
    coalesce(v.total, 0),
    coalesce(v.in_route, 0),
    coalesce(v.in_maintenance, 0),
    coalesce(v.broken, 0),
    (select count(*) from public.drivers d where d.tenant_id = t.id and d.active),
    (select count(*) from public.trailers tr where tr.tenant_id = t.id),
    (select count(*) from public.senders s where s.tenant_id = t.id),
    (select count(*) from public.recipients r where r.tenant_id = t.id),
    (select count(*) from public.products p where p.tenant_id = t.id)
  from public.tenants t
  left join lateral (
    select
      count(*) as total,
      count(*) filter (where vh.status like 'rota-%') as in_route,
      count(*) filter (where vh.status = 'manutencao') as in_maintenance,
      count(*) filter (where vh.status = 'parado-quebrado') as broken
    from public.vehicles vh
    where vh.tenant_id = t.id
  ) v on true;
$$;

revoke all on function public.master_tenant_usage() from public, anon, authenticated;
grant execute on function public.master_tenant_usage() to service_role;
