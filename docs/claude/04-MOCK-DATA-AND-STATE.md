# 04. Данные и состояние

## Откуда данные

1. **Факт.** `scripts/parse-fact-report.ts` читает `docs/source/fact-report.xlsx`
   (в git не попадает) и пишет `src/data/mock/fact-report.anonymized.json`:
   3 группы, 10 бригад, 10 сотрудников и составов, 82 объекта, 93 записи, 1 524 132 ₽.
2. **Демо-сценарии.** `src/data/mock/gas-ops-seed.ts` добавляет девять записей с `source: "mock"`:
   черновик, очередь проверки, пересечение, дубль, отклонение, уточнение, ввод за вчера,
   объект без подтверждённой стоимости.

У каждой записи есть `source`. В интерфейсе факт и демо различимы меткой рядом со значением.

## Состояние

`src/adapters/gas-ops/state.ts` — снимок во вкладке (`localStorage`, ключ `neeklo-gas-ops-v1`).
Поднимается **после** первой отрисовки (`hydrate`), иначе разметка сервера и клиента разойдутся.
Кнопка «Сбросить данные учёта» возвращает исходный набор.

«Сегодня» направления — 03.10.2026, последний день недели отчёта: подтверждение записи видно
в том же отчёте, который открыт на экране.

## Типы

`Brigade`, `Employee`, `User`, `WorkObject` (не `Object`), `Estimate`, `TimeEntry`, `Review`,
`AuditLog`, `ReportRow` — `src/domain/gas-ops/model.ts` и `report.ts`.

## Проверка

```bash
bun run scripts/parse-fact-report.ts   # падает, если в выгрузку попали ФИО или улица
bun run scripts/audit-fact-report.ts
```
