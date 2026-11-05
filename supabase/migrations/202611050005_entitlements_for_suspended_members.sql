-- Empresa suspensa: o membro continua lendo a situação da própria empresa, para o app mostrar
-- "Acesso da empresa suspenso" em vez de uma tela vazia. Os módulos continuam vazios, porque
-- private.workspace_has_module só libera tenants active e trial; nenhum dado da operação abre.
-- Antes, is_workspace_member (que exige tenant ativo) recusava a leitura com WORKSPACE_FORBIDDEN.

begin;

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
    or (
      private.is_active_profile()
      and exists (
        select 1
        from public.workspace_memberships wm
        where wm.workspace_id = p_workspace_id
          and wm.user_id = auth.uid()
          and wm.status = 'active'
      )
    )
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

commit;
