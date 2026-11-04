#!/usr/bin/env bash
# Recebe os backups da VPS de banco. A chave so entra pela WireGuard, so grava nesta pasta e nao
# consegue baixar nem usar --delete. O authorized_keys fica fora da pasta gravavel e e do root,
# para a propria chave nao poder afrouxar essas regras.
# Uso: ./backup-target.sh "ssh-ed25519 AAAA... frotak-backup"
set -euo pipefail

public_key="${1:?informe a chave publica}"
# shellcheck disable=SC1091
. /etc/frotak/hosts.env

home_dir=/var/lib/frotak-backup
target=/var/backups/frotak-db
id frotak-backup >/dev/null 2>&1 || useradd --system --home-dir "$home_dir" --shell /bin/sh frotak-backup
install -d -m 755 -o root -g root "$home_dir" "$home_dir/.ssh"
install -d -m 700 -o frotak-backup -g frotak-backup "$target"
cat > "$home_dir/.ssh/authorized_keys" <<EOF
restrict,from="${WG_DB}",command="/usr/bin/rrsync -wo -no-del ${target}" ${public_key}
EOF
chmod 644 "$home_dir/.ssh/authorized_keys"

cat > /etc/cron.daily/frotak-backup-prune <<EOF
#!/bin/sh
find ${target} -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
EOF
chmod 755 /etc/cron.daily/frotak-backup-prune
echo "destino de backup pronto em ${target}"
