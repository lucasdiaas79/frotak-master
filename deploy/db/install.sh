#!/usr/bin/env bash
# Sobe a VPS de banco: Postgres, banco de agendamentos, modelo dos clientes, Central e agente.
# Pode rodar de novo: segredos e bancos existentes sao mantidos.
# Pre-requisitos: common/base.sh, common/wireguard.sh e /etc/frotak/hosts.env.
#
# postgres          intocado depois da inicializacao, origem do modelo
# frotak_jobs       so os agendamentos: pg_cron e pg_net atendem um unico banco por servidor
# frotak_template   modelo com todas as migrations; cada cliente nasce de uma copia dele
# frotak_central    cadastro de clientes, liberacoes e equipe (Master)
# frotak_<cliente>  um por cliente, criado pelo agente
set -euo pipefail
umask 077

here="$(cd "$(dirname "$0")" && pwd)"
migrations_dir="${MIGRATIONS_DIR:-/opt/frotak/supabase/migrations}"
# shellcheck disable=SC1091
. /etc/frotak/hosts.env

hex() { openssl rand -hex "$1"; }

if [ ! -f /etc/frotak/db.env ]; then
  jwt_secret="$(hex 32)"
  sign_jwt() {
    JWT_SECRET="$jwt_secret" ROLE_NAME="$1" python3 - <<'PY'
import base64, hashlib, hmac, json, os, time

def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

def part(value):
    return b64(json.dumps(value, separators=(",", ":")).encode())

now = int(time.time())
head = part({"alg": "HS256", "typ": "JWT"})
body = part({"role": os.environ["ROLE_NAME"], "iss": "supabase", "iat": now, "exp": now + 10 * 365 * 86400})
sig = b64(hmac.new(os.environ["JWT_SECRET"].encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
print(f"{head}.{body}.{sig}")
PY
  }
  cat > /etc/frotak/db.env <<EOF
POSTGRES_PASSWORD=$(hex 24)
JWT_SECRET=${jwt_secret}
ANON_KEY=$(sign_jwt anon)
SERVICE_ROLE_KEY=$(sign_jwt service_role)
SECRET_KEY_BASE=$(hex 40)
REALTIME_DB_ENC_KEY=$(hex 8)
FROTAK_PUSH_CRON_TOKEN=$(hex 32)
SASCAR_SYNC_TOKEN=$(hex 32)
EOF
  echo "segredos gerados em /etc/frotak/db.env"
fi
[ -f /etc/frotak/agent.env ] || echo "FROTAK_AGENT_TOKEN=$(hex 32)" > /etc/frotak/agent.env
grep -q '^FROTAK_SENTINEL_TOKEN=' /etc/frotak/agent.env || echo "FROTAK_SENTINEL_TOKEN=$(hex 32)" >> /etc/frotak/agent.env
# shellcheck disable=SC1091
. /etc/frotak/db.env
# shellcheck disable=SC1091
. /etc/frotak/agent.env

# O que a VPS de Servico precisa. O arquivo e copiado para la, sem passar por disco no meio.
cat > /etc/frotak/shared.env <<EOF
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
FROTAK_PUSH_CRON_TOKEN=${FROTAK_PUSH_CRON_TOKEN}
SASCAR_SYNC_TOKEN=${SASCAR_SYNC_TOKEN}
FROTAK_AGENT_TOKEN=${FROTAK_AGENT_TOKEN}
FROTAK_SENTINEL_TOKEN=${FROTAK_SENTINEL_TOKEN}
EOF

# Sem rotacao, log de container enche o disco. Os conteineres publicam no IP da WireGuard, entao
# o Docker so pode subir depois dela.
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
EOF
install -d -m 755 /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/docker.service.d/10-frotak-wireguard.conf <<'EOF'
[Unit]
After=wg-quick@wg0.service
Wants=wg-quick@wg0.service
EOF
systemctl daemon-reload
systemctl enable docker >/dev/null 2>&1
systemctl is-active --quiet docker || systemctl start docker

install -d -m 700 /var/lib/frotak/db /var/lib/frotak/storage /var/lib/frotak/clients /etc/frotak/clients
install -d -m 755 /etc/frotak/kong
python3 "$here/agent/frotak_agent.py" render-kong

cd "$here"
compose() { docker compose --env-file /etc/frotak/hosts.env --env-file /etc/frotak/db.env "$@"; }
compose pull -q
compose up -d --wait --wait-timeout 300 db

as_admin() { docker exec -i frotak-db psql -v ON_ERROR_STOP=1 -q -X -At -U supabase_admin -h 127.0.0.1 "$@"; }
db_exists() { [ "$(as_admin -d postgres -c "select 1 from pg_database where datname = '$1'" </dev/null)" = "1" ]; }

if ! db_exists frotak_jobs; then
  as_admin -d postgres -c 'CREATE DATABASE frotak_jobs TEMPLATE template0' </dev/null
  as_admin -d frotak_jobs -c 'CREATE EXTENSION IF NOT EXISTS pg_cron' </dev/null
  echo "banco de agendamentos criado"
fi

if ! db_exists frotak_template; then
  # So ganha o nome final depois de pronto: uma falha aqui nao deixa modelo pela metade.
  as_admin -d postgres -c 'DROP DATABASE IF EXISTS frotak_template_build WITH (FORCE)' </dev/null
  as_admin -d postgres -c 'CREATE DATABASE frotak_template_build TEMPLATE postgres OWNER postgres' </dev/null

  # Auth e Storage trazem as proprias tabelas ao subir. As migrations dependem delas.
  stage="$(mktemp -d)"
  cat > "$stage/template.env" <<EOF
CLIENT_SLUG=template
CLIENT_DB=frotak_template_build
API_HOST=${API_HOST}
CLIENT_BASE_DOMAIN=${CLIENT_BASE_DOMAIN}
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
AUTH_DB_USER=supabase_auth_admin
AUTH_DB_PASSWORD=${POSTGRES_PASSWORD}
REST_DB_USER=authenticator
REST_DB_PASSWORD=${POSTGRES_PASSWORD}
STORAGE_DB_USER=supabase_storage_admin
STORAGE_DB_PASSWORD=${POSTGRES_PASSWORD}
CLIENT_STORAGE_DIR=${stage}/storage
EOF
  mkdir -p "$stage/storage"
  template_compose() { docker compose -p frotak-template -f "$here/client.compose.yml" --env-file "$stage/template.env" "$@"; }
  docker network inspect frotak_default >/dev/null
  template_compose up -d --wait --wait-timeout 240
  template_compose down -v
  rm -rf "$stage"

  "$here/migrate.sh" "$migrations_dir" frotak_template_build
  as_admin -d postgres -c 'ALTER DATABASE frotak_template_build RENAME TO frotak_template' </dev/null
  # Nada conecta no modelo; copia-lo exige banco sem conexoes.
  as_admin -d postgres -c 'ALTER DATABASE frotak_template ALLOW_CONNECTIONS false' </dev/null
  echo "modelo dos clientes pronto"
fi

if ! db_exists frotak_central; then
  as_admin -d postgres -c 'CREATE DATABASE frotak_central TEMPLATE frotak_template OWNER postgres' </dev/null
  as_admin -d postgres <<'SQL'
REVOKE CONNECT ON DATABASE frotak_central FROM PUBLIC;
GRANT CONNECT ON DATABASE frotak_central TO authenticator, supabase_auth_admin, supabase_storage_admin, postgres, pgbouncer;
GRANT CREATE ON DATABASE frotak_central TO supabase_storage_admin;
REVOKE CONNECT ON DATABASE frotak_jobs FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
GRANT CONNECT ON DATABASE postgres TO postgres, pgbouncer;
SQL
  echo "Central criado"
fi

compose up -d --wait --wait-timeout 300
compose ps --format 'table {{.Name}}\t{{.Status}}'

# PgBouncer nativo: atualiza junto com o sistema e fica fora do Docker.
sed -e "s|__WG_DB__|${WG_DB}|" "$here/pgbouncer.template.ini" > /etc/pgbouncer/pgbouncer.ini
printf '"pgbouncer" "%s"\n' "$POSTGRES_PASSWORD" > /etc/pgbouncer/userlist.txt
chown postgres:postgres /etc/pgbouncer/pgbouncer.ini /etc/pgbouncer/userlist.txt
chmod 640 /etc/pgbouncer/pgbouncer.ini /etc/pgbouncer/userlist.txt
install -d -m 755 /etc/systemd/system/pgbouncer.service.d
cat > /etc/systemd/system/pgbouncer.service.d/10-frotak-wireguard.conf <<'EOF'
[Unit]
After=wg-quick@wg0.service docker.service
Wants=wg-quick@wg0.service
[Service]
RuntimeDirectory=postgresql
RuntimeDirectoryPreserve=yes
EOF

install -m 644 "$here/agent/frotak-agent.service" /etc/systemd/system/frotak-agent.service
systemctl daemon-reload
systemctl enable pgbouncer frotak-agent >/dev/null 2>&1
systemctl restart pgbouncer frotak-agent
systemctl is-active pgbouncer frotak-agent | tr '\n' ' '; echo

# Clientes que ja existem recebem o que mudou no client.compose.yml. Sem mudanca, nada reinicia.
python3 "$here/agent/frotak_agent.py" refresh-clients

ROLE=db FROTAK_SENTINEL_TOKEN="$FROTAK_SENTINEL_TOKEN" "$here/../common/sentinel/install.sh"
