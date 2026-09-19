import { z } from "zod";
import { col, idSchema, pgEnum, table, timestampSchema } from "./db";

/* ---------- Позиции спецификации ---------- */

export const positionReview = pgEnum(
  "position_review",
  ["pending", "confirmed", "corrected", "excluded", "merged", "header"],
  "Решение человека по извлечённой позиции",
  {
    pending: ["confirmed", "corrected", "excluded", "merged", "header"],
    confirmed: ["pending", "corrected", "excluded", "merged"],
    corrected: ["pending", "corrected", "excluded", "merged"],
    excluded: ["pending"],
    merged: ["pending"],
    header: ["pending"],
  },
);

export const purchaseStatus = pgEnum(
  "purchase_status",
  ["none", "requested", "offers", "supplier_selected", "ordered", "delivered"],
  "Этап закупки позиции; меняется событиями закупки",
  {
    none: ["requested"],
    requested: ["offers", "supplier_selected"],
    offers: ["supplier_selected"],
    supplier_selected: ["ordered"],
    ordered: ["delivered"],
  },
);

export const characteristic = z.object({ label: z.string().min(1), value: z.string() });

/** Прямоугольник строки на листе в долях страницы */
export const pageRegion = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

/* ---------- Справочник номенклатуры (ADR-014) ---------- */

export const materialCategories = table(
  {
    name: "material_categories",
    comment: "Дерево категорий материалов; категория верхнего уровня решает, кому уходит запрос",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      { columns: ["parentId"], purpose: "дочерние категории" },
      { columns: ["name"], unique: true, purpose: "название категории уникально" },
    ],
  },
  {
    id: col.id(),
    parentId: col.ref("material_categories", "restrict", {
      nullable: true,
      comment: "null — категория верхнего уровня",
    }),
    name: col.name(),
    rules: col.textArray({
      comment: "правила соответствия: основы слов в наименовании («кронштейн», «анкер»)",
    }),
    sortOrder: col.smallint({ comment: "порядок в дереве" }),
  },
);

export const materials = table(
  {
    name: "materials",
    comment: "Справочник номенклатуры: нормализованные наименования материалов",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      {
        columns: ["name", "unit"],
        unique: true,
        purpose: "один материал — одна строка справочника",
      },
      { columns: ["family"], purpose: "подбор замен и нормализация по семейству" },
      { columns: ["categoryId"], purpose: "номенклатура по категории, подбор поставщиков" },
    ],
  },
  {
    id: col.id(),
    family: col.name({ comment: "семейство: bracket, rail, tile…" }),
    name: col.name(),
    unit: col.name(),
    categoryId: col.ref("material_categories", "restrict"),
    characteristics: col.jsonb(z.array(characteristic)),
    synonyms: col.textArray({ comment: "другие названия того же материала" }),
    spellings: col.textArray({ comment: "типичные написания в проектной документации" }),
  },
);

export const materialChanges = table(
  {
    name: "material_changes",
    comment: "История изменений номенклатуры: кто, когда, какое поле, было и стало",
    primaryKey: ["id"],
    indexes: [{ columns: ["materialId", "at desc"], purpose: "история материала" }],
  },
  {
    id: col.id(),
    materialId: col.ref("materials", "cascade"),
    at: col.timestamp(),
    actorId: col.ref("employees", "restrict"),
    field: col.name({ comment: "что изменено: «наименование», «синонимы»… или «создан»" }),
    before: col.text({ nullable: true }),
    after: col.text({ nullable: true }),
  },
);

/** Состояние сопоставления позиции с номенклатурой (ADR-014, п. 1) */
export const matchStatus = pgEnum(
  "match_status",
  ["none", "suggested", "confirmed"],
  "Сопоставление позиции с материалом: нет, предложено системой, подтверждено человеком",
  {
    none: ["suggested", "confirmed"],
    suggested: ["none", "confirmed"],
    confirmed: ["confirmed"],
  },
);

export const matchStatusLabel = {
  none: "Не сопоставлено",
  suggested: "Предложено системой",
  confirmed: "Сопоставление подтверждено",
} as const satisfies Record<z.infer<typeof matchStatus.schema>, string>;

export const positions = table(
  {
    name: "positions",
    comment:
      "Позиция спецификации, извлечённая из листа ревизии. Единственная сущность «что купить»",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      {
        columns: ["revisionId", "position"],
        unique: true,
        purpose: "номер позиции уникален в ревизии документа",
      },
      {
        columns: ["revisionId", "sheetId", "position"],
        purpose: "экран проверки: позиции листа по порядку",
      },
      {
        columns: ["projectId", "review"],
        purpose: "сводка: всего и непроверено; фильтр проверки в материалах",
      },
      {
        columns: ["projectId", "purchase"],
        where: "handed_over_at is not null",
        purpose: "материалы: плитки этапов закупки, «готовы к запросу»",
      },
      { columns: ["materialId"], purpose: "потребность в материале, подбор строк запроса" },
      { columns: ["mergedInto"], where: "merged_into is not null", purpose: "история объединений" },
    ],
    checks: [
      "(reviewed_at is null) = (reviewed_by is null)",
      "handed_over_at is null or review in ('confirmed', 'corrected')",
      "purchase = 'none' or handed_over_at is not null",
      "(review = 'merged') = (merged_into is not null)",
      "(match_status = 'none') = (material_id is null)",
      "(match_status = 'confirmed') = (matched_by is not null)",
      "(matched_at is null) = (matched_by is null)",
    ],
  },
  {
    id: col.id(),
    projectId: col.ref("projects", "restrict", {
      comment: "денормализовано из ревизии для сводки",
    }),
    revisionId: col.ref("document_revisions", "restrict"),
    sheetId: col.ref("document_sheets", "restrict"),
    position: col.name({ comment: "номер в таблице документа: «1.12»" }),
    family: col.name({ comment: "семейство по распознаванию, до нормализации" }),
    projectName: col.name({ comment: "наименование как в проекте" }),
    materialId: col.ref("materials", "restrict", {
      nullable: true,
      comment: "материал справочника: предложенный или подтверждённый; null — не сопоставлено",
    }),
    matchStatus: col.enum(matchStatus),
    matchedBy: col.ref("employees", "restrict", {
      nullable: true,
      comment: "кто подтвердил сопоставление",
    }),
    matchedAt: col.timestamp({ nullable: true }),
    characteristics: col.jsonb(z.array(characteristic)),
    qty: col.qty(),
    unit: col.name(),
    confidence: col.ratio(),
    region: col.jsonb(pageRegion),
    review: col.enum(positionReview),
    reviewedBy: col.ref("employees", "restrict", { nullable: true }),
    reviewedAt: col.timestamp({ nullable: true }),
    note: col.text({ nullable: true, comment: "почему распознавание не уверено" }),
    handedOverAt: col.timestamp({ nullable: true, comment: "передана в закупку" }),
    purchase: col.enum(purchaseStatus),
    deliveredQty: col.qty({
      nullable: true,
      comment: "поставлено по актам приёмки; null — поставок не было (ADR-011)",
    }),
    mergedInto: col.ref("positions", "restrict", { nullable: true }),
  },
);

export const actorKind = pgEnum(
  "actor_kind",
  ["user", "system"],
  "Кто совершил действие: человек или обработка",
);

export const positionChanges = table(
  {
    name: "position_changes",
    comment: "Журнал изменений позиции: извлечено, подтверждено, исправлено",
    primaryKey: ["id"],
    appendOnly: true,
    indexes: [
      { columns: ["positionId", "at desc"], purpose: "история позиции в карточке материала" },
    ],
    checks: ["(actor_kind = 'user') = (actor_id is not null)"],
  },
  {
    id: col.id(),
    positionId: col.ref("positions", "restrict"),
    at: col.timestamp(),
    actorKind: col.enum(actorKind),
    actorId: col.ref("employees", "restrict", { nullable: true }),
    action: col.name(),
    before: col.text({ nullable: true }),
    after: col.text({ nullable: true }),
  },
);

export const replacementStatus = pgEnum(
  "replacement_status",
  ["proposed", "agreed", "rejected"],
  "Решение по предложенной замене",
  { proposed: ["agreed", "rejected"] },
);

export const replacementSuggestions = table(
  {
    name: "replacement_suggestions",
    comment: "Аналог материала с причиной и разницей в цене",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      { columns: ["family", "status"], purpose: "замены в карточке материала и «Ждут решения»" },
    ],
    checks: ["(status = 'proposed') = (decided_by is null)"],
  },
  {
    id: col.id(),
    family: col.name(),
    name: col.name(),
    reason: col.text(),
    priceDeltaPct: col.percent({ comment: "разница в цене за единицу, %" }),
    status: col.enum(replacementStatus),
    decidedBy: col.ref("employees", "restrict", { nullable: true }),
  },
);

/* ---------- Представления ---------- */

/** Позиция для экранов проверки и материалов: лист, раздел и справочное имя подставлены. */
export const extractedPosition = z.object({
  id: idSchema,
  projectId: idSchema,
  /** Ревизия документа */
  documentId: idSchema,
  sheetId: idSchema,
  sheetNumber: z.number().int(),
  position: z.string().min(1),
  group: z.string().min(1),
  family: z.string().min(1),
  projectName: z.string().min(1),
  materialId: idSchema.nullable(),
  /** Наименование по справочнику; null — требует нормализации */
  normalizedName: z.string().nullable(),
  /** Сопоставление с материалом: предложено системой или подтверждено человеком (ADR-014) */
  matchStatus: matchStatus.schema,
  matchedBy: idSchema.nullable(),
  matchedAt: timestampSchema.nullable(),
  characteristics: z.array(characteristic),
  qty: z.number().nonnegative(),
  unit: z.string().min(1),
  confidence: z.number().min(0).max(1),
  region: pageRegion,
  review: positionReview.schema,
  reviewedBy: idSchema.nullable(),
  reviewedAt: timestampSchema.nullable(),
  note: z.string().nullable(),
  handedOverAt: timestampSchema.nullable(),
  purchase: purchaseStatus.schema,
  /** Поставлено по актам приёмки; null — поставок не было (ADR-011) */
  deliveredQty: z.number().nonnegative().nullable(),
  /** Запросы, в строки которых вошла позиция */
  requestIds: z.array(idSchema),
  mergedInto: idSchema.nullable(),
});

export const positionChange = positionChanges;

export type Material = z.infer<typeof materials>;
export type MaterialCategory = z.infer<typeof materialCategories>;
export type MaterialChange = z.infer<typeof materialChanges>;
export type MatchStatus = z.infer<typeof matchStatus.schema>;
export type PositionRow = z.infer<typeof positions>;
export type ExtractedPosition = z.infer<typeof extractedPosition>;
export type PositionChange = z.infer<typeof positionChanges>;
export type PositionReview = z.infer<typeof positionReview.schema>;
export type PurchaseStatus = z.infer<typeof purchaseStatus.schema>;
export type Characteristic = z.infer<typeof characteristic>;
export type PageRegion = z.infer<typeof pageRegion>;
export type ReplacementSuggestion = z.infer<typeof replacementSuggestions>;

/* ---------- Словари и определения ---------- */

export const positionReviewLabel: Record<PositionReview, string> = {
  pending: "Не проверено",
  confirmed: "Подтверждено",
  corrected: "Исправлено",
  excluded: "Исключено",
  merged: "Объединено",
  header: "Заголовок раздела",
};

export const purchaseStatusLabel: Record<PurchaseStatus, string> = {
  none: "Не в работе",
  requested: "В запросе",
  offers: "Получены предложения",
  supplier_selected: "Выбран поставщик",
  ordered: "Заказано",
  delivered: "Поставлено",
};

/** Этапы закупки по порядку прохождения */
export const purchaseOrder = purchaseStatus.values;

export const replacementStatusLabel: Record<ReplacementSuggestion["status"], string> = {
  proposed: "Предложена",
  agreed: "Согласована",
  rejected: "Отклонена",
};

/** Определения из глоссария, §2 — одна реализация на всё приложение. */
export function isActivePosition(item: Pick<ExtractedPosition, "review">) {
  return item.review !== "excluded" && item.review !== "merged" && item.review !== "header";
}

export function isVerifiedPosition(item: Pick<ExtractedPosition, "review">) {
  return item.review === "confirmed" || item.review === "corrected";
}

/**
 * Готова к запросу поставщикам: проверена, передана в закупку, ещё не запрошена и сопоставление
 * с материалом подтверждено человеком — неподтверждённое не уходит поставщикам (ADR-014, п. 3)
 */
export function isReadyForRequest(
  item: Pick<ExtractedPosition, "review" | "handedOverAt" | "purchase" | "matchStatus">,
) {
  return (
    isVerifiedPosition(item) &&
    item.handedOverAt !== null &&
    item.purchase === "none" &&
    item.matchStatus === "confirmed"
  );
}

export type ConfidenceBand = "verified" | "clarify" | "check";

export function confidenceBand(value: number): ConfidenceBand {
  if (value >= 0.85) return "verified";
  if (value >= 0.7) return "clarify";
  return "check";
}

export const confidenceBandLabel: Record<ConfidenceBand, string> = {
  verified: "Проверено",
  clarify: "Требует внимания",
  check: "Не удалось определить",
};
