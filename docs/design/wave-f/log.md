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

### F2. Конструктор «Что идёт в стоимость работ» (03.11.2026)

Сделано:

- Домен `work-cost.ts`: слагаемые `extra:<подпись>`, `ruleExample`, `termChoices`, `validateTerms`, редакции `reviseRule` / `confirmRule` / `revertRule`.
- Порт: `saveCostRule`, `undoCostRule`; `confirmCostRule` подтверждает ту редакцию, что видел человек.
- Экран: `RuleBuilder.tsx`, «Настроить», «Своё правило для объекта», метка «своё правило», история редакций, строки ниже «ВСЕГО» в шторке сметы.

Проверено:

- `bun test tests`: 1323 из 1323 (8 новых).
- `npx playwright test e2e/gas-cost-rule.spec.ts e2e/gas-estimates.spec.ts --project=desktop`: 5 из 5, axe без serious.
- `bun run typecheck`, `lint` (0 ошибок), `check:copy`, `check:typography`.
