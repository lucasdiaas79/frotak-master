#!/usr/bin/env bash
# Prepara uma VPS nova: atualizacoes, pacotes do papel, swap, fail2ban e atualizacao automatica.
# Uso: ROLE=db|service ./base.sh
# Nao altera o acesso SSH: desligar login por senha exige antes uma chave instalada.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
APT_OPTS=(-y -qq -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

case "${ROLE:-}" in
  db) role_packages=(docker.io docker-compose-v2 pgbouncer postgresql-client) ;;
  service) role_packages=(nodejs npm caddy redis-server postgresql-client) ;;
  *) echo "defina ROLE=db ou ROLE=service" >&2; exit 2 ;;
esac

apt-get update -qq
apt-get "${APT_OPTS[@]}" upgrade
apt-get "${APT_OPTS[@]}" install ufw fail2ban unattended-upgrades wireguard-tools rsync curl "${role_packages[@]}"

if ! swapon --show=NAME --noheadings | grep -q '^/swapfile$'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap -q /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness = 10' > /etc/sysctl.d/90-frotak.conf
sysctl --quiet --system

cat > /etc/fail2ban/jail.d/frotak.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

install -d -m 750 /etc/frotak
echo "base pronta (${ROLE})"
