import {
  confidenceBand,
  isActivePosition,
  isReadyForRequest,
  isVerifiedPosition,
  purchaseStatus,
  type ExtractedPosition,
  type PurchaseStatus,
} from "@/contracts";

/**
 * Фильтры и счётчики позиций спецификации (P3-3). Считаются в адаптере: экран получает страницу
 * и готовые числа, а не весь список. Адаптер БД повторит те же условия в SQL.
 */

/** Вид проверки: какие позиции показывать */
export const positionViews = [
  "active",
  "verified",
  "pending",
  "attention",
  "check",
  "excluded",
  "all",
] as const;
export type PositionView = (typeof positionViews)[number];

export function matchesView(item: ExtractedPosition, view: PositionView) {
  const band = confidenceBand(item.confidence);
  switch (view) {
    case "active":
      return isActivePosition(item);
    case "verified":
      return isVerifiedPosition(item);
    case "pending":
      return item.review === "pending";
    case "attention":
      return item.review === "pending" && band === "clarify";
    case "check":
      return item.review === "pending" && band === "check";
    case "excluded":
      return !isActivePosition(item);
    case "all":
      return true;
  }
}

/**
 * Можно ли передать ревизию в закупку. Пока в ней есть позиции «Не удалось определить»,
 * передача закрыта — то же правило, что у кнопки экрана проверки, но его держит адаптер:
 * экран может ошибиться или быть обойдён прямым вызовом.
 */
export function handOverError(revisionPositions: ExtractedPosition[]): string | null {
  const blocking = revisionPositions.filter((item) => matchesView(item, "check")).length;
  return blocking
    ? `Сначала разберите позиции «Не удалось определить»: ${blocking}. Исправьте или исключите их.`
    : null;
}

/** Позиция в закупке: проверена и передана — только у таких есть этап закупки */
export function inProcurement(item: ExtractedPosition) {
  return isVerifiedPosition(item) && item.handedOverAt !== null;
}

export interface PositionFilter {
  projectId?: string | undefined;
  revisionId?: string | undefined;
  sheetId?: string | undefined;
  group?: string | undefined;
  view?: PositionView | undefined;
  stage?: PurchaseStatus | undefined;
  chars?: "with" | "without" | undefined;
  readyForRequest?: boolean | undefined;
}

/** Область: объект или ревизия документа */
export function inScope(item: ExtractedPosition, filter: PositionFilter) {
  return (
    (!filter.projectId || item.projectId === filter.projectId) &&
    (!filter.revisionId || item.documentId === filter.revisionId)
  );
}

export function matchesFilter(item: ExtractedPosition, filter: PositionFilter) {
  return (
    inScope(item, filter) &&
    (!filter.sheetId || item.sheetId === filter.sheetId) &&
    (!filter.group || item.group === filter.group) &&
    matchesView(item, filter.view ?? "active") &&
    (!filter.stage || (inProcurement(item) && item.purchase === filter.stage)) &&
    (!filter.chars ||
      (filter.chars === "with"
        ? item.characteristics.length > 0
        : item.characteristics.length === 0)) &&
    (!filter.readyForRequest || isReadyForRequest(item))
  );
}

const levelWeight = (confidence: number) => {
  const band = confidenceBand(confidence);
  return band === "verified" ? 2 : band === "clarify" ? 1 : 0;
};

/** Сначала требующие разбора: непроверенные с низкой уверенностью */
export function byAttention(a: ExtractedPosition, b: ExtractedPosition) {
  return (
    Number(isVerifiedPosition(a)) - Number(isVerifiedPosition(b)) ||
    levelWeight(a.confidence) - levelWeight(b.confidence)
  );
}

/** Можно подтвердить без правки: не проверена человеком, уверенность распознавания высокая */
export function isAutoVerified(item: ExtractedPosition) {
  return item.review === "pending" && confidenceBand(item.confidence) === "verified";
}

/**
 * Счётчики для экранов. Виды проверки, этапы закупки, листы и сводка передачи — по всей области;
 * разделы — с учётом фильтров вида, этапа и характеристик, чтобы число у раздела совпадало со списком.
 */
export function positionFacets(items: ExtractedPosition[], filter: PositionFilter) {
  const scope = items.filter((item) => inScope(item, filter));

  const views = Object.fromEntries(positionViews.map((view) => [view, 0])) as Record<
    PositionView,
    number
  >;
  const stages = Object.fromEntries(purchaseStatus.values.map((stage) => [stage, 0])) as Record<
    PurchaseStatus,
    number
  >;
  const sheets = new Map<string, { sheetId: string; total: number; attention: number }>();
  const groups = new Map<string, { group: string; total: number; verified: number }>();
  let autoVerified = 0;
  let readyForRequest = 0;
  const handOver = { count: 0, needNormalization: 0, withoutCharacteristics: 0 };

  for (const item of scope) {
    for (const view of positionViews) if (matchesView(item, view)) views[view] += 1;
    if (inProcurement(item)) stages[item.purchase] += 1;
    if (isAutoVerified(item)) autoVerified += 1;
    if (isReadyForRequest(item)) readyForRequest += 1;
    if (isVerifiedPosition(item) && item.handedOverAt === null) {
      handOver.count += 1;
      if (!item.normalizedName) handOver.needNormalization += 1;
      if (item.characteristics.length === 0) handOver.withoutCharacteristics += 1;
    }

    const sheet = sheets.get(item.sheetId) ?? { sheetId: item.sheetId, total: 0, attention: 0 };
    if (isActivePosition(item)) sheet.total += 1;
    if (item.review === "pending" && confidenceBand(item.confidence) !== "verified") {
      sheet.attention += 1;
    }
    sheets.set(item.sheetId, sheet);

    if (matchesFilter(item, { ...filter, group: undefined, sheetId: undefined })) {
      const group = groups.get(item.group) ?? { group: item.group, total: 0, verified: 0 };
      group.total += 1;
      if (isVerifiedPosition(item)) group.verified += 1;
      groups.set(item.group, group);
    }
  }

  return {
    views,
    stages,
    sheets: [...sheets.values()],
    groups: [...groups.values()],
    autoVerified,
    readyForRequest,
    handOver,
  };
}

export type PositionFacets = ReturnType<typeof positionFacets>;
