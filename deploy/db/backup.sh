#!/usr/bin/env bash
# Backup diario. Tem duas camadas:
# - copia fisica do servidor inteiro, para recuperar a VPS em caso de desastre;
# - um arquivo por banco, para restaurar um cliente sem encostar nos outros (agente: restore-client).
# Fica 14 dias aqui e segue pela WireGuard para a VPS de Servico, que guarda 30 dias.
# -E: a limpeza (trap ERR) tambem roda quando o erro acontece dentro de uma funcao (limit).
set -Eeuo pipefail
umask 077

# shellcheck disable=SC1091
. /etc/frotak/hosts.env

# Cada passo tem limite de tempo. Em 13/11/2026 um "docker exec ... pg_dump" ficou preso sem
# processo nenhum dentro do container e o backup parou por 11 dias sem avisar. Estourou o limite,
# o passo falha, a pasta do dia e apagada e o servico fica "failed" (aparece em systemctl --failed).
limit() {
  local seconds=$1
  shift
  timeout --kill-after=60 "$seconds" "$@"
}

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
root=/var/backups/frotak
dir="$root/$stamp"
install -d -m 700 "$root" "$dir" "$dir/clients"
trap 'rm -rf "$dir"' ERR

limit 7200 docker exec frotak-db pg_basebackup -U supabase_admin -h /var/run/postgresql -D - -Ft -X fetch -z > "$dir/postgres.tar.gz"
limit 1800 tar -C /var/lib/docker/volumes/frotak_db-config/_data -czf "$dir/db-config.tar.gz" .
limit 1800 tar -C /etc -czf "$dir/etc-frotak.tar.gz" frotak
limit 3600 tar -C /var/lib/frotak -czf "$dir/central-storage.tar.gz" storage

limit 1800 docker exec frotak-db pg_dump -U supabase_admin -h 127.0.0.1 -Fc -d frotak_central > "$dir/central.dump"
shopt -s nullglob
for envfile in /etc/frotak/clients/*.env; do
  slug="$(basename "$envfile" .env)"
  database="$(grep '^CLIENT_DB=' "$envfile" | cut -d= -f2-)"
  storage_dir="$(grep '^CLIENT_STORAGE_DIR=' "$envfile" | cut -d= -f2-)"
  limit 1800 docker exec frotak-db pg_dump -U supabase_admin -h 127.0.0.1 -Fc -d "$database" > "$dir/clients/$slug.dump"
  limit 3600 tar -C "$storage_dir" -czf "$dir/clients/$slug.storage.tar.gz" .
done
(cd "$dir" && find . -type f ! -name SHA256SUMS -print0 | xargs -0 sha256sum > SHA256SUMS)
trap - ERR

limit 3600 rsync -a -e "ssh -i /root/.ssh/frotak_backup -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20" \
  "$dir" "frotak-backup@${WG_SERVICE}:"

find "$root" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "backup $stamp: $(du -sh "$dir" | cut -f1)"
