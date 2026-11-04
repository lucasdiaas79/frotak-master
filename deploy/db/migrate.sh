#!/usr/bin/env bash
# Aplica as migrations pendentes, na ordem do nome do arquivo, como o Supabase CLI faz.
# Registra em supabase_migrations.schema_migrations, entao o CLI enxerga o mesmo historico.
# Uso: ./migrate.sh DIRETORIO_DAS_MIGRATIONS
set -euo pipefail

migrations_dir="${1:?informe o diretorio das migrations}"
here="$(cd "$(dirname "$0")" && pwd)"

# Cada chamada recebe a entrada de forma explicita: "docker exec -i" consome o stdin que herdar.
run_psql() { docker exec -i -e PGOPTIONS='-c client_min_messages=warning' frotak-db psql -v ON_ERROR_STOP=1 -q -X -U postgres -h 127.0.0.1 -d postgres "$@"; }

run_psql <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
SQL

applied="$(run_psql -At -c 'select version from supabase_migrations.schema_migrations' </dev/null)"
mapfile -t files < <(printf '%s\n' "$migrations_dir"/*.sql "$here"/shim/*.sql | awk -F/ '{print $NF "\t" $0}' | LC_ALL=C sort | cut -f2-)
count=0
for file in "${files[@]}"; do
  base="$(basename "$file" .sql)"
  version="${base%%_*}"
  grep -qxF "$version" <<<"$applied" && continue
  echo "aplicando $base"
  run_psql -f - < "$file"
  run_psql -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '${base#*_}')" </dev/null
  count=$((count + 1))
done
echo "migrations aplicadas agora: $count; total registrado: $(run_psql -At -c 'select count(*) from supabase_migrations.schema_migrations' </dev/null)"
