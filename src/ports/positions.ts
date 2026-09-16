import { z } from "zod";
import {
  characteristic,
  extractedPosition,
  materials,
  positionChanges,
  positionReview,
  purchaseStatus,
  replacementSuggestions,
  type ExtractedPosition,
  type Material,
  type PositionChange,
  type ReplacementSuggestion,
} from "@/contracts";
import { pageInput, type Actor, type Page } from "./common";

export const listPositionsInput = pageInput.extend({
  projectId: z.string().min(1).optional(),
  revisionId: z.string().min(1).optional(),
  review: z.array(positionReview.schema).optional(),
  purchase: z.array(purchaseStatus.schema).optional(),
  /** Порядок: по номеру позиции в документе или сначала требующие разбора */
  order: z.enum(["position", "attention"]).default("position"),
});

const id = z.string().min(1);

export const idsInput = z.object({ ids: z.array(id).min(1) });
export const idInput = z.object({ id });

export const correctPositionInput = z.object({
  id,
  projectName: z.string().trim().min(1),
  qty: z.number().nonnegative(),
  unit: z.string().trim().min(1),
  characteristics: z.array(characteristic),
});

/**
 * «Отменить» — обратная мутация решения проверки. Клиент называет только позицию, отменяемое решение
 * и решение до него; кто проверил, когда и количество цели объединения определяет сервер.
 */
export const undoReviewInput = z.object({
  items: z
    .array(
      z.object({
        id,
        /** Отменяемое решение; если позицию успели изменить иначе, она не трогается */
        from: positionReview.schema,
        /** Решение до действия; вернуть позицию в «объединено» отменой нельзя */
        to: positionReview.schema.exclude(["merged"]),
      }),
    )
    .min(1)
    .max(5000),
});

export const mergePositionsInput = z.object({ sourceId: id, targetId: id });

export const splitPositionInput = z.object({
  id,
  /** Количество первой части; вторая получает остаток */
  firstQty: z.number().positive(),
});

export const handOverInput = z.object({ revisionId: id });

export const positionPage = z.object({
  items: z.array(extractedPosition),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
});
export const positionHistory = z.array(positionChanges);
export const materialList = z.array(materials);
export const replacementList = z.array(replacementSuggestions);

export type ListPositionsInput = z.input<typeof listPositionsInput>;
export type CorrectPositionInput = z.infer<typeof correctPositionInput>;
export type UndoReviewInput = z.infer<typeof undoReviewInput>;
export type MergePositionsInput = z.infer<typeof mergePositionsInput>;
export type SplitPositionInput = z.infer<typeof splitPositionInput>;

/**
 * Позиции спецификации: проверка, передача в закупку, справочник материалов.
 * Каждая мутация пишет `position_changes` в той же транзакции.
 */
export interface PositionsPort {
  list(input: ListPositionsInput): Promise<Page<ExtractedPosition>>;
  history(positionId: string): Promise<PositionChange[]>;

  /** Подтверждает непроверенные позиции; возвращает id изменённых */
  confirm(input: z.infer<typeof idsInput>, actor: Actor): Promise<string[]>;
  correct(input: CorrectPositionInput, actor: Actor): Promise<void>;
  exclude(input: z.infer<typeof idInput>, actor: Actor): Promise<void>;
  markHeader(input: z.infer<typeof idInput>, actor: Actor): Promise<void>;
  /** Возвращает исключённую, объединённую или заголовок на проверку */
  reopen(input: z.infer<typeof idInput>, actor: Actor): Promise<void>;
  /** Отменяет решения проверки и пишет отмену в журнал; возвращает число отменённых */
  undoReview(input: UndoReviewInput, actor: Actor): Promise<number>;
  /** false — единицы разные, количество цели не изменилось */
  merge(input: MergePositionsInput, actor: Actor): Promise<boolean>;
  split(input: SplitPositionInput, actor: Actor): Promise<void>;
  /** Передаёт проверенные позиции ревизии в закупку; возвращает число переданных */
  handOver(input: z.infer<typeof handOverInput>, actor: Actor): Promise<number>;

  materials(): Promise<Material[]>;
  replacements(): Promise<ReplacementSuggestion[]>;
}
