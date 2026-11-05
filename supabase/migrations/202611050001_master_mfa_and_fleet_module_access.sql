-- Fecha dois caminhos diretos pela API do Supabase:
-- 1. A equipe FrotaK le dados de todos os clientes; agora isso exige sessao com 2FA (aal2).
--    Sem esta regra, quem roubasse a senha de um operador leria tudo pela API, sem passar pelo
--    Master. Publicar junto com o Master que pede o codigo, senao a equipe perde o acesso.
-- 2. Sem o modulo base da frota (TMS desligado), as tabelas operacionais deixam de responder.
--    Hoje so o aplicativo bloqueava as telas.
-- Suspensao, financeiro e app do motorista ja tinham a propria checagem e nao mudam.

begin;

create or replace function private.is_platform_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_active_profile()
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (
      select 1
      from public.platform_users
      where platform_users.user_id = auth.uid()
        and platform_users.active = true
    );
$$;

-- Lista, de uma vez, os clientes do usuario com a frota liberada. Assim as policies conferem uma
-- lista calculada uma vez por consulta, em vez de repetir os joins a cada linha.
create or replace function private.fleet_enabled_tenants()
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(array_agg(distinct w.tenant_id), '{}'::uuid[])
  from public.workspace_memberships wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = auth.uid()
    and wm.status = 'active'
    and private.workspace_has_module(w.id, 'fleet_core');
$$;

revoke all on function private.fleet_enabled_tenants() from public, anon;
grant execute on function private.fleet_enabled_tenants() to authenticated;

-- Tambem vale para as RPCs da frota e para os arquivos do Storage, que chamam esta funcao.
create or replace function private.can_access_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.is_platform_user()
    or p_tenant_id = any (private.fleet_enabled_tenants());
$$;

-- Policies simples por tenant: mesma regra, avaliada uma vez por consulta.
do $$
declare
  v_policy record;
  v_rule constant text :=
    '((select private.is_platform_user()) '
    || 'or tenant_id = any ((select private.fleet_enabled_tenants())::uuid[]))';
begin
  for v_policy in
    select tablename, policyname, cmd
    from pg_policies
    where schemaname = 'public'
      and qual = 'private.can_access_tenant(tenant_id)'
  loop
    if v_policy.cmd in ('ALL', 'UPDATE') then
      execute format(
        'alter policy %I on public.%I using (%s) with check (%s)',
        v_policy.policyname, v_policy.tablename, v_rule, v_rule
      );
    else
      execute format(
        'alter policy %I on public.%I using (%s)',
        v_policy.policyname, v_policy.tablename, v_rule
      );
    end if;
  end loop;
end;
$$;

commit;
