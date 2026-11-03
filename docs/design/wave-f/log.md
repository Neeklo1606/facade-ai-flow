# Волна F: журнал

ADR-062. Ветка `feature/gas-wave-f` от `origin/main` cb6a9f7.

### F1. Тур не перехватывает навигацию (03.11.2026)

Сделано:

- `src/lib/gas-ops/tour.ts`: номер нажатия `request`, `startTour(id, { go: false })` для автостарта, `resumeTour()`.
- `Tour.tsx`: переход только по новому нажатию; на чужом экране плашка «Продолжить тур» с ×.
- `GasShell.tsx`: автостарт только на домашнем экране роли.

Проверено:

- `npx playwright test e2e/gas-tour.spec.ts --project=desktop`: 11 из 11 (4 новых).
- `bun test tests/ui/tour-state.test.ts`: 4 из 4.
- `bun run typecheck`, eslint и prettier по изменённым файлам, `check:copy`, `check:typography`: без замечаний.
