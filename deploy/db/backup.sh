#!/usr/bin/env bash
# Backup diario. Tem duas camadas:
# - copia fisica do servidor inteiro, para recuperar a VPS em caso de desastre;
# - um arquivo por banco, para restaurar um cliente sem encostar nos outros (restore-client.sh).
# Fica 14 dias aqui e segue pela WireGuard para a VPS de Servico, que guarda 30 dias.
set -euo pipefail
umask 077

# shellcheck disable=SC1091
. /etc/frotak/hosts.env

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
root=/var/backups/frotak
dir="$root/$stamp"
install -d -m 700 "$root" "$dir" "$dir/clients"
trap 'rm -rf "$dir"' ERR

docker exec frotak-db pg_basebackup -U supabase_admin -h /var/run/postgresql -D - -Ft -X fetch -z > "$dir/postgres.tar.gz"
tar -C /var/lib/docker/volumes/frotak_db-config/_data -czf "$dir/db-config.tar.gz" .
tar -C /etc -czf "$dir/etc-frotak.tar.gz" frotak
tar -C /var/lib/frotak -czf "$dir/central-storage.tar.gz" storage

docker exec frotak-db pg_dump -U supabase_admin -h 127.0.0.1 -Fc -d frotak_central > "$dir/central.dump"
shopt -s nullglob
for envfile in /etc/frotak/clients/*.env; do
  slug="$(basename "$envfile" .env)"
  database="$(grep '^CLIENT_DB=' "$envfile" | cut -d= -f2-)"
  storage_dir="$(grep '^CLIENT_STORAGE_DIR=' "$envfile" | cut -d= -f2-)"
  docker exec frotak-db pg_dump -U supabase_admin -h 127.0.0.1 -Fc -d "$database" > "$dir/clients/$slug.dump"
  tar -C "$storage_dir" -czf "$dir/clients/$slug.storage.tar.gz" .
done
(cd "$dir" && find . -type f ! -name SHA256SUMS -print0 | xargs -0 sha256sum > SHA256SUMS)
trap - ERR

rsync -a -e "ssh -i /root/.ssh/frotak_backup -o BatchMode=yes -o StrictHostKeyChecking=accept-new" \
  "$dir" "frotak-backup@${WG_SERVICE}:"

find "$root" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "backup $stamp: $(du -sh "$dir" | cut -f1)"
