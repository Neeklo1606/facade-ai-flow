import { z } from "zod";
import { materialRequests, materialRequestStatus, type MaterialRequest } from "@/contracts";
import type { Actor } from "./common";

/**
 * Заявка на материал (ADR-037, сценарий 3). Площадка говорит, чего не хватает, снабжение
 * видит очередь и меняет статус руками: ничего не заказывается автоматически.
 */
export const createMaterialRequestInput = z.object({
  projectId: z.string().min(1),
  /** Источник, из которого выросла заявка: голосовое или текст с площадки */
  sourceId: z.string().min(1).nullable().default(null),
  name: z.string().trim().min(2).max(160),
  qty: z.number().positive(),
  unit: z.string().trim().min(1).max(12),
  /** Дата нужна на объекте, не раньше сегодняшней */
  neededBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  note: z.string().trim().max(400).default(""),
});

export type CreateMaterialRequestInput = z.input<typeof createMaterialRequestInput>;

export const decideMaterialRequestInput = z
  .object({
    id: z.string().min(1),
    status: materialRequestStatus.schema,
    /** Что решило снабжение: отказ без причины не фиксируется */
    decision: z.string().trim().max(400).default(""),
  })
  .refine((input) => input.status !== "declined" || input.decision.length >= 3, {
    message: "Отказ фиксируется с причиной",
    path: ["decision"],
  });

export type DecideMaterialRequestInput = z.infer<typeof decideMaterialRequestInput>;

export const materialRequestList = z.array(materialRequests);

export interface SupplyPort {
  /** Заявки объекта, свежие сверху; `null` — по всем объектам */
  requests(projectId: string | null): Promise<MaterialRequest[]>;
  createRequest(input: CreateMaterialRequestInput, actor: Actor): Promise<MaterialRequest>;
  /** Решение снабжения: статус меняется только по разрешённым переходам */
  decideRequest(input: DecideMaterialRequestInput, actor: Actor): Promise<MaterialRequest>;
  /** Снять свою новую заявку: отмена сразу после «Верно» (ADR-040, п. 4) */
  retractRequest(input: { id: string }, actor: Actor): Promise<void>;
}

export type { MaterialRequest };
