#!/usr/bin/env bash
# Instala ou atualiza a sentinela desta VPS. Pode rodar de novo.
# Uso: ROLE=db|service FROTAK_SENTINEL_TOKEN=... ./install.sh
set -euo pipefail
umask 077

: "${ROLE:?}" "${FROTAK_SENTINEL_TOKEN:?}"
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. /etc/frotak/hosts.env

case "$ROLE" in
  db) bind="$WG_DB"; peer="$WG_SERVICE" ;;
  service) bind="$WG_SERVICE"; peer="$WG_DB" ;;
  *) echo "ROLE invalido" >&2; exit 2 ;;
esac

cat > /etc/frotak/sentinel.env <<EOF
FROTAK_SENTINEL_ROLE=${ROLE}
FROTAK_SENTINEL_BIND=${bind}
FROTAK_SENTINEL_PEER=http://${peer}:9101
FROTAK_SENTINEL_TOKEN=${FROTAK_SENTINEL_TOKEN}
EOF

# Cada sentinela confere a outra pela WireGuard. O Master fala com as duas pelo mesmo caminho.
ufw allow in on wg0 from "$peer" to any port 9101 proto tcp comment 'sentinela' >/dev/null

install -m 644 "$here/frotak-sentinel.service" /etc/systemd/system/frotak-sentinel.service
systemctl daemon-reload
systemctl enable frotak-sentinel >/dev/null 2>&1
systemctl restart frotak-sentinel
systemctl is-active frotak-sentinel
