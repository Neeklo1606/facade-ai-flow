#!/bin/sh
# Резервная копия рабочего контура (ADR-086): база PostgreSQL и исходные файлы смет.
#
#   DATABASE_URL=postgres://… ESTIMATE_FILES_DIR=/data/estimate-files BACKUP_DIR=/backups \
#     sh scripts/gas-backup.sh
#
# В Docker: docker compose --env-file deploy/.env --profile tools run --rm backup
# Каталог копии: $BACKUP_DIR/gaika-<время UTC>/ с db.dump (pg_dump custom),
# estimate-files.tar.gz, counts.tsv (строки таблиц на момент копии) и SHA256SUMS.
# Копии старше BACKUP_KEEP_DAYS (по умолчанию 14) удаляются. Проверка: scripts/gas-restore-check.sh
set -eu

: "${DATABASE_URL:?задайте DATABASE_URL}"
FILES_DIR="${ESTIMATE_FILES_DIR:-./data/estimate-files}"
OUT="${BACKUP_DIR:-./backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST="$OUT/gaika-$STAMP"

sha() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

mkdir -p "$DEST"

# Строки таблиц до копии: проверка восстановления сверяет с ними
psql "$DATABASE_URL" -X -A -t -F '	' -v ON_ERROR_STOP=1 -c "
  select 'employees', count(*) from employees
  union all select 'auth_invites', count(*) from auth_invites
  union all select relname, n from (
    select c.relname, (xpath('/row/n/text()', query_to_xml('select count(*) as n from ' || quote_ident(c.relname), false, true, '')))[1]::text::bigint as n
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind = 'r' and c.relname like 'gas\_%'
  ) t order by 1" > "$DEST/counts.tsv"

pg_dump --format=custom --no-owner --no-privileges --file="$DEST/db.dump" "$DATABASE_URL"

if [ -d "$FILES_DIR" ]; then
  tar -C "$FILES_DIR" -czf "$DEST/estimate-files.tar.gz" .
else
  echo "Каталога файлов смет $FILES_DIR нет: в копии пустой архив" >&2
  EMPTY=$(mktemp -d)
  tar -C "$EMPTY" -czf "$DEST/estimate-files.tar.gz" .
  rmdir "$EMPTY"
fi

(cd "$DEST" && sha db.dump estimate-files.tar.gz counts.tsv > SHA256SUMS)

# Старые копии: только каталоги этого скрипта
find "$OUT" -mindepth 1 -maxdepth 1 -type d -name 'gaika-*' -mtime +"$KEEP" -exec rm -rf {} +

echo "$DEST"
