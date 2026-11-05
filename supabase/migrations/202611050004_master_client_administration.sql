-- Administração do cliente pelo Master: editar o cadastro, mudar a situação e o endereço.
-- As funções valem no Central e no banco de cada cliente: com banco por cliente, o Master aplica
-- no banco do cliente primeiro (pelo agente) e depois no Central. Com banco único, só no Central.

begin;

-- O endereço deixa de ser o identificador. O identificador (slug) nomeia banco, containers e rotas
-- e nunca muda; o subdomínio e os domínios próprios podem mudar.
alter table public.client_databases add column if not exists subdomain text;
alter table public.client_databases
  add column if not exists custom_domains text[] not null default '{}'::text[];
update public.client_databases set subdomain = slug where subdomain is null;

-- master_register_client não informa o subdomínio: o primeiro é o próprio identificador.
create or replace function private.client_databases_default_subdomain()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.subdomain := coalesce(new.subdomain, new.slug);
  return new;
end;
$$;
drop trigger if exists client_databases_default_subdomain on public.client_databases;
create trigger client_databases_default_subdomain
  before insert on public.client_databases
  for each row execute function private.client_databases_default_subdomain();

alter table public.client_databases alter column subdomain set not null;
create unique index if not exists client_databases_subdomain_uidx
  on public.client_databases (subdomain);

create or replace function public.master_update_client_profile(
  p_tenant_id uuid,
  p_legal_name text,
  p_trade_name text,
  p_cnpj text,
  p_max_vehicles integer,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_legal text := btrim(coalesce(p_legal_name, ''));
  v_trade text := nullif(btrim(coalesce(p_trade_name, '')), '');
begin
  perform private.require_master_operator(p_actor_user_id);

  if v_legal = '' then
    raise exception 'LEGAL_NAME_REQUIRED' using errcode = '22023';
  end if;
  if p_cnpj is null or p_cnpj !~ '^[0-9]{14}$' then
    raise exception 'CNPJ_INVALID' using errcode = '22023';
  end if;
  if p_max_vehicles is null or p_max_vehicles < 1 then
    raise exception 'MAX_VEHICLES_INVALID' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'legalName', legal_name, 'tradeName', trade_name, 'cnpj', cnpj,
    'maxVehicles', settings -> 'maxVehicles'
  )
  into v_old
  from public.tenants
  where id = p_tenant_id
  for update;
  if v_old is null then
    raise exception 'TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.tenants
  set legal_name = v_legal,
      trade_name = v_trade,
      cnpj = p_cnpj,
      settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('maxVehicles', p_max_vehicles)
  where id = p_tenant_id;

  update public.workspaces
  set name = coalesce(v_trade, v_legal),
      settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('maxVehicles', p_max_vehicles)
  where tenant_id = p_tenant_id and is_default;

  update public.workspace_modules wm
  set limits = coalesce(wm.limits, '{}'::jsonb) || jsonb_build_object('max_vehicles', p_max_vehicles)
  from public.modules m, public.workspaces w
  where wm.module_id = m.id
    and m.code = 'fleet_core'
    and wm.workspace_id = w.id
    and w.tenant_id = p_tenant_id;

  v_new := jsonb_build_object(
    'legalName', v_legal, 'tradeName', v_trade, 'cnpj', p_cnpj, 'maxVehicles', p_max_vehicles
  );
  insert into public.audit_logs (
    actor_user_id, tenant_id, action, entity_type, entity_id, old_data, new_data, metadata
  )
  values (
    p_actor_user_id, p_tenant_id, 'master.client_profile_updated', 'tenant', p_tenant_id,
    v_old, v_new, jsonb_build_object('source', 'master')
  );
  return v_new;
end;
$$;

-- Suspender bloqueia login e API pelos módulos (workspace_has_module só libera active e trial);
-- os dados ficam.
create or replace function public.master_set_client_status(
  p_tenant_id uuid,
  p_status text,
  p_actor_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_old text;
begin
  perform private.require_master_operator(p_actor_user_id);

  if p_status not in ('active', 'trial', 'suspended', 'cancelled') then
    raise exception 'STATUS_INVALID' using errcode = '22023';
  end if;

  select status into v_old from public.tenants where id = p_tenant_id for update;
  if v_old is null then
    raise exception 'TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.tenants set status = p_status where id = p_tenant_id;
  insert into public.audit_logs (
    actor_user_id, tenant_id, action, entity_type, entity_id, old_data, new_data, metadata
  )
  values (
    p_actor_user_id, p_tenant_id, 'master.client_status_changed', 'tenant', p_tenant_id,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status),
    jsonb_build_object('source', 'master')
  );
  return p_status;
end;
$$;

-- Só no Central: o agente é quem roteia os endereços; aqui fica o cadastro deles.
create or replace function public.master_set_client_addresses(
  p_tenant_id uuid,
  p_subdomain text,
  p_client_url text,
  p_custom_domains text[],
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_old jsonb;
begin
  perform private.require_master_operator(p_actor_user_id);

  if p_subdomain is null or p_subdomain !~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$' then
    raise exception 'SUBDOMAIN_INVALID' using errcode = '22023';
  end if;

  select jsonb_build_object('subdomain', subdomain, 'clientUrl', client_url, 'domains', custom_domains)
  into v_old
  from public.client_databases
  where tenant_id = p_tenant_id
  for update;
  if v_old is null then
    raise exception 'CLIENT_DATABASE_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.client_databases
  set subdomain = p_subdomain,
      client_url = p_client_url,
      custom_domains = coalesce(p_custom_domains, '{}'::text[]),
      updated_at = now()
  where tenant_id = p_tenant_id;

  insert into public.audit_logs (
    actor_user_id, tenant_id, action, entity_type, entity_id, old_data, new_data, metadata
  )
  values (
    p_actor_user_id, p_tenant_id, 'master.client_address_changed', 'tenant', p_tenant_id, v_old,
    jsonb_build_object(
      'subdomain', p_subdomain, 'clientUrl', p_client_url,
      'domains', coalesce(p_custom_domains, '{}'::text[])
    ),
    jsonb_build_object('source', 'master')
  );
end;
$$;

revoke all on function public.master_update_client_profile(uuid, text, text, text, integer, uuid)
  from public, anon, authenticated;
revoke all on function public.master_set_client_status(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.master_set_client_addresses(uuid, text, text, text[], uuid)
  from public, anon, authenticated;
grant execute on function public.master_update_client_profile(uuid, text, text, text, integer, uuid)
  to service_role;
grant execute on function public.master_set_client_status(uuid, text, uuid) to service_role;
grant execute on function public.master_set_client_addresses(uuid, text, text, text[], uuid)
  to service_role;

commit;
