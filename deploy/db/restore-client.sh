#!/usr/bin/env bash
# Restaura UM cliente a partir de um backup, sem encostar nos demais. Os dados atuais dele sao
# substituidos, por isso exige repetir o endereco do cliente.
# Uso: ./restore-client.sh CLIENTE /var/backups/frotak/AAAAMMDDTHHMMSSZ CLIENTE
set -euo pipefail

slug="${1:?informe o cliente}"
backup="${2:?informe a pasta do backup}"
confirm="${3:-}"
[ "$confirm" = "$slug" ] || { echo "para confirmar, repita o cliente no terceiro argumento" >&2; exit 2; }
[[ "$slug" =~ ^[a-z0-9-]+$ ]] || { echo "cliente invalido" >&2; exit 2; }

dump="$backup/clients/$slug.dump"
files="$backup/clients/$slug.storage.tar.gz"
envfile="/etc/frotak/clients/$slug.env"
[ -f "$dump" ] || { echo "backup de $slug nao encontrado em $backup" >&2; exit 1; }
[ -f "$envfile" ] || { echo "$slug nao e um cliente desta VPS" >&2; exit 1; }
(cd "$backup" && sha256sum -c --quiet --ignore-missing SHA256SUMS)

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1090
. "$envfile"
stack() { docker compose -p "frotak-c-$slug" -f "$here/client.compose.yml" --env-file "$envfile" "$@"; }
as_admin() { docker exec -i frotak-db psql -v ON_ERROR_STOP=1 -q -X -At -U supabase_admin -h 127.0.0.1 "$@"; }

stack stop
as_admin -d postgres -c "DROP DATABASE IF EXISTS \"$CLIENT_DB\" WITH (FORCE)" </dev/null
as_admin -d postgres -c "CREATE DATABASE \"$CLIENT_DB\" TEMPLATE template0" </dev/null

# Avisos sobre objetos do proprio Supabase sao esperados; a conferencia abaixo e que decide.
docker exec -i frotak-db pg_restore -U supabase_admin -h 127.0.0.1 -d "$CLIENT_DB" --no-comments < "$dump" 2>/tmp/restore-"$slug".log || true
echo "avisos do pg_restore: $(grep -c 'pg_restore: error' /tmp/restore-"$slug".log || true)"
rm -f /tmp/restore-"$slug".log

as_admin -d postgres <<SQL
REVOKE CONNECT ON DATABASE "$CLIENT_DB" FROM PUBLIC;
GRANT CONNECT ON DATABASE "$CLIENT_DB" TO "$AUTH_DB_USER", "$REST_DB_USER", "$STORAGE_DB_USER", postgres, pgbouncer, supabase_admin;
SQL

if [ -f "$files" ]; then
  rm -rf "$CLIENT_STORAGE_DIR"
  mkdir -p "$CLIENT_STORAGE_DIR"
  tar -xzf "$files" -C "$CLIENT_STORAGE_DIR"
fi

stack up -d --wait --wait-timeout 180
as_admin -d "$CLIENT_DB" -c "select 'restaurado: ' || (select count(*) from public.tenants) || ' cliente, ' || (select count(*) from auth.users) || ' usuarios, ' || (select count(*) from public.vehicles) || ' veiculos'" </dev/null
