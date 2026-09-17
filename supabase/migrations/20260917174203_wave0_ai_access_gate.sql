-- Frotak Wave 0 — gate de autenticacao, tenant, permissao e rate limit da Frotak IA.

create table if not exists public.ai_rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_kind text not null,
  requested_at timestamptz not null default now(),
  constraint ai_rate_limit_events_kind_chk check (request_kind in ('chat', 'live_token'))
);

create index if not exists ai_rate_limit_events_user_requested_idx
  on public.ai_rate_limit_events(user_id, requested_at desc);
create index if not exists ai_rate_limit_events_tenant_requested_idx
  on public.ai_rate_limit_events(tenant_id, requested_at desc);

alter table public.ai_rate_limit_events enable row level security;
revoke all on table public.ai_rate_limit_events from public, anon, authenticated;

create or replace function public.authorize_frotak_ai(
  p_kind text default 'chat'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
  v_tenant_id uuid;
  v_limit integer;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'AI_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_kind not in ('chat', 'live_token') then
    raise exception 'AI_REQUEST_KIND_INVALID' using errcode = '22023';
  end if;

  select wm.workspace_id, w.tenant_id
    into v_workspace_id, v_tenant_id
  from public.workspace_memberships wm
  join public.workspaces w on w.id = wm.workspace_id
  join public.tenants t on t.id = w.tenant_id
  where wm.user_id = auth.uid()
    and wm.status = 'active'
    and w.status = 'active'
    and t.status in ('active', 'trial')
  order by w.is_default desc, wm.created_at asc
  limit 1;

  if v_workspace_id is null or v_tenant_id is null then
    raise exception 'AI_TENANT_ACCESS_REQUIRED' using errcode = '42501';
  end if;

  if not private.has_permission(v_workspace_id, 'ai.assistant.use') then
    raise exception 'AI_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  -- Live cria sessoes de maior custo; chat recebe uma janela mais ampla.
  v_limit := case when p_kind = 'live_token' then 5 else 30 end;

  -- Serializa o contador por usuario para impedir duas requisicoes paralelas
  -- de ultrapassarem o limite na mesma janela.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':frotak-ai:' || p_kind, 0));

  select count(*)
    into v_count
  from public.ai_rate_limit_events
  where user_id = auth.uid()
    and request_kind = p_kind
    and requested_at >= now() - interval '1 minute';

  if v_count >= v_limit then
    raise exception 'AI_RATE_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  insert into public.ai_rate_limit_events (
    user_id, tenant_id, workspace_id, request_kind
  ) values (
    auth.uid(), v_tenant_id, v_workspace_id, p_kind
  );

  -- Limpeza oportunista; nao e requisito para autorizacao.
  delete from public.ai_rate_limit_events
  where requested_at < now() - interval '1 day';

  return jsonb_build_object(
    'userId', auth.uid(),
    'tenantId', v_tenant_id,
    'workspaceId', v_workspace_id,
    'kind', p_kind,
    'remaining', greatest(v_limit - v_count - 1, 0)
  );
end;
$$;

revoke all on function public.authorize_frotak_ai(text) from public, anon, authenticated;
grant execute on function public.authorize_frotak_ai(text) to authenticated;

comment on function public.authorize_frotak_ai(text) is
  'Autoriza Frotak IA somente para usuario autenticado com tenant/workspace ativo, modulo/permissao ai.assistant.use e rate limit por usuario.';
