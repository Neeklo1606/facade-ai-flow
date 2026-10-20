# 00. Мастер-план газового направления

**Цель.** Заменить устную передачу времени бригадирами и ручной Excel: бригадир вводит время
в боте, менеджер проверяет, система считает выработку и отдаёт привычный недельный отчёт.

**Где лежит.** Раздел `/gas` внутри текущего интерфейса ГАЙКИ (ADR-043). Ветка
`feature/gas-ops-prototype`, рабочая копия `~/Projects/gas-ops-prototype`.

## Слои

| Слой | Файлы |
|---|---|
| Домен | `src/domain/gas-ops/{model,calc,report,view}.ts` |
| Порт | `src/ports/gas-ops.ts` |
| Адаптер | `src/adapters/gas-ops/{demo,state,xlsx}.ts` |
| Слой данных | `src/api/gas-ops.ts`, `src/api/gas-export.ts` |
| Экраны | `src/routes/gas/*`, `src/components/gas-ops/*` |
| Данные | `src/data/mock/fact-report.anonymized.json`, `gas-ops-seed.ts` |
| Скрипты | `scripts/parse-fact-report.ts`, `audit-fact-report.ts`, `check-gas-export.ts` |

Экраны не импортируют домен, порты и адаптеры: только `@/api/gas-ops` (правило eslint, ADR-001).

## Маршруты

`/gas` сводка · `/gas/foreman` ввод времени · `/gas/moderation` проверка · `/gas/entries` журнал ·
`/gas/reports` отчёт и выгрузка · `/gas/brigades` · `/gas/objects` · `/gas/estimates` ·
`/gas/employees` · `/gas/admin`.

## Критерии готовности

1. Минуты считаются от времени, доходность от минут, деление на ноль запрещено.
2. Итоги бригад и групп сходятся с фактическим отчётом заказчика до рубля.
3. Подтверждение записи меняет отчёт и сводку в одном состоянии.
4. Выгрузка повторяет структуру файла заказчика и открывается скриптом.
5. Ни одного реального ФИО и адреса в git, скриншотах и выгрузке.
6. Каждый экран на 375 px без горизонтальной прокрутки страницы.

## Команды проверки

```bash
bun run scripts/parse-fact-report.ts     # заново собрать анонимизированный набор
bun run scripts/audit-fact-report.ts     # сверка выгрузки с итогами файла
bun test tests/domain/gas-ops-*.test.ts  # расчёты и агрегация
bun run scripts/check-gas-export.ts      # выгрузка XLSX против расчёта
npx playwright test e2e/gas.spec.ts      # экраны и сквозной сценарий
bun run ci                               # конвейер целиком
```
