#!/bin/zsh
# Первая неделя на чистой базе целиком: сброс, миграции, первый руководитель, обход сценария.
set -u
cd "$(dirname "$0")/../.."
URL="postgres://localhost/fieldops_clean?sslmode=disable"
pkill -f "node .output/server/index.mjs" 2>/dev/null
sleep 1
dropdb fieldops_clean 2>/dev/null
createdb fieldops_clean || exit 1
DATABASE_URL="$URL" bun run db:migrate > /dev/null 2>&1 || exit 1
LINK=$(DATABASE_URL="$URL" SESSION_SECRET=proverka bun run db:owner \
  --name "Соколов Артём" --phone "+79216552784" --url "http://localhost:4712" 2>&1 \
  | grep -o "http://localhost:4712/login?invite=[a-z0-9]*")
[ -z "$LINK" ] && { echo "db:owner не дал ссылку"; exit 1; }
echo "$LINK" > .verify/first-week/invite.txt
DATABASE_URL="$URL" SESSION_SECRET=proverka AUTH_CHANNEL=log PORT=4712 \
  node .output/server/index.mjs > .verify/first-week/server-week.log 2>&1 &
sleep 7
node .verify/first-week/week.mjs "$LINK"
CODE=$?
pkill -f "node .output/server/index.mjs" 2>/dev/null
exit $CODE
