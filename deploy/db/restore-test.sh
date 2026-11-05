#!/usr/bin/env bash
# Prova que o ultimo backup restaura: sobe uma copia fisica num conteiner descartavel e compara com
# os bancos em uso; depois restaura o arquivo de cada cliente dentro dessa copia e confere. Roda sem
# rede (--network none) para nada da copia chamar o mundo de fora.
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
  postgres -c config_file=/etc/postgresql/postgresql.conf -c shared_buffers=256MB \
  -c cron.database_name=frotak_jobs -c pg_net.database_name=frotak_jobs >/dev/null

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

live() { docker exec frotak-db psql -X -At -U supabase_admin -h 127.0.0.1 -d "$1" -c "$2"; }
copy() { docker exec -e PGPASSWORD=restore-test frotak-restore-test psql -X -At -U supabase_admin -h 127.0.0.1 -d "$1" -c "$2"; }
query='select (select count(*) from supabase_migrations.schema_migrations), (select count(*) from public.modules), (select count(*) from storage.buckets)'
counts='select (select count(*) from auth.users) || chr(124) || (select count(*) from public.tenants) || chr(124) || (select count(*) from public.vehicles)'

echo "backup testado: $(basename "$latest")"
failed=0

# Depois do backup o banco pode ter ganhado linhas, mas migrations e catalogos nao podem faltar.
if [ "$(live frotak_central "$query")" != "$(copy frotak_central "$query")" ]; then
  echo "FALHA: copia fisica do Central nao bate" >&2
  failed=1
else
  echo "copia fisica: Central confere ($(copy frotak_central "$counts"))"
fi

shopt -s nullglob
for dump in "$latest"/clients/*.dump; do
  slug="$(basename "$dump" .dump)"
  database="frotak_${slug//-/_}"
  scratch="restore_${slug//-/_}"
  docker exec -e PGPASSWORD=restore-test frotak-restore-test psql -X -q -U supabase_admin -h 127.0.0.1 -d postgres -c "CREATE DATABASE \"$scratch\" TEMPLATE template0" >/dev/null
  docker exec -i -e PGPASSWORD=restore-test frotak-restore-test pg_restore -U supabase_admin -h 127.0.0.1 -d "$scratch" --no-comments < "$dump" >/dev/null 2>&1 || true
  if [ "$(live "$database" "$query")" = "$(copy "$scratch" "$query")" ]; then
    echo "$slug: arquivo restaura e confere ($(copy "$scratch" "$counts"))"
  else
    echo "FALHA: arquivo de $slug nao bate" >&2
    failed=1
  fi
done

[ "$failed" = 0 ] || exit 1
echo "restauracao OK"
