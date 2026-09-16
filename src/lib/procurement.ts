import { rfqStatusLabel, type RfqStatus } from "@/contracts";
export { compareOffers, type CellCalc, type ColumnCalc } from "@/domain/procurement";

export type { RfqStatus } from "@/contracts";

type Tone = "ok" | "warn" | "danger" | "info" | "accent" | "neutral";

const rfqStatusTone: Record<RfqStatus, Tone> = {
  decided: "ok",
  ordered: "ok",
  overdue: "danger",
  collecting: "warn",
  ready: "accent",
  sent: "info",
};

/** Подпись из словаря контрактов, цвет — решение интерфейса */
export const rfqStatusMeta = Object.fromEntries(
  (Object.keys(rfqStatusTone) as RfqStatus[]).map((status) => [
    status,
    { label: rfqStatusLabel[status], tone: rfqStatusTone[status] },
  ]),
) as Record<RfqStatus, { label: string; tone: Tone }>;

/** Короткое перечисление материалов запроса: «A, B и ещё 10» — для заголовков, где полный список не помещается. */
export function itemsSummary(
  items: { name: string; qty: number; unit: string }[],
  format: (item: { name: string; qty: number; unit: string }) => string = (item) => item.name,
  limit = 2,
) {
  const shown = items.slice(0, limit).map(format).join(", ");
  const rest = items.length - limit;
  return rest > 0 ? `${shown} и ещё ${rest}` : shown;
}
