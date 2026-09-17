create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  channel text not null,
  provider text not null default 'gemini',
  model text,
  outcome text not null default 'started',
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_usage_events_channel_chk
    check (channel in ('chat', 'live_token')),
  constraint ai_usage_events_outcome_chk
    check (outcome in ('started', 'succeeded', 'failed', 'rate_limited')),
  constraint ai_usage_events_metadata_object_chk
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.ai_usage_events is
  'Server-side audit and rate-limit ledger for Frotak AI provider usage. Direct client access is forbidden.';

create index ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);
create index ai_usage_events_tenant_created_idx
  on public.ai_usage_events (tenant_id, created_at desc);
create index ai_usage_events_workspace_channel_created_idx
  on public.ai_usage_events (workspace_id, channel, created_at desc);

alter table public.ai_usage_events enable row level security;

revoke all on table public.ai_usage_events from public, anon, authenticated;
grant select, insert, update on table public.ai_usage_events to service_role;

create or replace function public.start_ai_usage_event(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_channel text,
  p_provider text,
  p_model text,
  p_limit_per_minute integer
)
returns table(event_id uuid, allowed boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
  v_event_id uuid;
begin
  if p_channel not in ('chat', 'live_token') then
    raise exception 'Invalid AI channel';
  end if;

  if p_limit_per_minute < 1 or p_limit_per_minute > 1000 then
    raise exception 'Invalid AI rate limit';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_channel, 0)
  );

  select count(*)::integer
    into v_count
  from public.ai_usage_events
  where user_id = p_user_id
    and channel = p_channel
    and outcome <> 'rate_limited'
    and created_at >= now() - interval '1 minute';

  if v_count >= p_limit_per_minute then
    insert into public.ai_usage_events (
      tenant_id,
      workspace_id,
      user_id,
      channel,
      provider,
      model,
      outcome,
      completed_at,
      metadata
    ) values (
      p_tenant_id,
      p_workspace_id,
      p_user_id,
      p_channel,
      coalesce(nullif(btrim(p_provider), ''), 'unknown'),
      nullif(btrim(p_model), ''),
      'rate_limited',
      now(),
      jsonb_build_object('limit_per_minute', p_limit_per_minute)
    )
    returning id into v_event_id;

    return query select v_event_id, false;
    return;
  end if;

  insert into public.ai_usage_events (
    tenant_id,
    workspace_id,
    user_id,
    channel,
    provider,
    model,
    outcome
  ) values (
    p_tenant_id,
    p_workspace_id,
    p_user_id,
    p_channel,
    coalesce(nullif(btrim(p_provider), ''), 'unknown'),
    nullif(btrim(p_model), ''),
    'started'
  )
  returning id into v_event_id;

  return query select v_event_id, true;
end;
$$;

create or replace function public.finish_ai_usage_event(
  p_event_id uuid,
  p_outcome text,
  p_error_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_outcome not in ('succeeded', 'failed') then
    raise exception 'Invalid AI outcome';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'AI metadata must be a JSON object';
  end if;

  update public.ai_usage_events
  set
    outcome = p_outcome,
    error_code = nullif(btrim(p_error_code), ''),
    metadata = metadata || p_metadata,
    completed_at = now()
  where id = p_event_id
    and outcome = 'started';
end;
$$;

revoke all on function public.start_ai_usage_event(uuid, uuid, uuid, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.finish_ai_usage_event(uuid, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.start_ai_usage_event(uuid, uuid, uuid, text, text, text, integer)
  to service_role;
grant execute on function public.finish_ai_usage_event(uuid, text, text, jsonb)
  to service_role;
