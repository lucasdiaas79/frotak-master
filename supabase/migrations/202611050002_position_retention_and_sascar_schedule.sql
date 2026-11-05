-- A funcao de limpeza e os jobs abaixo existem na producao atual, vindos de
-- central-dias-main/supabase/migrations/202608310001, mas nao estavam nesta sequencia. Em banco
-- novo, a sincronizacao da Sascar falharia ao limpar posicoes e a tabela cresceria sem limite.
-- Em producao nada muda: os jobs existentes ficam como estao.

begin;

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

revoke all on function public.purge_old_vehicle_positions(interval) from public, anon, authenticated;
grant execute on function public.purge_old_vehicle_positions(interval) to service_role;

do $$
begin
  if to_regnamespace('cron') is null then
    return;
  end if;

  if not exists (select 1 from cron.job where jobname = 'vehicle-positions-retention-hourly') then
    perform cron.schedule(
      'vehicle-positions-retention-hourly',
      '7 * * * *',
      $job$select public.purge_old_vehicle_positions(interval '24 hours');$job$
    );
  end if;

  -- Sem integracao ativa ou sem URL configurada, a funcao nao chama nada.
  if not exists (select 1 from cron.job where jobname = 'sascar-sync-every-minute') then
    perform cron.schedule(
      'sascar-sync-every-minute',
      '* * * * *',
      $job$select public.invoke_sascar_sync_cron();$job$
    );
  end if;
end;
$$;

commit;
