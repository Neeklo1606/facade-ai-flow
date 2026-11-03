/**
 * Контракты API учёта времени (ADR-061, 14; BACKEND HANDOFF v1.1, раздел 4).
 *
 * Строки таблиц описаны в `./gas.ts`. Здесь — то, что ходит по сети: входы действий порта
 * (их проверяет серверная функция до вызова порта) и ответы `/api/v1`, которые собирает
 * бэкенд. `docs/api/openapi.yaml` строится из этих схем скриптом `scripts/gas-openapi.ts`.
 */
import { z } from "zod";
import {
  gasBrigades,
  gasEntryFlag,
  gasEntryStatus,
  gasObjects,
  gasPeriodVersions,
  gasAudit,
  gasReviews,
  gasRole,
  gasTimeEntries,
} from "./gas";

const id = z.string().min(1);
const day = z.string().date();
/** Время так, как его ввёл человек: «8:20», «8.20» или минуты от полуночи */
const clock = z.union([z.string().min(1), z.number().int()]);
const breakMinutes = z.union([z.string(), z.number().int().min(0)]);

/* ---------- Входы действий ---------- */

export const gasPersonInput = z
  .object({ employeeId: id, start: clock, end: clock, breakMinutes })
  .strict();

export const gasCreateEntryInput = z
  .object({
    day,
    brigadeId: id,
    employeeId: id.nullable(),
    objectId: id,
    start: clock,
    end: clock,
    breakMinutes,
    submit: z.boolean(),
    headcount: z.number().int().min(1).nullable().optional(),
    people: z.array(gasPersonInput).nullable().optional(),
    clientKey: z.string().max(200).nullable().optional(),
    channel: z.enum(["web", "bot", "manager", "import"]).optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const gasUpdateEntryInput = z
  .object({
    id,
    start: clock.optional(),
    end: clock.optional(),
    breakMinutes: breakMinutes.optional(),
    objectId: id.optional(),
    day: day.optional(),
    headcount: z.number().int().min(1).nullable().optional(),
    comment: z.string().max(2000).optional(),
  })
  .strict();

export const gasReviewInput = z
  .object({
    id,
    action: z.enum(["confirm", "reject", "clarify"]),
    comment: z.string().max(2000).optional(),
  })
  .strict();

export const gasAnswerInput = z.object({ id, text: z.string().min(1).max(2000) }).strict();

export const gasCloseWeekInput = z
  .object({ accepted: z.array(z.object({ key: z.string(), reason: z.string() }).strict()) })
  .strict();

export const gasReopenWeekInput = z.object({ reason: z.string().trim().min(1) }).strict();

/** Выгрузка недели на сервере из хранилища: какая неделя и какая версия */
export const gasExportInput = z
  .object({
    kind: z.enum(["approved", "draft"]),
    weekFrom: day,
    version: z.number().int().min(1).nullable(),
  })
  .strict();

/**
 * Аргументы методов порта по имени. Метод, которого здесь нет, принимает данные мастера
 * импорта (смета, график) и проверяется правилами порта; схема для него — задача B4
 */
export const gasMethodArgs: Record<string, z.ZodTypeAny> = {
  snapshot: z.tuple([]),
  createEntry: z.tuple([gasCreateEntryInput]),
  updateEntry: z.tuple([gasUpdateEntryInput]),
  submitEntry: z.tuple([id]),
  review: z.tuple([gasReviewInput]),
  undoReview: z.tuple([id]),
  undoAutoAccept: z.tuple([id]),
  fieldSnapshot: z.union([z.tuple([]), z.tuple([id.optional()])]),
  answerClarify: z.tuple([gasAnswerInput]),
  closeWeek: z.tuple([gasCloseWeekInput]),
  reopenWeek: z.tuple([gasReopenWeekInput]),
  finalCheck: z.tuple([]),
  issueReport: z.tuple([]),
};

/* ---------- Ответы /api/v1 ---------- */

export const gasApiError = z
  .object({
    code: z.string(),
    message: z.string(),
  })
  .strict();

export const gasMe = z
  .object({ id, name: z.string(), role: gasRole.schema, brigadeId: id.nullable() })
  .strict();

/** Запись в ответе: строка таблицы с признаками; у ролей без денег суммы null */
export const gasTimeEntry = gasTimeEntries.extend({
  flags: z.array(gasEntryFlag),
  version: z.number().int().describe("номер версии строки для If-Match"),
});

export const gasObject = gasObjects;
export const gasBrigade = gasBrigades;
export const gasReview = gasReviews;
export const gasAuditItem = gasAudit;
export const gasWeekVersion = gasPeriodVersions;

export const gasQueueItem = z
  .object({
    entry: gasTimeEntry,
    flags: z.array(gasEntryFlag),
    reasons: z.array(z.string()).describe("что проверить: тексты правил"),
  })
  .strict();

export const gasEstimate = z
  .object({
    id,
    objectId: id.nullable(),
    version: z.number().int(),
    sourceFileName: z.string(),
    parseStatus: z.enum(["parsed", "issues", "confirmed", "discarded"]),
    approvedWorkAmount: z.number().nullable(),
    approvedBy: z.string().nullable(),
    approvedAt: z.string().nullable(),
  })
  .strict();

export const gasEstimateLine = z
  .object({
    sheet: z.string(),
    cell: z.string(),
    description: z.string(),
    unit: z.string().nullable(),
    qty: z.number().nullable(),
    workAmount: z.number().nullable(),
    materialAmount: z.number().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    reviewStatus: z.enum(["pending", "accepted", "excluded"]),
  })
  .strict();

export const gasEstimateApprove = z
  .object({
    approvedWorkAmount: z.number().min(0),
    selectedLines: z.array(z.string()),
    reason: z.string().min(1),
  })
  .strict();

export const gasWeeklyRow = z
  .object({
    brigadeId: id,
    objectId: id,
    day,
    minutes: z.number().int(),
    amountRub: z.number().nullable(),
    status: gasEntryStatus.schema,
  })
  .strict();

export const gasWeeklyReport = z
  .object({
    weekStart: day,
    version: z.number().int().nullable(),
    rows: z.array(gasWeeklyRow),
    totals: z.object({ amountRub: z.number().nullable(), minutes: z.number().int() }).strict(),
  })
  .strict();

export const gasExport = z
  .object({
    weekStart: day,
    version: z.number().int().nullable(),
    kind: z.enum(["approved", "draft"]),
    fileName: z.string(),
    checksum: z.string().describe("sha256 файла"),
    createdAt: z.string(),
  })
  .strict();
