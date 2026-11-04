#!/usr/bin/env bash
# Prova que o ultimo backup restaura: sobe uma copia num conteiner descartavel e compara com o
# banco em uso. Roda sem rede (--network none) para os jobs do pg_cron da copia nao chamarem nada.
set -euo pipefail
umask 077

root=/var/backups/frotak
latest="$(find "$root" -mindepth 1 -maxdepth 1 -type d | sort | tail -1)"
[ -n "$latest" ] || { echo "nenhum backup em $root" >&2; exit 1; }
(cd "$latest" && sha256sum -c --quiet SHA256SUMS)

image="$(docker inspect --format '{{.Config.Image}}' frotak-db)"
work="$(mktemp -d /var/lib/frotak/restore-test.XXXXXX)"
cleanup() {
  docker rm -f frotak-restore-test >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

mkdir -p "$work/data" "$work/config"
tar -xzf "$latest/postgres.tar.gz" -C "$work/data"
tar -xzf "$latest/db-config.tar.gz" -C "$work/config"
chmod 700 "$work/data"

docker run -d --name frotak-restore-test --network none \
  -v "$work/data:/var/lib/postgresql/data" -v "$work/config:/etc/postgresql-custom" \
  -e POSTGRES_PASSWORD=restore-test "$image" \
  postgres -c config_file=/etc/postgresql/postgresql.conf -c shared_buffers=256MB >/dev/null

ready=""
for _ in $(seq 1 90); do
  if docker exec frotak-restore-test pg_isready -q -U postgres -h 127.0.0.1 2>/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
if [ -z "$ready" ]; then
  docker logs --tail 30 frotak-restore-test >&2
  echo "a copia nao subiu" >&2
  exit 1
fi

query='select (select count(*) from supabase_migrations.schema_migrations),
              (select count(*) from auth.users),
              (select count(*) from public.tenants),
              (select count(*) from public.modules),
              (select count(*) from storage.buckets)'
live="$(docker exec frotak-db psql -X -At -U supabase_admin -h 127.0.0.1 -d postgres -c "$query")"
restored="$(docker exec -e PGPASSWORD=restore-test frotak-restore-test psql -X -At -U supabase_admin -h 127.0.0.1 -d postgres -c "$query")"
echo "backup testado: $(basename "$latest")"
echo "migrations|usuarios|clientes|modulos|buckets"
echo "em uso:    $live"
echo "restaurado: $restored"

# Depois do backup o banco pode ter ganhado linhas, mas migrations e catalogos nao podem faltar.
IFS='|' read -r live_migrations _ _ live_modules live_buckets <<<"$live"
IFS='|' read -r restored_migrations _ _ restored_modules restored_buckets <<<"$restored"
if [ "$restored_migrations" -ne "$live_migrations" ] || [ "$restored_modules" -ne "$live_modules" ] \
  || [ "$restored_buckets" -ne "$live_buckets" ]; then
  echo "a copia nao bate com o banco em uso" >&2
  exit 1
fi
echo "restauracao OK"
