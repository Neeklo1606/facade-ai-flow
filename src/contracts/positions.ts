import { z } from "zod";
import { col, idSchema, pgEnum, table, timestampSchema } from "./db";

/* ---------- Справочник материалов ---------- */

export const materials = table(
  {
    name: "materials",
    comment: "Справочник нормализованных наименований материалов",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      {
        columns: ["name", "unit"],
        unique: true,
        purpose: "один материал — одна строка справочника",
      },
      { columns: ["family"], purpose: "подбор замен и нормализация по семейству" },
    ],
  },
  {
    id: col.id(),
    family: col.name({ comment: "семейство: bracket, rail, tile…" }),
    name: col.name(),
    unit: col.name(),
  },
);

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
      comment: "null — требует нормализации",
    }),
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
  /** Запросы, в строки которых вошла позиция */
  requestIds: z.array(idSchema),
  mergedInto: idSchema.nullable(),
});

export const positionChange = positionChanges;

export type Material = z.infer<typeof materials>;
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

export function isReadyForRequest(
  item: Pick<ExtractedPosition, "review" | "handedOverAt" | "purchase">,
) {
  return isVerifiedPosition(item) && item.handedOverAt !== null && item.purchase === "none";
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
