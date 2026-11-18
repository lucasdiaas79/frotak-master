-- Frotak - Motorista reabre a jornada que encerrou.
--
-- Para quando o motorista encerra a jornada sem querer ou precisa voltar a trabalhar.
-- Reabre a ultima jornada encerrada, se:
--   - nao ha outra jornada aberta;
--   - foi encerrada ha no maximo 12 horas;
--   - a central ainda nao revisou o espelho desse dia.
-- O intervalo entre o fim e a reabertura fica sem ponto (fora da jornada). A reabertura
-- vira um ponto de trabalho "Jornada reaberta", que a central ve na linha do tempo.
-- A confirmacao do espelho pelo motorista e desfeita, porque o dia mudou.

begin;

create or replace function public.driver_journey_reopen(
  p_at timestamptz default null,
  p_geo jsonb default null,
  p_client_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_driver public.drivers;
  v_at timestamptz;
  v_day public.driver_work_days;
begin
  v_driver := private.current_driver_with_module('driver_journey');
  v_at := private.ops_event_time(p_at);

  if p_client_event_id is not null and exists (
    select 1 from public.driver_punches where driver_id = v_driver.id and client_event_id = p_client_event_id
  ) then
    return public.get_driver_ops_context();
  end if;

  if exists (select 1 from public.driver_work_days where driver_id = v_driver.id and ended_at is null) then
    return public.get_driver_ops_context();
  end if;

  select * into v_day
  from public.driver_work_days
  where driver_id = v_driver.id and ended_at is not null
  order by ended_at desc
  limit 1
  for update;
  if not found then
    raise exception 'JOURNEY_NOTHING_TO_REOPEN' using errcode = '22023';
  end if;
  if v_day.reviewed_at is not null then
    raise exception 'JOURNEY_ALREADY_REVIEWED' using errcode = '22023';
  end if;
  if v_at - v_day.ended_at > interval '12 hours' then
    raise exception 'JOURNEY_REOPEN_TOO_LATE' using errcode = '22023';
  end if;

  update public.driver_work_days
  set ended_at = null, end_geo = null, confirmed_by_driver_at = null
  where id = v_day.id;

  insert into public.driver_punches (tenant_id, work_day_id, driver_id, activity, started_at, source, reason, geo, client_event_id)
  values (v_driver.tenant_id, v_day.id, v_driver.id, 'trabalho', greatest(v_at, v_day.ended_at), 'motorista',
    'Jornada reaberta (tinha encerrado às ' || to_char(v_day.ended_at at time zone 'America/Sao_Paulo', 'HH24:MI') || ')',
    private.ops_clean_geo(p_geo), p_client_event_id);

  return public.get_driver_ops_context();
end;
$$;

revoke all on function public.driver_journey_reopen(timestamptz, jsonb, text) from public, anon;
grant execute on function public.driver_journey_reopen(timestamptz, jsonb, text) to authenticated;

commit;
