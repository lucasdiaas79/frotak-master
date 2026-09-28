begin;

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
  v_last_request_id bigint;
  v_integration record;
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

  for v_integration in
    select workspace_id
    from public.workspace_integrations
    where provider = 'sascar'
      and status = 'active'
    order by workspace_id
  loop
    select net.http_post(
      url := v_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sascar-sync-token', v_sync_token
      ),
      body := jsonb_build_object(
        'workspaceId', v_integration.workspace_id,
        'source', 'cron',
        'quantity', 3000,
        'forceFull', false
      ),
      timeout_milliseconds := 55000
    )
    into v_request_id;

    v_last_request_id := v_request_id;
  end loop;

  return v_last_request_id;
end;
$$;

revoke all on function public.invoke_sascar_sync_cron() from public, anon, authenticated;

comment on function public.invoke_sascar_sync_cron() is
  'Dispatches one isolated Sascar synchronization request per active workspace integration.';

commit;
