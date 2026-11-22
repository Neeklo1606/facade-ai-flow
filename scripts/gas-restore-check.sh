#!/bin/sh
# Проверка восстановления копии (ADR-085) на ОТДЕЛЬНОЙ базе и в отдельном каталоге:
# рабочую базу и том файлов скрипт не трогает.
#
#   RESTORE_DATABASE_URL=postgres://…/gaika_restore RESTORE_FILES_DIR=/tmp/restore-files \
#     sh scripts/gas-restore-check.sh /backups/gaika-20261123T020000Z
#
# База RESTORE_DATABASE_URL должна существовать и быть пустой (createdb gaika_restore).
# Шаги: контрольные суммы копии, pg_restore, распаковка файлов, сверка строк таблиц
# с counts.tsv и каждого файла сметы из gas_estimate_files с его SHA-256.
# Код выхода 0 и строка «Восстановление проверено» — копия годная.
set -eu

DIR="${1:?укажите каталог копии: sh scripts/gas-restore-check.sh backups/gaika-…}"
: "${RESTORE_DATABASE_URL:?задайте RESTORE_DATABASE_URL: отдельная пустая база}"
FILES="${RESTORE_FILES_DIR:?задайте RESTORE_FILES_DIR: отдельный каталог}"

if [ -n "${DATABASE_URL:-}" ] && [ "$DATABASE_URL" = "$RESTORE_DATABASE_URL" ]; then
  echo "RESTORE_DATABASE_URL совпадает с рабочей DATABASE_URL: восстановление только в отдельную базу" >&2
  exit 2
fi

sha() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}
q() { psql "$RESTORE_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "$1"; }

echo "1. Контрольные суммы копии"
(cd "$DIR" && if command -v sha256sum >/dev/null 2>&1; then sha256sum -c SHA256SUMS; else shasum -a 256 -c SHA256SUMS; fi)

echo "2. База: pg_restore в отдельную базу"
TABLES=$(q "select count(*) from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r'")
if [ "$TABLES" != "0" ]; then
  echo "В базе восстановления уже есть таблицы ($TABLES): нужна пустая база" >&2
  exit 2
fi
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$RESTORE_DATABASE_URL" "$DIR/db.dump"

echo "3. Файлы смет в $FILES"
mkdir -p "$FILES"
tar -C "$FILES" -xzf "$DIR/estimate-files.tar.gz"

echo "4. Строки таблиц"
FAIL=0
while IFS='	' read -r table expected; do
  [ -n "$table" ] || continue
  actual=$(q "select count(*) from \"$table\"")
  if [ "$actual" != "$expected" ]; then
    echo "   $table: в копии $expected, восстановлено $actual" >&2
    FAIL=1
  fi
done < "$DIR/counts.tsv"
echo "   таблиц сверено: $(grep -c . "$DIR/counts.tsv")"

echo "5. Исходные файлы смет"
CHECKED=0
for line in $(q "select sha256 || ':' || storage_path from gas_estimate_files where storage_path is not null"); do
  want=${line%%:*}
  path=${line#*:}
  if [ ! -f "$FILES/$path" ]; then
    echo "   нет файла $path" >&2
    FAIL=1
    continue
  fi
  got=$(sha "$FILES/$path" | cut -d' ' -f1)
  if [ "$got" != "$want" ]; then
    echo "   файл $path: сумма не совпала" >&2
    FAIL=1
  fi
  CHECKED=$((CHECKED + 1))
done
echo "   файлов сверено: $CHECKED"

if [ "$FAIL" != "0" ]; then
  echo "Восстановление НЕ сошлось" >&2
  exit 1
fi
echo "Восстановление проверено"
