/**
 * Правила поставки и приёмки (ADR-011). Чистые функции: их вызывают демо-адаптер,
 * серверный адаптер и сборка фикстур — одно правило на всех.
 */
import type {
  ChecklistResult,
  Delivery,
  DeliveryStatus,
  ExtractedPosition,
  Material,
} from "@/contracts";

/* ---------- Статусы ---------- */

export const FINAL_STATUSES: readonly DeliveryStatus[] = [
  "accepted",
  "accepted_with_remarks",
  "rejected",
];

/** Движение, которое человек отмечает до приёмки: отгружено, в пути, прибыло */
export const MOVE_STATUSES = ["shipped", "in_transit", "arrived"] as const;
export type MoveStatus = (typeof MOVE_STATUSES)[number];

export function canMove(from: DeliveryStatus, to: DeliveryStatus) {
  return (transitionsOf(from) ?? []).includes(to);
}

function transitionsOf(from: DeliveryStatus): readonly DeliveryStatus[] | undefined {
  const map: Partial<Record<DeliveryStatus, readonly DeliveryStatus[]>> = {
    expected: ["shipped", "in_transit", "arrived", "rejected"],
    shipped: ["in_transit", "arrived", "rejected"],
    in_transit: ["arrived", "rejected"],
    arrived: ["accepted", "accepted_with_remarks", "rejected"],
  };
  return map[from];
}

/** Поставка ждёт приёмки: прибыла, акта ещё нет */
export const awaitsAcceptance = (item: Delivery) => item.status === "arrived";
/** Поставка у поставщика или в дороге */
export const onTheWay = (item: Delivery) =>
  item.status === "expected" || item.status === "shipped" || item.status === "in_transit";

/* ---------- Входной контроль ---------- */

export interface ChecklistItem {
  id: string;
  label: string;
}

const COMMON: ChecklistItem[] = [
  { id: "complete", label: "Комплектность по накладной" },
  { id: "intact", label: "Упаковка и материал без повреждений" },
  { id: "docs", label: "Накладная и паспорт качества или сертификат" },
  { id: "spec", label: "Соответствует спецификации: марка, размер, цвет" },
];

/**
 * Дополнительные пункты по семейству материала. Семейство — код из справочника материалов
 * (`materials.family`: bracket, rail, tile…); распознанное семейство позиции может прийти
 * словами — «облицовка», «утеплитель», — его сравниваем по корню
 */
const BY_FAMILY: { families: readonly string[]; names: RegExp; items: ChecklistItem[] }[] = [
  {
    families: ["tile", "panel", "cassette"],
    names: /облицов|керамогранит|панел|кассет/i,
    items: [
      { id: "batch", label: "Одна партия и тон по маркировке" },
      { id: "chips", label: "Нет сколов на лицевой стороне и кромках" },
    ],
  },
  {
    families: ["wool", "membrane"],
    names: /утепл|минват|вата|мембран/i,
    items: [
      { id: "density", label: "Плотность по паспорту соответствует проекту" },
      { id: "dry", label: "Упаковка сухая, материал не намок" },
    ],
  },
  {
    families: ["bracket", "rail", "anchor", "rivet", "fastener"],
    names: /подконструкц|кронштейн|направляющ|крепёж|анкер|заклёп/i,
    items: [
      { id: "coating", label: "Покрытие без повреждений: цинк, анодирование" },
      { id: "marking", label: "Маркировка на изделиях и упаковке" },
    ],
  },
];

/** Чек-лист для поставки: общие пункты и пункты по семействам её материалов, без повторов */
export function checklistFor(families: (string | null)[]): ChecklistItem[] {
  const extra = BY_FAMILY.filter((group) =>
    families.some(
      (family) => family !== null && (group.families.includes(family) || group.names.test(family)),
    ),
  ).flatMap((group) => group.items);
  const seen = new Set<string>();
  return [...COMMON, ...extra].filter((item) => !seen.has(item.id) && seen.add(item.id));
}

/** Семейства материалов поставки по её строкам */
export function deliveryFamilies(item: Delivery, materials: Material[]) {
  return item.items.map((line) =>
    line.materialId ? (materials.find((m) => m.id === line.materialId)?.family ?? null) : null,
  );
}

/* ---------- Приёмка ---------- */

export type AcceptanceResult = "accepted" | "accepted_with_remarks" | "rejected";

export interface AcceptanceDraft {
  result: AcceptanceResult;
  lines: { lineId: string; acceptedQty: number; remark: string | null }[];
  checklist: ChecklistResult[];
  photos: number;
  reason: string | null;
  confirmed: boolean;
}

export interface LineDiscrepancy {
  lineId: string;
  kind: "shortage" | "surplus";
  declared: number;
  accepted: number;
}

/** Расхождения по строкам: факт не равен заявленному */
export function lineDiscrepancies(item: Delivery, draft: Pick<AcceptanceDraft, "lines">) {
  const out: LineDiscrepancy[] = [];
  for (const line of item.items) {
    const fact = draft.lines.find((entry) => entry.lineId === line.id);
    if (!fact) continue;
    if (fact.acceptedQty < line.qty)
      out.push({
        lineId: line.id,
        kind: "shortage",
        declared: line.qty,
        accepted: fact.acceptedQty,
      });
    if (fact.acceptedQty > line.qty)
      out.push({
        lineId: line.id,
        kind: "surplus",
        declared: line.qty,
        accepted: fact.acceptedQty,
      });
  }
  return out;
}

/** Есть ли расхождение: строки или непройденный пункт контроля */
export function hasDiscrepancy(
  item: Delivery,
  draft: Pick<AcceptanceDraft, "lines" | "checklist">,
) {
  return lineDiscrepancies(item, draft).length > 0 || draft.checklist.some((entry) => !entry.ok);
}

/**
 * Проверка акта перед записью. Возвращает текст первой причины отказа или null.
 * Правила ADR-011: полностью — только без расхождений; расхождение — фото обязательно;
 * отклонение — с причиной; без подтверждения принявшего акт не пишется.
 */
export function acceptanceError(item: Delivery, draft: AcceptanceDraft): string | null {
  if (item.status !== "arrived") return "Принять можно только прибывшую поставку";
  if (!draft.confirmed) return "Подтвердите приёмку от своего имени";
  // Факт — ровно по одному на каждую строку поставки: два факта по одной строке и ни одного
  // по другой — не акт
  const factIds = draft.lines.map((line) => line.lineId);
  const everyLineOnce =
    factIds.length === item.items.length &&
    new Set(factIds).size === factIds.length &&
    item.items.every((line) => factIds.includes(line.id));
  if (!everyLineOnce) return "Укажите факт по каждой строке";
  if (draft.lines.some((line) => !Number.isFinite(line.acceptedQty) || line.acceptedQty < 0))
    return "Фактическое количество не может быть отрицательным";
  const expected = checklistFor([]).length;
  if (draft.checklist.length < expected) return "Пройдите чек-лист входного контроля";
  const discrepancy = hasDiscrepancy(item, draft);
  if (draft.result === "rejected" && !draft.reason?.trim()) return "Укажите причину отклонения";
  if (draft.result === "accepted" && discrepancy)
    return "Есть расхождение: принять можно только с замечаниями или отклонить";
  if (draft.result === "accepted_with_remarks" && !discrepancy)
    return "Расхождений нет: примите поставку полностью";
  if ((discrepancy || draft.result === "rejected") && draft.photos < 1)
    return "При расхождении нужно хотя бы одно фото";
  return null;
}

/* ---------- Связь с материалами ---------- */

export interface PositionDelivery {
  positionId: string;
  delivered: number;
}

/**
 * Принятое количество строки — по позициям, из которых строка собрана: по порядку,
 * каждой не больше её количества. Излишек остаётся на последней позиции.
 */
export function allocateToPositions(
  accepted: number,
  positions: Pick<ExtractedPosition, "id" | "qty">[],
): PositionDelivery[] {
  let left = accepted;
  return positions.map((position, index) => {
    const last = index === positions.length - 1;
    const take = last ? Math.max(0, left) : Math.min(position.qty, Math.max(0, left));
    left -= take;
    return { positionId: position.id, delivered: take };
  });
}

/** Остаток к поставке: заказано минус поставлено, не меньше нуля */
export function remainder(position: Pick<ExtractedPosition, "qty" | "deliveredQty">) {
  return Math.max(0, position.qty - (position.deliveredQty ?? 0));
}

/** Позиция поставлена полностью */
export function fullyDelivered(position: Pick<ExtractedPosition, "qty" | "deliveredQty">) {
  return (position.deliveredQty ?? 0) >= position.qty;
}

/** Строка запроса и позиция, из которой она собрана */
export interface RequestPositionLink {
  requestLineId: string;
  positionId: string;
}

/**
 * Поставлено по каждой позиции по принятым актам: принятое количество каждой строки
 * раскладывается по позициям строки (`allocateToPositions`). Одно правило для сборки
 * фикстур и для живой приёмки — поэтому цифры не расходятся.
 */
export function deliveredByPosition(
  deliveries: Delivery[],
  links: RequestPositionLink[],
  positions: Pick<ExtractedPosition, "id" | "qty">[],
) {
  const byId = new Map(positions.map((item) => [item.id, item]));
  const result = new Map<string, number>();
  for (const item of deliveries) {
    if (item.status !== "accepted" && item.status !== "accepted_with_remarks") continue;
    for (const line of item.items) {
      if (line.acceptedQty === null) continue;
      const lineIds = links
        .filter((link) => link.requestLineId === line.requestLineId)
        .map((link) => byId.get(link.positionId))
        .filter((position): position is Pick<ExtractedPosition, "id" | "qty"> => !!position);
      for (const share of allocateToPositions(line.acceptedQty, lineIds)) {
        result.set(share.positionId, (result.get(share.positionId) ?? 0) + share.delivered);
      }
    }
  }
  return result;
}

/** Позиции с учётом принятых поставок: факт и статус «поставлено», если поставлено всё */
export function withDeliveries<P extends ExtractedPosition>(
  positions: P[],
  deliveries: Delivery[],
  links: RequestPositionLink[],
): P[] {
  const delivered = deliveredByPosition(deliveries, links, positions);
  return positions.map((item) => {
    const qty = delivered.get(item.id);
    if (qty === undefined) return item;
    const next = { ...item, deliveredQty: qty };
    return fullyDelivered(next) && (item.purchase === "ordered" || item.purchase === "delivered")
      ? { ...next, purchase: "delivered" as const }
      : next;
  });
}
