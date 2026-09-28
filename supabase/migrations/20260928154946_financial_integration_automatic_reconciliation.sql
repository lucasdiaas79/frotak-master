-- Reprocessa automaticamente fatos operacionais que ainda nao chegaram ao
-- Financeiro. A fila existente permanece idempotente pela chave unica da
-- operacao e cada job conserva seu proprio historico de tentativas.

create index if not exists financial_integration_jobs_due_retry_idx
  on public.financial_integration_jobs (
    (coalesce(next_retry_at, detected_at)),
    detected_at,
    id
  )
  where status in ('pending', 'failed');

create or replace function private.run_financial_integration_reconciliation(
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_job record;
  v_status text;
  v_scanned integer := 0;
  v_processed integer := 0;
  v_failed integer := 0;
  v_review integer := 0;
  v_exhausted integer := 0;
  v_review_total integer := 0;
begin
  -- Impede sobreposicao entre duas execucoes do cron. O SKIP LOCKED abaixo
  -- tambem protege contra um reprocessamento administrativo simultaneo.
  if not pg_try_advisory_xact_lock(hashtextextended('frotak-financial-integration-reconciliation', 0)) then
    return jsonb_build_object(
      'skipped', true,
      'reason', 'already_running',
      'scanned', 0,
      'processed', 0,
      'failed', 0,
      'needsReview', 0
    );
  end if;

  for v_job in
    select job.id
    from public.financial_integration_jobs job
    where job.status in ('pending', 'failed')
      and job.attempts < job.max_attempts
      and (job.next_retry_at is null or job.next_retry_at <= now())
    order by coalesce(job.next_retry_at, job.detected_at), job.detected_at, job.id
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
    for update skip locked
  loop
    v_scanned := v_scanned + 1;
    v_status := private.process_financial_integration_job(v_job.id);

    if v_status = 'processed' then
      v_processed := v_processed + 1;
    elsif v_status = 'needs_review' then
      v_review := v_review + 1;
    elsif v_status = 'failed' then
      v_failed := v_failed + 1;
    end if;
  end loop;

  select count(*)::integer
    into v_exhausted
  from public.financial_integration_jobs
  where status = 'failed'
    and attempts >= max_attempts;

  select count(*)::integer
    into v_review_total
  from public.financial_integration_jobs
  where status = 'needs_review';

  return jsonb_build_object(
    'skipped', false,
    'scanned', v_scanned,
    'processed', v_processed,
    'failed', v_failed,
    'needsReview', v_review,
    'exhaustedTotal', v_exhausted,
    'needsReviewTotal', v_review_total,
    'ranAt', now()
  );
end;
$$;

revoke all on function private.run_financial_integration_reconciliation(integer)
  from public, anon, authenticated;

create or replace function public.get_financial_integration_health(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_retrying integer;
  v_exhausted integer;
  v_review integer;
  v_oldest_attention timestamptz;
begin
  if auth.uid() is null
    or not coalesce(private.can_read_financial_workspace(p_workspace_id), false) then
    raise exception 'FINANCIAL_ACCESS_DENIED';
  end if;

  if not exists (
    select 1
    from public.workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.status = 'active'
  ) then
    raise exception 'FINANCIAL_INVALID_WORKSPACE';
  end if;

  select
    count(*) filter (
      where status in ('pending', 'failed') and attempts < max_attempts
    )::integer,
    count(*) filter (
      where status = 'failed' and attempts >= max_attempts
    )::integer,
    count(*) filter (where status = 'needs_review')::integer,
    min(detected_at) filter (
      where status = 'needs_review'
        or (status = 'failed' and attempts >= max_attempts)
    )
    into v_retrying, v_exhausted, v_review, v_oldest_attention
  from public.financial_integration_jobs
  where workspace_id = p_workspace_id;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'retrying', coalesce(v_retrying, 0),
    'exhausted', coalesce(v_exhausted, 0),
    'needsReview', coalesce(v_review, 0),
    'requiresAttention', coalesce(v_exhausted, 0) + coalesce(v_review, 0),
    'oldestAttentionAt', v_oldest_attention
  );
end;
$$;

revoke all on function public.get_financial_integration_health(uuid)
  from public, anon;
grant execute on function public.get_financial_integration_health(uuid)
  to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and to_regnamespace('cron') is not null then
    perform cron.unschedule('financial-integrations-every-5-minutes')
    where exists (
      select 1
      from cron.job
      where jobname = 'financial-integrations-every-5-minutes'
    );

    perform cron.schedule(
      'financial-integrations-every-5-minutes',
      '*/5 * * * *',
      'select private.run_financial_integration_reconciliation(200);'
    );
  else
    raise warning 'pg_cron is unavailable; financial integration reconciliation was not scheduled';
  end if;
end $$;

comment on function private.run_financial_integration_reconciliation(integer) is
  'Reprocessa, de forma idempotente, jobs financeiros operacionais vencidos e ainda tentaveis.';

comment on function public.get_financial_integration_health(uuid) is
  'Resumo isolado por workspace dos jobs financeiros automaticos que exigem acompanhamento.';
