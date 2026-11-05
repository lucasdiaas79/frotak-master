#!/usr/bin/env bash
# Operador perdeu o celular: apaga o 2FA dele, que cadastra outro no proximo login. Encerra as
# sessoes abertas, para ninguem seguir entrando com o fator antigo.
# Uso: ./reset-mfa.sh operador@empresa.com.br
# Vale para a equipe, no banco do Central.
set -euo pipefail

email="${1:?informe o e-mail do operador}"
case "$email" in
  *\'*) echo "e-mail invalido" >&2; exit 2 ;;
esac

docker exec -i frotak-db psql -v ON_ERROR_STOP=1 -q -X -At -U supabase_admin -h 127.0.0.1 -d frotak_central <<SQL
with target as (select id from auth.users where lower(email) = lower('${email}')),
removed as (delete from auth.mfa_factors where user_id in (select id from target) returning 1),
closed as (delete from auth.sessions where user_id in (select id from target) returning 1)
select 'usuarios: ' || (select count(*) from target)
  || ', fatores removidos: ' || (select count(*) from removed)
  || ', sessoes encerradas: ' || (select count(*) from closed);
SQL
