-- Refinamento do retry da Fase 3.
-- Revisoes exigem correcao explicita; o processamento global nao as repete.

create or replace function private.enqueue_financial_integration(
  p_tenant_id uuid,
  p_workspace_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_source_event text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
begin
  insert into public.financial_integration_jobs (
    tenant_id, workspace_id, source_type, source_id, source_event, metadata
  ) values (
    p_tenant_id, p_workspace_id, p_source_type, p_source_id, p_source_event,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (tenant_id, source_type, source_id, source_event) do update set
    workspace_id = coalesce(excluded.workspace_id, public.financial_integration_jobs.workspace_id),
    metadata = public.financial_integration_jobs.metadata || excluded.metadata,
    status = case when public.financial_integration_jobs.status = 'processed'
      then 'processed' else 'pending' end,
    attempts = case when public.financial_integration_jobs.status = 'processed'
      then public.financial_integration_jobs.attempts else 0 end,
    last_error = case when public.financial_integration_jobs.status = 'processed'
      then public.financial_integration_jobs.last_error else null end,
    next_retry_at = null
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.save_financial_integration_settings(
  p_workspace_id uuid,
  p_default_receivable_due_days integer,
  p_default_payable_due_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_tenant_id uuid;
begin
  perform private.require_financial_permission(p_workspace_id, 'financial.settings.manage');
  if p_default_receivable_due_days is not null
    and p_default_receivable_due_days < 0 then
    raise exception 'FINANCIAL_INVALID_RECEIVABLE_DUE_DAYS';
  end if;
  if p_default_payable_due_days is not null
    and p_default_payable_due_days < 0 then
    raise exception 'FINANCIAL_INVALID_PAYABLE_DUE_DAYS';
  end if;
  select tenant_id into v_tenant_id from public.workspaces
  where id = p_workspace_id and status = 'active';
  if v_tenant_id is null then raise exception 'FINANCIAL_WORKSPACE_NOT_FOUND'; end if;

  insert into public.financial_integration_settings (
    tenant_id, workspace_id,
    default_receivable_due_days, default_payable_due_days
  ) values (
    v_tenant_id, p_workspace_id,
    p_default_receivable_due_days, p_default_payable_due_days
  )
  on conflict (workspace_id) do update set
    default_receivable_due_days = excluded.default_receivable_due_days,
    default_payable_due_days = excluded.default_payable_due_days,
    active = true;

  update public.financial_integration_jobs
  set status = 'pending', attempts = 0, next_retry_at = null, last_error = null
  where workspace_id = p_workspace_id
    and status = 'needs_review'
    and review_reasons <@ array['missing_due_policy']::text[];

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'defaultReceivableDueDays', p_default_receivable_due_days,
    'defaultPayableDueDays', p_default_payable_due_days
  );
end;
$$;

create or replace function public.process_financial_integrations(
  p_limit integer default 50,
  p_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
  v_job record;
  v_status text;
  v_processed integer := 0;
  v_failed integer := 0;
  v_review integer := 0;
begin
  select workspace_id into v_workspace_id
  from public.workspace_memberships
  where user_id = auth.uid() and status = 'active'
  order by is_owner desc, joined_at nulls last limit 1;
  if v_workspace_id is null then raise exception 'FINANCIAL_NO_WORKSPACE'; end if;
  perform private.require_financial_permission(v_workspace_id, 'financial.process_integrations');

  for v_job in
    select id from public.financial_integration_jobs
    where workspace_id = v_workspace_id
      and (p_job_id is null or id = p_job_id)
      and (
        (p_job_id is null and status in ('pending', 'failed'))
        or (p_job_id is not null and status in ('pending', 'failed', 'needs_review'))
      )
      and (status = 'needs_review' or attempts < max_attempts)
      and (next_retry_at is null or next_retry_at <= now() or p_job_id is not null)
    order by detected_at
    limit least(greatest(p_limit, 1), 200)
  loop
    v_status := private.process_financial_integration_job(v_job.id);
    if v_status = 'processed' then v_processed := v_processed + 1;
    elsif v_status = 'needs_review' then v_review := v_review + 1;
    elsif v_status = 'failed' then v_failed := v_failed + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'processed', v_processed, 'needsReview', v_review, 'failed', v_failed
  );
end;
$$;

revoke all on function private.enqueue_financial_integration(
  uuid, uuid, text, uuid, text, jsonb
) from public, anon, authenticated;
