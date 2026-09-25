#!/bin/zsh
set -u
cd "$(dirname "$0")/.."
W="/Users/neeklo/Documents/Project/САЙТЫ/СТРОЙКА CRM/facade-ai-flow/.verify-walk"
log() { echo "\n━━ $1 ━━ $(date +%H:%M)" >> "$W/verify.log"; }
export NITRO_PRESET=node-server
export DATABASE_URL="postgres://localhost/postgres?sslmode=disable"

log "конвейер"
timeout 3600 bun run ci >> "$W/verify.log" 2>&1; echo "код: $?" >> "$W/verify.log"
log "источники сравнения"
timeout 600 bun run check:sources >> "$W/verify.log" 2>&1; echo "код: $?" >> "$W/verify.log"
log "обход: тёмная тема"
WALK_OUT="$W/dark" timeout 5400 bun run walkthrough >> "$W/verify.log" 2>&1; echo "код: $?" >> "$W/verify.log"
log "обход: светлая тема"
WALK_OUT="$W/light" WALK_THEME=light timeout 5400 bun run walkthrough >> "$W/verify.log" 2>&1; echo "код: $?" >> "$W/verify.log"
log "ВСЁ"
