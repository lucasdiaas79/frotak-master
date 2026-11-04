#!/usr/bin/env bash
# Rede privada entre as VPS.
#   ./wireguard.sh keys                      gera a chave se faltar e imprime a chave publica
#   ./wireguard.sh up ADDR PEER_ADDR PEER_PUB PEER_ENDPOINT   grava wg0 e sobe a interface
set -euo pipefail
umask 077

case "${1:-}" in
  keys)
    [ -f /etc/wireguard/wg0.key ] || wg genkey > /etc/wireguard/wg0.key
    wg pubkey < /etc/wireguard/wg0.key
    ;;
  up)
    addr="$2"; peer_addr="$3"; peer_pub="$4"; peer_endpoint="$5"
    cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = ${addr}/24
ListenPort = 51820
PostUp = wg set %i private-key /etc/wireguard/wg0.key

[Peer]
PublicKey = ${peer_pub}
AllowedIPs = ${peer_addr}/32
Endpoint = ${peer_endpoint}:51820
PersistentKeepalive = 25
EOF
    systemctl enable wg-quick@wg0 >/dev/null 2>&1
    systemctl restart wg-quick@wg0
    ip -br addr show wg0
    ;;
  *)
    echo "uso: $0 keys | up ADDR PEER_ADDR PEER_PUB PEER_ENDPOINT" >&2
    exit 2
    ;;
esac
