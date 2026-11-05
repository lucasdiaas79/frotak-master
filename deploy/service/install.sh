#!/usr/bin/env bash
# Prepara a VPS de Servico: usuario dos apps, Redis, Caddy e variaveis de ambiente.
# Pode rodar de novo: chaves ja geradas e os arquivos *.secrets.env sao mantidos.
# Pre-requisitos: common/base.sh, common/wireguard.sh, /etc/frotak/hosts.env e
# /etc/frotak/shared.env (copiado da VPS de banco).
set -euo pipefail
umask 077

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. /etc/frotak/hosts.env
# shellcheck disable=SC1091
. /etc/frotak/shared.env

id frotak >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/frotak-app --shell /usr/sbin/nologin frotak
install -d -m 755 /opt/frotak /opt/frotak/releases

# Redis so em localhost. noeviction porque a arquitetura preve filas nele: chave de cache deve
# ter TTL, e fila nao pode sumir por falta de memoria.
if [ ! -f /etc/redis/frotak.conf ]; then
  cat > /etc/redis/frotak.conf <<EOF
bind 127.0.0.1 -::1
protected-mode yes
requirepass $(openssl rand -hex 24)
maxmemory 512mb
maxmemory-policy noeviction
appendonly yes
EOF
  chown redis:redis /etc/redis/frotak.conf
  chmod 640 /etc/redis/frotak.conf
fi
grep -q '^include /etc/redis/frotak.conf' /etc/redis/redis.conf || echo 'include /etc/redis/frotak.conf' >> /etc/redis/redis.conf
systemctl enable redis-server >/dev/null 2>&1
systemctl restart redis-server
redis_password="$(awk '/^requirepass/ {print $2}' /etc/redis/frotak.conf)"

# Chaves do Web Push no formato que webPush.ts le: publica crua e d da privada, em base64url.
if [ ! -f /etc/frotak/vapid.env ]; then
  node -e '
    const { generateKeyPairSync } = require("node:crypto");
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = privateKey.export({ format: "jwk" });
    const raw = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url"),
      Buffer.from(publicKey.export({ format: "jwk" }).y, "base64url"),
    ]);
    console.log(`VAPID_PUBLIC_KEY=${raw.toString("base64url")}`);
    console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
  ' > /etc/frotak/vapid.env
fi

# O servidor fala com a API e com o agente pela WireGuard; o navegador usa o endereco publico.
cat > /etc/frotak/master.env <<EOF
HOST=127.0.0.1
PORT=3001
SUPABASE_URL=http://${WG_DB}:8000
VITE_SUPABASE_URL=https://${API_HOST}
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
FROTAK_AGENT_URL=http://${WG_DB}:9100
FROTAK_AGENT_TOKEN=${FROTAK_AGENT_TOKEN}
FROTAK_SENTINEL_DB_URL=http://${WG_DB}:9101
FROTAK_SENTINEL_SERVICE_URL=http://${WG_SERVICE}:9101
FROTAK_SENTINEL_TOKEN=${FROTAK_SENTINEL_TOKEN}
EOF

{
  cat <<EOF
HOST=127.0.0.1
PORT=3002
FROTAK_AGENT_URL=http://${WG_DB}:9100
FROTAK_AGENT_TOKEN=${FROTAK_AGENT_TOKEN}
FROTAK_CLIENT_BASE_DOMAIN=${CLIENT_BASE_DOMAIN}
FROTAK_PUSH_CRON_TOKEN=${FROTAK_PUSH_CRON_TOKEN}
SASCAR_SYNC_TOKEN=${SASCAR_SYNC_TOKEN}
REDIS_URL=redis://:${redis_password}@127.0.0.1:6379/0
VAPID_SUBJECT=https://${MASTER_HOST}
EOF
  cat /etc/frotak/vapid.env
} > /etc/frotak/tms.env

# Chaves de terceiros, preenchidas a mao e nunca sobrescritas por este script.
if [ ! -f /etc/frotak/tms.secrets.env ]; then
  cat > /etc/frotak/tms.secrets.env <<'EOF'
# Sem estas chaves o TMS funciona, mas a funcao correspondente responde que nao esta configurada.
# Depois de editar: systemctl restart frotak-app@tms
# GEMINI_API_KEY=
# GOOGLE_MAPS_API_KEY=
# SASCAR_USER=
# SASCAR_PASSWORD=
EOF
fi

# Publicos: o build grava estes valores no pacote do navegador.
cat > /etc/frotak/build.env <<EOF
VITE_SUPABASE_URL=https://${API_HOST}
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
VITE_FROTAK_HIDE_PROTOTYPES=true
VITE_FROTAK_MULTI_DB=true
VITE_FROTAK_CONTROL_PANEL=true
EOF
chown root:frotak /etc/frotak /etc/frotak/build.env
chmod 750 /etc/frotak
chmod 640 /etc/frotak/build.env

install -m 644 "$here/systemd/frotak-app@.service" /etc/systemd/system/frotak-app@.service
systemctl daemon-reload

ROLE=service FROTAK_SENTINEL_TOKEN="$FROTAK_SENTINEL_TOKEN" "$here/../common/sentinel/install.sh"

sed -e "s|__MASTER_HOST__|${MASTER_HOST}|" -e "s|__CLIENT_BASE_DOMAIN__|${CLIENT_BASE_DOMAIN}|" \
  -e "s|__API_HOST__|${API_HOST}|" -e "s|__WG_DB__|${WG_DB}|" \
  "$here/Caddyfile.template" > /etc/caddy/Caddyfile
chmod 644 /etc/caddy/Caddyfile
# Valida como o usuario do servico: como root, o validate criaria um log que o Caddy nao abre.
chown -R caddy:caddy /var/log/caddy
runuser -u caddy -- env HOME=/var/lib/caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -1
systemctl enable caddy >/dev/null 2>&1
systemctl reload-or-restart caddy
echo "servico preparado"
