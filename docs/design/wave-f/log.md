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

### F3. Импорт справочников из Excel (03.11.2026)

Сделано:

- `src/domain/gas-ops/directory-import.ts`, порт `importDirectory` и `addObject`.
- `DirectoryImport.tsx` на «Справочниках», `AddObject.tsx` на «Объектах».
- `Brigade.phone`, миграция `db/migrations/20261104100000_gas_wave_f.sql`, OpenAPI перегенерирован.

Проверено:

- `bun test tests`: 1332 из 1332 (9 новых).
- `npx playwright test e2e/gas-directory-import.spec.ts --project=desktop`: 4 из 4, axe без serious.
- `DATABASE_URL=… bun run check:db`: паритет с демо-адаптером подтверждён.
- `bun run typecheck`, `lint` (0 ошибок), `check:copy`, `check:typography`.

### F4. Мастер смет (03.11.2026)

Сделано:

- `ImportWizard`: `recognized` сворачивает шаг колонок; смета передаёт «формат узнан».
- Предпросмотр мастера показывает строки ниже «ВСЕГО».
- `recalcObject`: проверенная без суммы получает долю, закрытая неделя не меняется; `recalcNote` для тоста.

Проверено:

- `bun test tests`: 1335 из 1335.
- `npx playwright test e2e/gas-import.spec.ts e2e/gas-estimates.spec.ts e2e/gas-cost-rule.spec.ts --project=desktop`: 9 из 9.
- `bun run typecheck`, `lint` (0 ошибок), `check:copy`.

### F5. Демо-неделя для показа (03.11.2026)

Сделано:

- `src/data/mock/gas-ops-showcase.ts` для публичного контура: 25 из 28, 9 причин, 10 смет, правило подтверждено.
- Версия хранилища 8, пример недели на лендинге пересчитан.
- «Неделя»: при частичной сумме чел.-ч осталась ссылка «Показать записи» без состава.

Проверено:

- `bun test tests`: 1345 из 1345 (6 новых).
- Полный `npx playwright test`: 541 прошли, 5 упали на старых ожиданиях данных. Исправлены: версия наборов e2e, тост ОБ-001, строка чел.-ч; повторный запуск этих файлов зелёный.

### F6. Режим кабинета заказчика (03.11.2026)

Сделано:

- `src/lib/cabinet.ts`: `VITE_CABINET_ONLY`, `VITE_CABINET_CLIENT`, перенаправление в /gas, заголовок вкладки.
- Без показа, лендинга, меток «Демо» и «Пример», сброса демо и «Демо-подрядчика».
- `bun run test:cabinet`: своя сборка в `.output-cabinet`, `e2e/cabinet/cabinet.spec.ts`.

Проверено:

- `tests/ui/cabinet.test.ts`: 4 из 4.
- `bun run test:cabinet`: 2 из 2.
