#!/bin/zsh
set -u
cd "$(dirname "$0")/.."
W="/Users/neeklo/Documents/Project/САЙТЫ/СТРОЙКА CRM/facade-ai-flow/.verify-walk"
log() { echo "\n━━ $1 ━━ $(date +%H:%M)" >> "$W/verify.log"; }
export NITRO_PRESET=node-server
export DATABASE_URL="postgres://localhost/postgres?sslmode=disable"

log "сборка демонстрации"
timeout 900 bun run build >> "$W/verify.log" 2>&1; echo "код: $?" >> "$W/verify.log"
log "размер бандла (демо)"
timeout 120 bun run check:bundle >> "$W/verify.log" 2>&1; echo "код: $?" >> "$W/verify.log"
log "сквозные тесты"
timeout 2400 bun run test:e2e >> "$W/verify.log" 2>&1; echo "код: $?" >> "$W/verify.log"
log "lighthouse"
timeout 900 bun run lighthouse >> "$W/verify.log" 2>&1; echo "код: $?" >> "$W/verify.log"
log "обход: тёмная тема"
WALK_OUT="$W/dark" timeout 5400 bun run walkthrough >> "$W/verify.log" 2>&1; echo "код: $?" >> "$W/verify.log"
log "обход: светлая тема"
WALK_OUT="$W/light" WALK_THEME=light timeout 5400 bun run walkthrough >> "$W/verify.log" 2>&1; echo "код: $?" >> "$W/verify.log"
log "ВСЁ"
