begin;

do $$
declare
  v_definition text;
  v_mismatch_blocked boolean := false;
begin
  if to_regprocedure('public.save_financial_document_with_recurring(jsonb)') is null then
    raise exception 'missing save_financial_document_with_recurring(jsonb)';
  end if;

  if to_regprocedure('public.run_financial_recurring_cron(date)') is null then
    raise exception 'missing run_financial_recurring_cron(date)';
  end if;

  select pg_get_functiondef('public.save_financial_document_with_recurring(jsonb)'::regprocedure)
  into v_definition;

  if v_definition not like '%FINANCIAL_RECURRING_WORKSPACE_MISMATCH%' then
    raise exception 'save_financial_document_with_recurring does not fail closed on cross-workspace payloads';
  end if;

  if v_definition not like '%v_workspace_id <> v_recurring_workspace_id%' then
    raise exception 'save_financial_document_with_recurring does not compare document.workspaceId and recurring.workspaceId';
  end if;

  begin
    perform public.save_financial_document_with_recurring(
      jsonb_build_object(
        'document', jsonb_build_object('workspaceId', '00000000-0000-4000-8000-000000000001'),
        'recurring', jsonb_build_object('workspaceId', '00000000-0000-4000-8000-000000000002')
      )
    );
  exception when others then
    if sqlerrm like '%FINANCIAL_RECURRING_WORKSPACE_MISMATCH%' then
      v_mismatch_blocked := true;
    end if;
  end;

  if not v_mismatch_blocked then
    raise exception 'cross-workspace recurring payload was not blocked before creation';
  end if;
end $$;

rollback;
