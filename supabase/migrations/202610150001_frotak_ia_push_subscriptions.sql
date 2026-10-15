-- Frotak IA: aparelhos que recebem aviso por push (veiculos sem viagem) e o agendador diario.
-- A tabela e gravada so pelo servidor (service role); o usuario so le e apaga as proprias linhas.

begin;

-- Ja existem no banco pela integracao Sascar; repetidos aqui de forma idempotente.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.integration_cron_settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.integration_cron_settings enable row level security;

create table if not exists public.frotak_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint frotak_push_subscriptions_endpoint_key unique (endpoint),
  constraint frotak_push_subscriptions_endpoint_https_chk check (endpoint like 'https://%')
);

create index if not exists frotak_push_subscriptions_workspace_idx
  on public.frotak_push_subscriptions (workspace_id);
create index if not exists frotak_push_subscriptions_user_idx
  on public.frotak_push_subscriptions (user_id);

drop trigger if exists frotak_push_subscriptions_touch_updated_at on public.frotak_push_subscriptions;
create trigger frotak_push_subscriptions_touch_updated_at before update on public.frotak_push_subscriptions
  for each row execute function public.touch_updated_at();

alter table public.frotak_push_subscriptions enable row level security;

revoke all on public.frotak_push_subscriptions from anon;
revoke insert, update on public.frotak_push_subscriptions from authenticated;

drop policy if exists frotak_push_subscriptions_own_select on public.frotak_push_subscriptions;
create policy frotak_push_subscriptions_own_select on public.frotak_push_subscriptions
for select to authenticated
using (user_id = auth.uid());

drop policy if exists frotak_push_subscriptions_own_delete on public.frotak_push_subscriptions;
create policy frotak_push_subscriptions_own_delete on public.frotak_push_subscriptions
for delete to authenticated
using (user_id = auth.uid());

-- Agendador: mesmo padrao do Sascar (pg_cron + pg_net chamando o app).
-- Configurar em integration_cron_settings:
--   frotak_push_url   = https://<dominio>/api/frotak-ia/push-dispatch
--   frotak_push_token = mesmo valor de FROTAK_PUSH_CRON_TOKEN no deploy
create or replace function public.invoke_frotak_push_cron()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_token text;
  v_request_id bigint;
begin
  select value into v_url from public.integration_cron_settings where key = 'frotak_push_url';
  select value into v_token from public.integration_cron_settings where key = 'frotak_push_token';

  if v_url is null or v_token is null then
    raise notice 'Frotak push cron not configured. Set frotak_push_url and frotak_push_token in integration_cron_settings.';
    return null;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-frotak-push-token', v_token
    ),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 55000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.invoke_frotak_push_cron() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'frotak-push-veiculos-parados') then
    perform cron.unschedule('frotak-push-veiculos-parados');
  end if;
end;
$$;

-- Todo dia as 11:00 UTC = 08:00 em Brasilia.
select cron.schedule(
  'frotak-push-veiculos-parados',
  '0 11 * * *',
  $$select public.invoke_frotak_push_cron();$$
);

commit;
