#!/usr/bin/env bash
# Firewall da VPS. Liga com um desarme automatico: se a sessao seguinte nao confirmar com
# "systemctl stop frotak-ufw-rollback.timer" em 5 minutos, o firewall desliga sozinho e o
# acesso SSH volta.
# Uso: ROLE=db|service PEER_PUBLIC_IP=... WG_PEER=... ./firewall.sh
set -euo pipefail

: "${ROLE:?}" "${PEER_PUBLIC_IP:?}" "${WG_PEER:?}"

systemctl stop frotak-ufw-rollback.timer 2>/dev/null || true
systemd-run --quiet --on-active=300 --unit=frotak-ufw-rollback /usr/sbin/ufw --force disable

ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'ssh' >/dev/null
ufw allow from "$PEER_PUBLIC_IP" to any port 51820 proto udp comment 'wireguard' >/dev/null

case "$ROLE" in
  db)
    ufw allow in on wg0 from "$WG_PEER" to any port 6432 proto tcp comment 'pgbouncer' >/dev/null
    ufw allow in on wg0 from "$WG_PEER" to any port 9100 proto tcp comment 'agente' >/dev/null
    # O Docker publica portas por fora do UFW. Os servicos ja escutam so na WireGuard e em
    # localhost; esta regra tambem barra quem tentar rotear ate eles pela interface publica.
    if ! grep -q 'BEGIN FROTAK DOCKER' /etc/ufw/after.rules; then
      cat >> /etc/ufw/after.rules <<'EOF'

# BEGIN FROTAK DOCKER
*filter
:DOCKER-USER - [0:0]
-A DOCKER-USER -i eth0 -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
-A DOCKER-USER -i eth0 -j DROP
-A DOCKER-USER -j RETURN
COMMIT
# END FROTAK DOCKER
EOF
    fi
    ;;
  service)
    ufw allow 80/tcp comment 'caddy' >/dev/null
    ufw allow 443/tcp comment 'caddy' >/dev/null
    ;;
  *)
    echo "ROLE invalido" >&2
    exit 2
    ;;
esac

ufw --force enable >/dev/null
ufw status numbered
echo "CONFIRMAR em outra sessao: systemctl stop frotak-ufw-rollback.timer"
