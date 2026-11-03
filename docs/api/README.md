# API учёта времени: OpenAPI и расхождения с черновиком

`openapi.yaml` собирается командой `bun run api:openapi` из контрактов zod:
- `src/contracts/gas-api.ts`: входы действий и ответы;
- `src/contracts/gas.ts`: строки таблиц.

Руками файл не правится. Тест `tests/db/gas-openapi.test.ts` держит его равным выводу генератора.

Основание:
- BACKEND HANDOFF v1.1 (Drive, папка 06), раздел 4 «API contract — черновик»;
- ADR-061, решение 14.

## Что уже работает в коде, а что только описано

| Что | Состояние |
| --- | --- |
| Серверная функция порта учёта времени | Работает за `VITE_DATA_SOURCE=server` и `DATABASE_URL` (`src/api/gas-ops-functions.ts`). Сейчас это один вход `gasOpsCallFn` на все методы порта, а не пути `/api/v1` |
| Роли, бригада, выборка ответа по роли | Работают, тесты в `tests/negative/gas-ops-server.test.ts` |
| Выгрузка xlsx из хранилища по неделе и версии | Работает в `/api/gas/export` (тело `{kind, weekFrom, version}`), заголовок `X-Checksum-Sha256` |
| Вебхук MAX | `/api/max/webhook` отвечает 501, обработчик и правила готовы и проверены тестами |
| Пути `/api/v1/...` | Только описаны в OpenAPI: их делает B3 поверх `callGasMethod` |

## Расхождения с черновиком HANDOFF v1.1

| Черновик HANDOFF | У нас | Почему и что решить |
| --- | --- | --- |
| Таблицы без префикса: `time_entries`, `max_links` | `gas_time_entries`, `gas_max_links` | Модули v1 лежат в одной базе с основным приложением (ADR-060). Переименовать при отделении базы, если захотите |
| `POST /time-entries/:id/review {action, reason, changes}` | `{action, comment}`; правка значений идёт через `PATCH` с обязательной причиной | Правка и решение в порте разделены (ADR-061, решение 10). `changes` в ответе есть: история проверки `Review.changes` |
| Статусы `draft/submitted/needs_clarification/approved/rejected` | `draft/pending/clarify/confirmed/rejected` | Те же пять состояний под другими именами. Переименование — косметика, решает B3 |
| `POST /weeks/:id/close {expectedVersion, exceptions, reason}` | `{accepted: [{key, reason}], expectedVersion}` | Исключения — это принятые причины с текстом (ADR-061, решение 11). Общей `reason` нет: причина у каждого исключения |
| `POST /weeks/:id/exports {format, profile, mode}` | `{kind: approved\|draft, version}` | Формат один (xlsx), профиль один (форма заказчика). `mode` у нас называется `kind` |
| `effective_minutes`, `start_at`, `end_at` | `minutes`, `startMinutes`, `endMinutes` (минуты от полуночи) | Время хранится минутами дня объекта, пояс — `APP_TIME_ZONE` |
| `time_entry_people (id, time_entry_id, user_id, minutes)` | `gas_time_entries.people` (jsonb: сотрудник, начало, конец, перерыв, минуты) | Нормализовать в таблицу — B2 |
| `estimates`, `estimate_lines`, `accruals`, `weeks`, `exports`, `organizations`, `object_assignments` | Сметы, назначения и правила в `gas_state`, недели в `gas_period_versions`; организации нет | В OpenAPI описаны схемы ответа. Таблицы и изоляция организаций — B2 |
| `source`, `external_message_id`, `idempotency_key` у записи | `channel` (`web/bot/manager/import`), `clientKey`; внешний id — в `gas_inbound_events` | `bot` — бот бригадира: в демо симулятор, на сервере MAX |
| `POST /integrations/max/webhook` | `/api/max/webhook` | Адрес задаётся при подписке на события, менять можно |
| Нет | `POST /time-entries/:id/answer`, `GET /time-entries/:id/reviews`, `POST /max/invites` | Ответ бригадира на уточнение, история записи, приглашение в бота |
| `version`/`If-Match` у записи | В OpenAPI есть. В хранилище версия общая на снимок (`gas_versions`) | Версия на строку — B3 вместе с точечными запросами (раздел 9.5, п. 5) |
