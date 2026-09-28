-- Mantem lancamentos financeiros novos nas contas do modelo gerencial atual,
-- mesmo quando rotinas legadas ainda informam a numeracao anterior.

create or replace function private.normalize_financial_managerial_account()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_current_code text;
  v_target_code text;
  v_target_id uuid;
begin
  if new.chart_account_id is null then
    return new;
  end if;

  select coa.code
    into v_current_code
  from public.chart_of_accounts coa
  where coa.id = new.chart_account_id
    and coa.tenant_id = new.tenant_id;

  if v_current_code is null then
    return new;
  end if;

  v_target_code := private.frotak_managerial_code_alias(v_current_code);
  if v_target_code = v_current_code then
    return new;
  end if;

  select coa.id
    into v_target_id
  from public.chart_of_accounts coa
  where coa.tenant_id = new.tenant_id
    and coa.code = v_target_code
    and coa.active = true
  limit 1;

  if v_target_id is null then
    raise exception 'FINANCIAL_SYSTEM_ACCOUNT_NOT_FOUND:%', v_target_code;
  end if;

  new.chart_account_id := v_target_id;
  return new;
end;
$$;

drop trigger if exists financial_documents_normalize_managerial_account
  on public.financial_documents;
create trigger financial_documents_normalize_managerial_account
before insert or update of tenant_id, chart_account_id
on public.financial_documents
for each row execute function private.normalize_financial_managerial_account();

drop trigger if exists financial_allocations_normalize_managerial_account
  on public.financial_allocations;
create trigger financial_allocations_normalize_managerial_account
before insert or update of tenant_id, chart_account_id
on public.financial_allocations
for each row execute function private.normalize_financial_managerial_account();

-- Reconcilia qualquer lancamento que tenha sido criado em uma conta legada
-- depois do remapeamento inicial do plano gerencial.
with account_map as (
  select
    legacy.tenant_id,
    legacy.id as legacy_id,
    current_account.id as current_id
  from public.chart_of_accounts legacy
  join public.chart_of_accounts current_account
    on current_account.tenant_id = legacy.tenant_id
   and current_account.code = private.frotak_managerial_code_alias(legacy.code)
   and current_account.active = true
  where private.frotak_managerial_code_alias(legacy.code) <> legacy.code
)
update public.financial_documents document
set chart_account_id = account_map.current_id
from account_map
where document.tenant_id = account_map.tenant_id
  and document.chart_account_id = account_map.legacy_id;

with account_map as (
  select
    legacy.tenant_id,
    legacy.id as legacy_id,
    current_account.id as current_id
  from public.chart_of_accounts legacy
  join public.chart_of_accounts current_account
    on current_account.tenant_id = legacy.tenant_id
   and current_account.code = private.frotak_managerial_code_alias(legacy.code)
   and current_account.active = true
  where private.frotak_managerial_code_alias(legacy.code) <> legacy.code
)
update public.financial_allocations allocation
set chart_account_id = account_map.current_id
from account_map
where allocation.tenant_id = account_map.tenant_id
  and allocation.chart_account_id = account_map.legacy_id;

revoke all on function private.normalize_financial_managerial_account()
  from public, anon, authenticated;

comment on function private.normalize_financial_managerial_account() is
  'Converte codigos gerenciais legados para a conta canonica atual antes da gravacao financeira.';

notify pgrst, 'reload schema';
