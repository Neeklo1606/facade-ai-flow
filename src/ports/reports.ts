import { z } from "zod";
import {
  evidence,
  extractions,
  fieldReport,
  projectDecision,
  sources,
  type Evidence,
  type Extraction,
  type FieldReport,
  type ProjectDecision,
  type Source,
} from "@/contracts";
import type { ShiftSummary } from "@/domain/shift";
import type { Actor } from "./common";

/**
 * Решение по отчёту. `review` — это отмена: решение снимается и отчёт возвращается в очередь
 * (ADR-028, п. 3). Таблица переходов `reportTransitions` такой возврат допускала и раньше,
 * ограничение стояло здесь.
 */
export const reviewReportInput = z
  .object({
    id: z.string().min(1),
    status: z.enum(["accepted", "returned", "review"]),
    acceptedQty: z.number().nonnegative().nullable(),
  })
  .refine((input) => (input.status === "accepted") === (input.acceptedQty !== null), {
    message: "Принятый объём указывается только при приёмке",
    path: ["acceptedQty"],
  });

/**
 * Отчёт, заведённый руками (ADR-022): поля те же, что прораб диктует голосом. Фото —
 * по желанию: без бота их приносят на флешке.
 */
export const createReportInput = z.object({
  projectId: z.string().min(1),
  zoneId: z.string().min(1),
  workType: z.string().min(2).max(120),
  declaredQty: z.number().positive(),
  unit: z.string().min(1).max(12),
  /** Дата смены: задним числом можно, вперёд — нет, это не план */
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  headcount: z.number().int().min(0).max(200),
  summary: z.string().min(3).max(600),
  issue: z.string().max(300).optional(),
});

export type CreateReportInput = z.infer<typeof createReportInput>;

/**
 * Запись факта с площадки (ADR-036): голос, текст и метки фото. Файла записи продукт
 * не хранит — сохраняется источник с текстом и материалы с метками времени.
 *
 * `captureKey` создаёт клиент. Повтор отправки с тем же ключом возвращает тот же источник
 * и `repeated: true`: обрыв сети на отправке не должен оставлять дубль (ADR-036, п. 4).
 */
export const capturePhoto = z.object({
  caption: z.string().trim().max(200),
  takenAt: z.string().datetime({ local: true, offset: true }),
});

export const captureInput = z.object({
  projectId: z.string().min(1),
  captureKey: z.string().min(8).max(64),
  /** Расшифровка записи или то, что человек написал руками */
  text: z.string().trim().min(1).max(4000),
  kind: z.enum(["voice", "text"]),
  /** Длительность записи в миллисекундах; null — факт пришёл текстом */
  durationMs: z.number().int().nonnegative().nullable().default(null),
  /** Метки фото: до десяти снимков за запись */
  photos: z.array(capturePhoto).max(10).default([]),
});

export type CaptureInput = z.input<typeof captureInput>;

export const captureResult = z.object({
  source: sources,
  evidence: z.array(evidence),
  /** Отправка с этим ключом уже проходила: дубль не создан */
  repeated: z.boolean(),
});

export interface CaptureResult {
  source: Source;
  evidence: Evidence[];
  repeated: boolean;
}

/** Сводка смены и её файлы (ADR-037, сценарий 1 и 2) */
export const shiftInput = z.object({
  projectId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  /** Нет принятых записей за эту дату — показать последнюю смену, где они есть (ADR-037) */
  fallbackToLast: z.boolean().optional(),
});

export type ShiftInput = z.infer<typeof shiftInput>;

export const reportCard = z.object({
  report: fieldReport,
  /** Первоисточник отчёта: расшифровка голосового сообщения или текст */
  source: sources.nullable(),
  evidence: z.array(evidence),
  extractions: z.array(extractions),
});

export const sourceCard = z.object({
  source: sources,
  extractions: z.array(extractions),
  /** Решения, принятые на основании источника */
  decisions: z.array(projectDecision),
});

export type ReviewReportInput = z.infer<typeof reviewReportInput>;

export interface ReportCard {
  report: FieldReport;
  source: Source | null;
  evidence: Evidence[];
  extractions: Extraction[];
}

export interface SourceCard {
  source: Source;
  extractions: Extraction[];
  decisions: ProjectDecision[];
}

/** Отчёты с площадки и первоисточники. */
export interface ReportsPort {
  /** Отчёты объекта с материалами и распознанными полями, новые сверху */
  list(projectId: string): Promise<ReportCard[]>;
  /** Завести отчёт руками, пока нет бота: источник — «внесён вручную» (ADR-022) */
  create(input: CreateReportInput, actor: Actor): Promise<FieldReport>;
  /** Приёмка или возврат на уточнение */
  review(input: ReviewReportInput, actor: Actor): Promise<void>;
  /** Записать факт с площадки: источник, текст и метки фото (ADR-036) */
  capture(input: CaptureInput, actor: Actor): Promise<CaptureResult>;
  /** Сводка смены объекта: только принятые отчёты (ADR-037, инвариант 1) */
  shift(input: ShiftInput): Promise<ShiftSummary>;
  /** Сводка смены файлом Excel */
  exportShift(input: ShiftInput): Promise<Blob>;
  /** Черновик ведомости объёмов для ПТО: не исполнительная документация */
  exportStatement(input: ShiftInput): Promise<Blob>;
  source(sourceId: string): Promise<SourceCard | null>;
}
