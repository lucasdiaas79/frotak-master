-- Frotak - Quais modulos da operacao com embarcador estao ligados num workspace.
--
-- O banco de producao ainda nao tem o catalogo do Master (get_workspace_entitlements).
-- Sem ele, a central libera todo modulo ("legado"). Os modulos da operacao sao opt-in:
-- a central pergunta aqui e so mostra a tela "Operacao do dia" onde estao ligados.

begin;

create or replace function public.get_driver_ops_modules(p_workspace_id uuid)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(array_agg(m.code order by m.code), array[]::text[])
  from public.workspaces w
  join public.workspace_modules wm on wm.workspace_id = w.id
  join public.modules m on m.id = wm.module_id
  where w.id = p_workspace_id
    and private.can_access_tenant(w.tenant_id)
    and m.code in ('driver_journey', 'driver_safety', 'fuel_control', 'delivery_routes', 'driver_performance')
    and m.active
    and wm.enabled
    and (wm.starts_at is null or wm.starts_at <= now())
    and (wm.expires_at is null or wm.expires_at > now());
$$;

revoke all on function public.get_driver_ops_modules(uuid) from public, anon;
grant execute on function public.get_driver_ops_modules(uuid) to authenticated, service_role;

commit;
