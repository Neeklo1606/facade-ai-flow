import {
  rfqStatusLabel,
  type OfferLine,
  type RfqStatus,
  type SupplierOffer,
  type SupplyRequest,
} from "@/contracts";
import { answeredCount, rfqStatus as displayStatus } from "@/domain/procurement";
import { decisionForRequest, demoNow, type SpecState } from "@/lib/spec-store";

/** Расчёт ячейки сравнения. Все суммы в копейках. */
export interface CellCalc {
  price: number;
  qty: number;
  amount: number;
  delivery: number;
  vat: number;
  total: number;
  leadTimeDays: number;
  availableQty: number;
  shortage: boolean;
  deviation: string | null;
  sourceId: string | null;
  location: string;
  name: string;
}

export interface ColumnCalc {
  supplierId: string;
  offerId: string | null;
  receivedAt: string | null;
  /** Ключ — id строки запроса */
  cells: Map<string, CellCalc>;
  deliveryCost: number;
  vatPct: number;
  subtotal: number;
  vat: number;
  total: number;
  complete: boolean;
  deviations: number;
  maxLeadTime: number;
}

/**
 * Сравнение предложений по запросу. Доставка распределяется по строкам пропорционально сумме,
 * НДС считается на товар и доставку, итог колонки — всё вместе. Суммы в копейках.
 * Переезжает в domain/procurement в P3-1.
 */
export function compareOffers(
  s: { offers: SupplierOffer[]; offerLines: OfferLine[] },
  request: SupplyRequest,
) {
  const columns: ColumnCalc[] = request.sentTo.map((supplierId) => {
    const offer =
      s.offers.find((o) => o.requestId === request.id && o.supplierId === supplierId) ?? null;
    const empty: ColumnCalc = {
      supplierId,
      offerId: null,
      receivedAt: null,
      cells: new Map(),
      deliveryCost: 0,
      vatPct: 20,
      subtotal: 0,
      vat: 0,
      total: 0,
      complete: false,
      deviations: 0,
      maxLeadTime: 0,
    };
    if (!offer) return empty;

    const lines = s.offerLines.filter((line) => line.offerId === offer.id);
    const { deliveryCost, vatPct } = offer;
    const amounts = request.items.flatMap((item) => {
      const line = lines.find((l) => l.requestLineId === item.id);
      return line ? [{ item, line, amount: Math.round(line.price * item.qty) }] : [];
    });
    const goods = amounts.reduce((acc, a) => acc + a.amount, 0);
    const cells = new Map<string, CellCalc>();
    for (const { item, line, amount } of amounts) {
      const delivery = goods ? Math.round((deliveryCost * amount) / goods) : 0;
      const vat = Math.round(((amount + delivery) * vatPct) / 100);
      cells.set(item.id, {
        price: line.price,
        qty: item.qty,
        amount,
        delivery,
        vat,
        total: amount + delivery + vat,
        leadTimeDays: line.leadTimeDays,
        availableQty: line.availableQty,
        shortage: line.availableQty < item.qty,
        deviation: line.deviation,
        sourceId: line.sourceId ?? offer.sourceId,
        location: line.location,
        name: line.name,
      });
    }
    const subtotal = goods + deliveryCost;
    const vat = Math.round((subtotal * vatPct) / 100);
    return {
      supplierId,
      offerId: offer.id,
      receivedAt: offer.receivedAt,
      cells,
      deliveryCost,
      vatPct,
      subtotal,
      vat,
      total: subtotal + vat,
      complete: cells.size === request.items.length,
      deviations: [...cells.values()].filter((c) => c.deviation || c.shortage).length,
      maxLeadTime: Math.max(0, ...[...cells.values()].map((c) => c.leadTimeDays)),
    };
  });

  const answered = columns.filter((c) => c.offerId);
  const candidates = answered.filter((c) => c.complete);
  const best = (candidates.length ? candidates : answered).reduce<ColumnCalc | null>(
    (acc, c) => (!acc || c.total < acc.total ? c : acc),
    null,
  );
  return { columns, answered: answered.length, best };
}

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

/** Статус запроса на экране — та же функция, что считает «Просрочено» в реестре */
export function rfqStatus(s: SpecState, request: SupplyRequest) {
  return displayStatus(
    request,
    answeredCount(s.offers, request),
    Boolean(decisionForRequest(s, request.id)),
    demoNow(),
  );
}

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
