#!/usr/bin/env bash
# Aponta os jobs do pg_cron para o TMS desta instalacao. Sem isso eles ficam parados, de proposito.
set -euo pipefail

# shellcheck disable=SC1091
. /etc/frotak/hosts.env
# shellcheck disable=SC1091
. /etc/frotak/db.env

# O job da Sascar existe em producao, mas nenhuma migration o agenda. Sem integracao configurada,
# a funcao nao chama nada. O job de retencao de posicoes tambem so existe em producao
# (public.purge_old_vehicle_positions) e fica de fora ate a definicao entrar no repositorio.
docker exec -i frotak-db psql -v ON_ERROR_STOP=1 -q -X -U postgres -h 127.0.0.1 -d postgres <<SQL
insert into public.integration_cron_settings (key, value) values
  ('frotak_push_url', 'https://${TMS_HOST}/api/frotak-ia/push-dispatch'),
  ('frotak_push_token', '${FROTAK_PUSH_CRON_TOKEN}'),
  ('sascar_function_url', 'https://${TMS_HOST}/api/sascar/sync'),
  ('sascar_sync_token', '${SASCAR_SYNC_TOKEN}')
on conflict (key) do update set value = excluded.value;

do \$\$
begin
  perform cron.schedule('sascar-sync-every-minute', '* * * * *', 'select public.invoke_sascar_sync_cron();');
end \$\$;
SQL
docker exec frotak-db psql -q -X -At -U postgres -h 127.0.0.1 -d postgres \
  -c "select jobname, schedule, active from cron.job order by jobid"
