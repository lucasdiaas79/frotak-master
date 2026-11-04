#!/usr/bin/env bash
# Backup diario: copia fisica do Postgres, arquivos do Storage e os segredos da instalacao.
# Fica 14 dias aqui e segue pela WireGuard para a VPS de Servico, que guarda 30 dias.
# Quando houver object storage, o destino externo troca para ele.
set -euo pipefail
umask 077

# shellcheck disable=SC1091
. /etc/frotak/hosts.env

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
root=/var/backups/frotak
dir="$root/$stamp"
install -d -m 700 "$root" "$dir"
trap 'rm -rf "$dir"' ERR

docker exec frotak-db pg_basebackup -U supabase_admin -h /var/run/postgresql -D - -Ft -X fetch -z > "$dir/postgres.tar.gz"
tar -C /var/lib/frotak -czf "$dir/storage.tar.gz" storage
tar -C /var/lib/docker/volumes/frotak_db-config/_data -czf "$dir/db-config.tar.gz" .
tar -C /etc -czf "$dir/etc-frotak.tar.gz" frotak
(cd "$dir" && sha256sum ./*.tar.gz > SHA256SUMS)
trap - ERR

rsync -a -e "ssh -i /root/.ssh/frotak_backup -o BatchMode=yes -o StrictHostKeyChecking=accept-new" \
  "$dir" "frotak-backup@${WG_SERVICE}:"

find "$root" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "backup $stamp: $(du -sh "$dir" | cut -f1)"
