/**
 * Оценка качества извлечения (GAIKA_AI_GATEWAY.md, раздел 9; ADR-035, п. 5).
 *
 * Прогоняет набор из 30 синтетических сообщений через выбранный шлюз и печатает: точность
 * по полям, полноту обязательных полей, критические ошибки (объект, дата, количество, единица,
 * двойной учёт), время и стоимость. Отчёт с версией модели и промпта — в `evals/reports`.
 *
 * Запуск:
 *   bun run eval:extract                       — демо-режим, проверяет саму оценку
 *   AI_MODE=live LLM_PROVIDER=deepseek LLM_API_KEY=… LLM_MODEL=deepseek-chat bun run eval:extract
 *
 * Без ключа живой прогон невозможен, и выдумывать его цифры нельзя: скрипт прямо говорит,
 * каким шлюзом он работал.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createModelGateway } from "../src/adapters/ai";
import { SAMPLE_CONTEXT, SAMPLE_CONTEXT_TWIN } from "../src/ai/samples/context";
import { SAMPLE_KINDS, SAMPLE_MESSAGES, type SampleKind } from "../src/ai/samples/messages";
import type { ExtractionResult } from "../src/contracts";

type AnyField = { value: unknown; basis: string; attention: string | null };
type Draft = Record<string, AnyField>;

const { gateway, reason } = createModelGateway();
const out = process.env["EVAL_OUT"] ?? "evals/reports";

/** Значения сравниваются как данные, а не как текст: 24 и «24» это одно и то же число */
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

interface FieldScore {
  total: number;
  matched: number;
  /** Поля, где эталон требует значение, а в ответе null */
  missing: number;
}

function scoreDrafts(
  expected: Draft[],
  actual: Draft[],
  score: FieldScore,
  errors: string[],
  label: string,
) {
  for (const [index, expectedDraft] of expected.entries()) {
    const actualDraft = actual[index];
    for (const [key, expectedField] of Object.entries(expectedDraft)) {
      score.total += 1;
      const actualField = actualDraft?.[key];
      if (!actualField) {
        score.missing += expectedField.value === null ? 0 : 1;
        continue;
      }
      if (same(expectedField.value, actualField.value)) {
        score.matched += 1;
        continue;
      }
      if (expectedField.value !== null && actualField.value === null) score.missing += 1;
      /*
       * Критические ошибки названы в документе поимённо: по ним решение человека будет
       * неверным, даже если остальные поля совпали.
       */
      if (key === "quantity" || key === "unit" || key === "dueDate" || key === "answerBy") {
        errors.push(
          `${label}[${index}].${key}: ждали ${JSON.stringify(expectedField.value)}, пришло ${JSON.stringify(actualField.value)}`,
        );
      }
    }
  }
}

/** Двойной учёт: сумма объёмов больше эталонной. Так ловится «10 + 8 и ещё итого 18» */
function doubleCount(expected: ExtractionResult, actual: ExtractionResult) {
  const sum = (result: ExtractionResult) =>
    result.workRecords.reduce((acc, record) => acc + (Number(record.quantity.value) || 0), 0);
  const expectedSum = sum(expected);
  const actualSum = sum(actual);
  return actualSum > expectedSum + 0.001 ? { expectedSum, actualSum } : null;
}

interface SampleReport {
  id: string;
  kind: SampleKind;
  ok: boolean;
  durationMs: number;
  fields: FieldScore;
  criticalErrors: string[];
  refusal?: string;
}

const reports: SampleReport[] = [];
const started = Date.now();
let costKopecks = 0;
let costKnown = true;

for (const sample of SAMPLE_MESSAGES) {
  const context = sample.twin ? SAMPLE_CONTEXT_TWIN : SAMPLE_CONTEXT;
  const answer = await gateway.extract({ message: sample.message, context, sourceId: null });
  const fields: FieldScore = { total: 0, matched: 0, missing: 0 };
  const errors: string[] = [];
  if (!answer.ok) {
    reports.push({
      id: sample.id,
      kind: sample.kind,
      ok: false,
      durationMs: answer.job.durationMs,
      fields,
      criticalErrors: ["разбор не получен"],
      refusal: answer.reason,
    });
    continue;
  }
  if (answer.job.costKopecks === null) costKnown = false;
  else costKopecks += answer.job.costKopecks;

  const value = answer.value;
  scoreDrafts(
    sample.expected.workRecords as unknown as Draft[],
    value.workRecords as unknown as Draft[],
    fields,
    errors,
    "workRecords",
  );
  scoreDrafts(
    sample.expected.tasks as unknown as Draft[],
    value.tasks as unknown as Draft[],
    fields,
    errors,
    "tasks",
  );
  scoreDrafts(
    sample.expected.risks as unknown as Draft[],
    value.risks as unknown as Draft[],
    fields,
    errors,
    "risks",
  );
  // Лишние сущности — тоже ошибка: придуманная работа попадёт в сводку
  const extra = value.workRecords.length - sample.expected.workRecords.length;
  if (extra > 0) errors.push(`лишних записей о работе: ${extra}`);
  /*
   * Ошибка «объект»: в сообщении назван чужой объект, эталон записей не ждёт, а они пришли.
   * Сверяемся с эталоном, а не с флагом набора: сообщение без названия объекта относится
   * к открытому объекту законно, и это не ошибка.
   */
  if (
    sample.kind === "twin-project" &&
    sample.expected.workRecords.length === 0 &&
    value.workRecords.length > 0
  ) {
    errors.push("объект: запись отнесена к открытому объекту, хотя назван другой");
  }
  const doubled = doubleCount(sample.expected, value);
  if (doubled) {
    errors.push(`двойной учёт: сумма ${doubled.actualSum} против ${doubled.expectedSum}`);
  }

  reports.push({
    id: sample.id,
    kind: sample.kind,
    ok: true,
    durationMs: answer.job.durationMs,
    fields,
    criticalErrors: errors,
  });
}

/* ---------- Печать ---------- */

const totals = reports.reduce(
  (acc, row) => ({
    total: acc.total + row.fields.total,
    matched: acc.matched + row.fields.matched,
    missing: acc.missing + row.fields.missing,
    critical: acc.critical + row.criticalErrors.length,
    parsed: acc.parsed + (row.ok ? 1 : 0),
    durationMs: acc.durationMs + row.durationMs,
  }),
  { total: 0, matched: 0, missing: 0, critical: 0, parsed: 0, durationMs: 0 },
);

const pct = (part: number, whole: number) =>
  whole === 0 ? "—" : `${((part / whole) * 100).toFixed(1)}%`;

console.log(`Шлюз: ${gateway.describe.provider}/${gateway.describe.model} (${reason})`);
console.log(`Версия промпта: ${gateway.describe.promptVersion}`);
console.log(`Сообщений: ${SAMPLE_MESSAGES.length}, разобрано: ${totals.parsed}`);
console.log(
  `Точность по полям: ${pct(totals.matched, totals.total)} (${totals.matched} из ${totals.total})`,
);
console.log(`Не заполнено там, где эталон требует значение: ${totals.missing}`);
console.log(`Критических ошибок: ${totals.critical}`);
console.log(
  `Время: ${(totals.durationMs / 1000).toFixed(1)} с на набор, ${Math.round(totals.durationMs / SAMPLE_MESSAGES.length)} мс на сообщение`,
);
console.log(
  costKnown && costKopecks > 0
    ? `Стоимость набора: ${(costKopecks / 100).toFixed(2)} ₽`
    : "Стоимость: неизвестна (в прайсе нет этой модели или токены не отданы)",
);

console.log("\nПо разрядам:");
for (const [kind, label] of Object.entries(SAMPLE_KINDS)) {
  const rows = reports.filter((row) => row.kind === kind);
  if (!rows.length) continue;
  const matched = rows.reduce((acc, row) => acc + row.fields.matched, 0);
  const total = rows.reduce((acc, row) => acc + row.fields.total, 0);
  const critical = rows.reduce((acc, row) => acc + row.criticalErrors.length, 0);
  console.log(`  ${label}: поля ${pct(matched, total)}, критических ${critical}`);
}

const failures = reports.filter((row) => row.criticalErrors.length > 0);
if (failures.length) {
  console.log("\nГде ошиблись:");
  for (const row of failures) {
    console.log(
      `  ${row.id}: ${row.criticalErrors.join("; ")}${row.refusal ? ` (${row.refusal})` : ""}`,
    );
  }
}

/* ---------- Отчёт ---------- */

await mkdir(out, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
const file = join(out, `${stamp}-${gateway.describe.provider}-${gateway.describe.model}.json`);
await writeFile(
  file,
  `${JSON.stringify(
    {
      at: new Date().toISOString(),
      provider: gateway.describe.provider,
      model: gateway.describe.model,
      promptVersion: gateway.describe.promptVersion,
      demo: gateway.describe.demo,
      reason,
      totals,
      costKopecks: costKnown ? costKopecks : null,
      wallClockMs: Date.now() - started,
      samples: reports,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
console.log(`\nОтчёт: ${file}`);

/*
 * Код возврата: в демо-режиме набор обязан пройти целиком — это проверка самой оценки.
 * На живой модели цифры — результат замера, а не повод уронить сборку.
 */
if (gateway.describe.demo && (totals.critical > 0 || totals.parsed !== SAMPLE_MESSAGES.length)) {
  console.error("\nОценка в демо-режиме не прошла: подготовленные разборы разошлись с эталоном");
  process.exit(1);
}
