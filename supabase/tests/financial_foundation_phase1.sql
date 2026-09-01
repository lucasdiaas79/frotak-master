begin;

do $$
declare
  v_table text;
  v_rls boolean;
  v_financial_documents bigint;
begin
  foreach v_table in array array[
    'freights', 'business_partners', 'business_partner_roles', 'legacy_partner_links',
    'chart_of_accounts', 'cost_centers', 'financial_documents',
    'financial_installments', 'financial_allocations', 'accounting_periods',
    'journal_entries', 'journal_lines', 'financial_audit_events'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'missing financial foundation table: %', v_table;
    end if;
    select c.relrowsecurity into v_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_table;
    if not v_rls then raise exception 'RLS is disabled on %', v_table; end if;
  end loop;

  select count(*) into v_financial_documents from public.financial_documents;
  if v_financial_documents <> 0 then
    raise exception 'phase 1 must not generate financial documents';
  end if;

  if exists (
    select 1 from public.freight_history fh
    where fh.freight_id is not null
      and not exists (select 1 from public.freights f where f.id = fh.freight_id)
  ) then raise exception 'historical freight UUID was not preserved'; end if;

  if exists (
    select 1 from public.vehicles v
    where v.current_freight_id is not null
      and not exists (select 1 from public.freights f where f.id = v.current_freight_id)
  ) then raise exception 'active freight UUID was not preserved'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'financial_documents_source_idempotency_uidx'
  ) then raise exception 'financial source idempotency index is missing'; end if;

  if (select count(distinct dre_group) from public.chart_of_accounts where dre_group is not null) < 8 then
    raise exception 'DRE account groups are incomplete';
  end if;
end $$;

rollback;

