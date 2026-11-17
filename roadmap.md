# Frontend clarity

- [x] Simplify shared surfaces, typography, controls and table actions.
- [x] Make navigation and object selection visible at laptop widths.
- [x] Simplify overview content and preserve source access.
- [x] Verify core screens and interactions in both themes and narrow layouts.
- [x] Apply required package security update and check preview diagnostics.

## Premium product pass

- [x] Refine shared theme, navigation, typography and control states without changing workflows.
- [x] Improve mobile targets, headers, tables and bottom navigation.
- [x] Verify key screens and interactions across phone, tablet and desktop in both themes.
- [x] Record decisions, checks and remaining limitations.

Validation limitation: five full-demo tests stop at the Excel download filename (`download` instead of `Сводка…`); export behavior was not changed in this frontend task. Physical-device checks and production publication were not performed.

## Mobile navigation

- [x] Make the existing phone navigation a focus-managed slide-out panel.
- [x] Improve shared mobile typography and readable navigation labels.
- [x] Verify opening, closing, section navigation and desktop layout.

## Premium landing

- [x] Refine landing composition, typography and section hierarchy without changing approved claims.
- [x] Add restrained entrance and interaction animations with reduced-motion support.
- [x] Verify both themes, phone and desktop layouts, demo links and FAQ interactions.

## Проверка часов и сметы · 17.11.2026

- [x] Зафиксировать Task Brief и ADR-073 в рамках пяти изменений.
- [x] Сочетать диапазон дат с существующими фильтрами проверки.
- [x] Выбирать доступные записи, подтверждать пакет с отменой и частичным результатом.
- [x] Проверить исходные даты/объекты и отсутствие повторного учёта в табеле.
- [x] Добавить вторичный переход «Сметы» из бригад и повтор загрузки после ошибки папки.
- [x] Разрешить руководителю операции версий смет в UI, порте и сервере.
- [x] Выполнить 49 целевых тестов и линтер (0 ошибок).
- [ ] Завершить типы, сборку и браузерную проверку после восстановления доступа к зависимостям.
- [ ] Проверить CI ветки, синхронизацию и публикацию Lovable.

Блокер текущей среды: CONNECT HTTP 403 к cdn.sheetjs.com и europe-west1-npm.pkg.dev.
Разрешения сохранены в сетевом черновике, но не применены к машине. Dev-сервер и сборка
останавливаются на отсутствующем @tanstack/react-start. Четыре новых browser-сценария
зарегистрированы Playwright для desktop/mobile, но не выполнены. Боевой выпуск не проверен.

## Карточки проверки · 17.11.2026

- [x] Зафиксировать план экрана и следующих связей объект → бот → смета → настройки.
- [x] Центральные карточки, раскрытие на месте, автор/время/канал, независимый выбор.
- [x] Сохранить подтверждение/отмену и исходные даты/объекты в табеле.
- [x] Проверить типы, сборку, весь unit-набор и 6 desktop/mobile сценариев.
- [ ] Реестр ботов по объектам, конкретный мессенджер в записи и управление связями.
- [ ] Проверить реальные входящие из настроенных MAX/Telegram и повторы доставки.

Публикация этого изменения не выполнялась. См. docs/briefs/review-cards.md и ADR-074.
