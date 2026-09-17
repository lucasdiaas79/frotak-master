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
