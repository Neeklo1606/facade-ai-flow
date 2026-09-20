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
import { positionViews, type PositionView } from "@/domain/positions";
import { type Actor, type Page } from "./common";

/**
 * Фильтр позиций (P3-3): область — объект или ревизия, остальное сужает список.
 * Совпадает с `PositionFilter` из domain/positions.
 */
export const positionFilter = z
  .object({
    projectId: z.string().min(1).optional(),
    revisionId: z.string().min(1).optional(),
    sheetId: z.string().min(1).optional(),
    group: z.string().min(1).optional(),
    /** Вид проверки; по умолчанию — действующие позиции (без исключённых, объединённых, заголовков) */
    view: z.enum(positionViews).default("active"),
    /** Этап закупки у проверенных и переданных в закупку */
    stage: purchaseStatus.schema.optional(),
    chars: z.enum(["with", "without"]).optional(),
    readyForRequest: z.boolean().optional(),
  })
  .refine((input) => input.projectId || input.revisionId, {
    message: "Нужна область: объект или ревизия документа",
  });

export const listPositionsInput = z
  .object({
    ...positionFilter.innerType().shape,
    /** Смещение следующей страницы из nextCursor; только цифры */
    cursor: z
      .string()
      .regex(/^\d{1,9}$/)
      .nullable()
      .default(null),
    /** Страница не больше 200 строк: весь список позиций клиенту не отдаётся */
    limit: z.number().int().min(1).max(200).default(100),
    /** Порядок: по номеру позиции в документе или сначала требующие разбора */
    order: z.enum(["position", "attention"]).default("position"),
  })
  .refine((input) => input.projectId || input.revisionId, {
    message: "Нужна область: объект или ревизия документа",
  });

const viewCounts = z.object(
  Object.fromEntries(positionViews.map((view) => [view, z.number().int().nonnegative()])) as Record<
    PositionView,
    z.ZodNumber
  >,
);

/** Счётчики для экранов: виды проверки, этапы закупки, листы, разделы, передача в закупку */
export const positionFacets = z.object({
  views: viewCounts,
  stages: z.record(purchaseStatus.schema, z.number().int().nonnegative()),
  sheets: z.array(
    z.object({
      sheetId: z.string(),
      total: z.number().int().nonnegative(),
      attention: z.number().int().nonnegative(),
    }),
  ),
  groups: z.array(
    z.object({
      group: z.string(),
      total: z.number().int().nonnegative(),
      verified: z.number().int().nonnegative(),
    }),
  ),
  autoVerified: z.number().int().nonnegative(),
  readyForRequest: z.number().int().nonnegative(),
  handOver: z.object({
    count: z.number().int().nonnegative(),
    needNormalization: z.number().int().nonnegative(),
    withoutCharacteristics: z.number().int().nonnegative(),
    /** Сопоставление с материалом не подтверждено: в запрос не уйдут (ADR-014) */
    unconfirmedMatch: z.number().int().nonnegative(),
  }),
});

/** Для выделения раздела целиком: id и можно ли запросить цены */
export const positionSelection = z.array(z.object({ id: z.string(), ready: z.boolean() }));

const id = z.string().min(1);

export const idsInput = z.object({ ids: z.array(id).min(1) });
export const idInput = z.object({ id });

export const correctPositionInput = z.object({
  id,
  projectName: z.string().trim().min(1),
  /** Количество как numeric(14,3): не больше трёх знаков после запятой */
  qty: z
    .number()
    .nonnegative()
    .max(99_999_999_999)
    .refine((value) => Math.abs(Math.round(value * 1000) - value * 1000) < 1e-6, {
      message: "Не больше трёх знаков после запятой",
    }),
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

/** Подтвердить сопоставление позиции с материалом: предложенным или выбранным (ADR-014) */
export const confirmMatchInput = z.object({ positionId: id, materialId: id });

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
export type PositionFilterInput = z.input<typeof positionFilter>;
export type PositionFacetsResult = z.infer<typeof positionFacets>;
export type PositionSelection = z.infer<typeof positionSelection>;
export type CorrectPositionInput = z.infer<typeof correctPositionInput>;
export type UndoReviewInput = z.infer<typeof undoReviewInput>;
export type MergePositionsInput = z.infer<typeof mergePositionsInput>;
export type SplitPositionInput = z.infer<typeof splitPositionInput>;
export type ConfirmMatchInput = z.infer<typeof confirmMatchInput>;

/**
 * Позиции спецификации: проверка, передача в закупку, справочник материалов.
 * Каждая мутация пишет `position_changes` в той же транзакции.
 */
export interface PositionsPort {
  list(input: ListPositionsInput): Promise<Page<ExtractedPosition>>;
  facets(input: PositionFilterInput): Promise<PositionFacetsResult>;
  selection(input: PositionFilterInput): Promise<PositionSelection>;
  item(positionId: string): Promise<ExtractedPosition | null>;
  history(positionId: string): Promise<PositionChange[]>;

  /** Подтверждает непроверенные позиции; возвращает id изменённых */
  confirm(input: z.infer<typeof idsInput>, actor: Actor): Promise<string[]>;
  /** Подтверждает непроверенные позиции ревизии с высокой уверенностью; какие — решает сервер */
  confirmAutoVerified(input: z.infer<typeof handOverInput>, actor: Actor): Promise<string[]>;
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
  /**
   * Подтверждает сопоставление с материалом справочника — предложенным системой или выбранным
   * человеком (ADR-014, п. 1). Позицию, уже ушедшую в запрос, не пересопоставить
   */
  confirmMatch(input: ConfirmMatchInput, actor: Actor): Promise<ExtractedPosition>;

  materials(): Promise<Material[]>;
  replacements(): Promise<ReplacementSuggestion[]>;
}
