# Журнал Сервиса v1

## S0. Подготовка (29.10.2026)

Сделано:
- Ветка `feature/service-v1` от `origin/feature/graphite` (9fe4a77), влит `origin/main`
  (1dcd55c, правки лендинга Lovable). Текстовых конфликтов нет: main менял только лендинг
  (`Landing.tsx`, стили `.landing-page`, `site-h1/h2`), токены и экраны graphite не задеты.
- Тесты и `check-links` брали путь через `new URL(...).pathname`: в пути с кириллицей он
  приходил закодированным, и 2 теста падали. Заменено на `fileURLToPath`, проверки те же.
- `e2e/desktop-layout.spec.ts`, лендинг 1024-1920: тест закреплял раскладку ADR-050
  (фрагмент справа от заголовка). Лендинг из main по ADR-053 (лендинг) ставит заголовок
  по центру и путь записи под ним тремя шагами в строку. Проверка переписана под
  утверждённую раскладку: фрагмент ниже заголовка, три шага в одну линию без наложения.
- docs/design/GAIKA_SERVICE_V1_PROMPTS.md положен. GAIKA_DESIGN_SYSTEM_V4.md
  и GAIKA_PREMIUM_PASS.md не найдены (ни в «Загрузках», ни в истории git).
- Скриншотов референсов нет: `refs/README.md` описывает, что и куда положить.
- Аудит трёх модулей: docs/design/service-v1/audit.md.
- Снимки «до»: docs/design/service-v1/before, 14 экранов × 390/1440 × светлая/тёмная = 56.
  Скрипт `scripts/service-v1-shots.ts` (он же для «после»).
- ADR-055 «Сервис v1»: docs/adr/ADR-055-service-v1.md.

Проверено командой:
- `bun test tests`: 1065 pass, 0 fail.
- `bunx playwright test e2e/desktop-layout.spec.ts -g лендинг`: 5 passed.
- `bun run ci` с `CHECK_DATABASE_URL` на локальный PostgreSQL 16 (`?sslmode=disable`):
  конвейер пройден, все 15 шагов; сквозных 455 passed, 18 skipped, Lighthouse пройден.
- `bun scripts/service-v1-shots.ts`: 56 из 56, утечек фамилий и прокрутки вбок нет.

Осталось и замечания:
- Локальный CI требует PostgreSQL 16 и `sslmode=disable` в адресе: dbmate иначе требует SSL.
- Рабочего клона не было: папка `facade-ai-flow` содержала только старые документы и
  `.bundles`. Свежий клон лежит в `facade-ai-flow-clone`, старая папка не тронута.
- Файлов заказчика (`.local/client-files/`) в клоне нет.
