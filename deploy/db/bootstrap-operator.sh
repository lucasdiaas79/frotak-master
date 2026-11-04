#!/usr/bin/env bash
# Cria o primeiro operador do Master com senha aleatoria, gravada so em /root neste servidor.
# Uso: OPERATOR_EMAIL=admin@empresa.com.br ./bootstrap-operator.sh
set -euo pipefail
umask 077

: "${OPERATOR_EMAIL:?informe OPERATOR_EMAIL}"
# shellcheck disable=SC1091
. /etc/frotak/hosts.env
# shellcheck disable=SC1091
. /etc/frotak/db.env

password="$(openssl rand -base64 18 | tr -d '/+=')"
payload="$(OPERATOR_EMAIL="$OPERATOR_EMAIL" OPERATOR_PASSWORD="$password" python3 -c '
import json, os
print(json.dumps({"email": os.environ["OPERATOR_EMAIL"], "password": os.environ["OPERATOR_PASSWORD"], "email_confirm": True}))')"

response="$(curl -sS -X POST "http://${WG_DB}:8000/auth/v1/admin/users" \
  -H "apikey: ${SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H 'Content-Type: application/json' -d "$payload")"
user_id="$(python3 -c 'import json, sys; print(json.load(sys.stdin).get("id", ""))' <<<"$response")"
if [ -z "$user_id" ]; then
  echo "o Auth recusou o usuario: $response" >&2
  exit 1
fi

docker exec -i frotak-db psql -v ON_ERROR_STOP=1 -q -X -U postgres -h 127.0.0.1 -d postgres \
  -c "insert into public.platform_users (user_id, platform_role, active) values ('${user_id}', 'super_admin', true)"

cat > /root/frotak-acesso-inicial.txt <<EOF
Master: https://${MASTER_HOST}
Login:  ${OPERATOR_EMAIL}
Senha:  ${password}
EOF
echo "operador criado; credencial em /root/frotak-acesso-inicial.txt"
