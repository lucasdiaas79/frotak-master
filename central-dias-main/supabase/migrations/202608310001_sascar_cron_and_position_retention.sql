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

create table if not exists public.integration_locks (
  key text primary key,
  locked_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists integration_locks_touch_updated_at on public.integration_locks;
create trigger integration_locks_touch_updated_at before update on public.integration_locks
  for each row execute function public.touch_updated_at();

alter table public.integration_locks enable row level security;

create table if not exists public.integration_cron_settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists integration_cron_settings_touch_updated_at on public.integration_cron_settings;
create trigger integration_cron_settings_touch_updated_at before update on public.integration_cron_settings
  for each row execute function public.touch_updated_at();

alter table public.integration_cron_settings enable row level security;

create or replace function public.acquire_integration_lock(
  p_key text,
  p_ttl_seconds integer default 55
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acquired boolean := false;
begin
  insert into public.integration_locks (key, locked_until)
  values (p_key, now() + make_interval(secs => greatest(p_ttl_seconds, 1)))
  on conflict (key) do update
    set locked_until = excluded.locked_until,
        updated_at = now()
    where public.integration_locks.locked_until < now()
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_integration_lock(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.integration_locks
  set locked_until = now(),
      updated_at = now()
  where key = p_key;
end;
$$;

create or replace function public.purge_old_vehicle_positions(
  p_retention interval default interval '24 hours'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.vehicle_positions
  where recorded_at < now() - p_retention;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.invoke_sascar_sync_cron()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_function_url text;
  v_sync_token text;
  v_request_id bigint;
begin
  select value into v_function_url
  from public.integration_cron_settings
  where key = 'sascar_function_url';

  select value into v_sync_token
  from public.integration_cron_settings
  where key = 'sascar_sync_token';

  if v_function_url is null or v_sync_token is null then
    raise notice 'Sascar cron not configured. Set sascar_function_url and sascar_sync_token in integration_cron_settings.';
    return null;
  end if;

  select net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sascar-sync-token', v_sync_token
    ),
    body := jsonb_build_object(
      'source', 'cron',
      'quantity', 3000,
      'forceFull', false
    ),
    timeout_milliseconds := 55000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on public.integration_locks from anon, authenticated;
revoke all on public.integration_cron_settings from anon, authenticated;
revoke all on function public.acquire_integration_lock(text, integer) from anon, authenticated;
revoke all on function public.release_integration_lock(text) from anon, authenticated;
revoke all on function public.purge_old_vehicle_positions(interval) from anon, authenticated;
revoke all on function public.invoke_sascar_sync_cron() from anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sascar-sync-every-minute') then
    perform cron.unschedule('sascar-sync-every-minute');
  end if;

  if exists (select 1 from cron.job where jobname = 'vehicle-positions-retention-hourly') then
    perform cron.unschedule('vehicle-positions-retention-hourly');
  end if;
end;
$$;

select cron.schedule(
  'sascar-sync-every-minute',
  '* * * * *',
  $$select public.invoke_sascar_sync_cron();$$
);

select cron.schedule(
  'vehicle-positions-retention-hourly',
  '7 * * * *',
  $$select public.purge_old_vehicle_positions(interval '24 hours');$$
);
