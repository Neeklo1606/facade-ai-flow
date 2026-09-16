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
  sheetId: z.string().min(1).optional(),
  review: z.array(positionReview.schema).optional(),
  purchase: z.array(purchaseStatus.schema).optional(),
  group: z.string().optional(),
  /** Только переданные в закупку */
  handedOver: z.boolean().optional(),
  withCharacteristics: z.boolean().optional(),
  /** Порядок: по номеру позиции в документе или сначала требующие разбора */
  order: z.enum(["position", "attention"]).default("position"),
});

const ids = z.array(z.string().min(1)).min(1);

export const correctPositionInput = z.object({
  id: z.string().min(1),
  projectName: z.string().trim().min(1),
  qty: z.number().nonnegative(),
  unit: z.string().trim().min(1),
  characteristics: z.array(characteristic),
  materialId: z.string().min(1).nullable(),
});

export const mergePositionsInput = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

export const splitPositionInput = z.object({
  id: z.string().min(1),
  /** Количество первой части; вторая получает остаток */
  firstQty: z.number().positive(),
});

export const positionHistory = z.array(positionChanges);
export const materialList = z.array(materials);
export const replacementList = z.array(replacementSuggestions);
export const positionPage = extractedPosition;

export type ListPositionsInput = z.input<typeof listPositionsInput>;
export type CorrectPositionInput = z.infer<typeof correctPositionInput>;
export type MergePositionsInput = z.infer<typeof mergePositionsInput>;
export type SplitPositionInput = z.infer<typeof splitPositionInput>;

/**
 * Позиции спецификации: проверка, передача в закупку, справочник материалов.
 * Каждая мутация пишет `position_changes` в той же транзакции.
 */
export interface PositionsPort {
  list(input: ListPositionsInput): Promise<Page<ExtractedPosition>>;
  history(positionId: string): Promise<PositionChange[]>;

  /** Подтверждает непроверенные позиции; возвращает изменённые */
  confirm(input: { ids: z.infer<typeof ids> }, actor: Actor): Promise<ExtractedPosition[]>;
  correct(input: CorrectPositionInput, actor: Actor): Promise<ExtractedPosition>;
  exclude(id: string, actor: Actor): Promise<ExtractedPosition>;
  markHeader(id: string, actor: Actor): Promise<ExtractedPosition>;
  /** Возвращает на проверку; для переданной в закупку позиции — ConflictError */
  reopen(id: string, actor: Actor): Promise<ExtractedPosition>;
  merge(input: MergePositionsInput, actor: Actor): Promise<ExtractedPosition>;
  split(input: SplitPositionInput, actor: Actor): Promise<[ExtractedPosition, ExtractedPosition]>;
  /** Передаёт проверенные позиции ревизии в закупку; возвращает число переданных */
  handOver(revisionId: string, actor: Actor): Promise<number>;

  materials(family?: string): Promise<Material[]>;
  replacements(family: string): Promise<ReplacementSuggestion[]>;
}
