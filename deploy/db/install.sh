#!/usr/bin/env bash
# Sobe o banco da VPS de banco. Pode rodar de novo: segredos existentes sao mantidos.
# Pre-requisitos: common/base.sh, common/wireguard.sh e /etc/frotak/hosts.env.
set -euo pipefail
umask 077

here="$(cd "$(dirname "$0")" && pwd)"
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
# shellcheck disable=SC1091
. /etc/frotak/db.env

# O que a VPS de Servico precisa. O arquivo e copiado para la, sem passar por disco no meio.
cat > /etc/frotak/shared.env <<EOF
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
FROTAK_PUSH_CRON_TOKEN=${FROTAK_PUSH_CRON_TOKEN}
SASCAR_SYNC_TOKEN=${SASCAR_SYNC_TOKEN}
EOF

sed -e "s|__ANON_KEY__|${ANON_KEY}|" -e "s|__SERVICE_ROLE_KEY__|${SERVICE_ROLE_KEY}|" \
  "$here/kong.template.yml" > /etc/frotak/kong.yml
chmod 644 /etc/frotak/kong.yml

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
systemctl restart docker

install -d -m 700 /var/lib/frotak/db /var/lib/frotak/storage

cd "$here"
compose() { docker compose --env-file /etc/frotak/hosts.env --env-file /etc/frotak/db.env "$@"; }
compose pull -q
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
systemctl daemon-reload
systemctl enable pgbouncer >/dev/null 2>&1
systemctl restart pgbouncer
systemctl is-active pgbouncer
