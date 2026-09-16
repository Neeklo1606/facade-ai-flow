import type {
  OfferLine,
  ProjectDecision,
  RfqStatus,
  SupplierOffer,
  SupplyRequest,
} from "@/contracts";

/** Сколько получателей запроса ответили */
export function answeredCount(
  offers: Pick<SupplierOffer, "requestId" | "supplierId">[],
  request: SupplyRequest,
) {
  const answered = new Set(
    offers.filter((offer) => offer.requestId === request.id).map((offer) => offer.supplierId),
  );
  return request.sentTo.filter((supplierId) => answered.has(supplierId)).length;
}

/** Решение по запросу, если оно зафиксировано */
export function decisionFor(decisions: ProjectDecision[], requestId: string) {
  return decisions.find((item) => item.requestId === requestId) ?? null;
}

/** Активный запрос: отправлен и ещё не заказан и не отменён (глоссарий, §2) */
export function isActiveRequest(request: Pick<SupplyRequest, "status">) {
  return request.status === "sent" || request.status === "decided";
}

/**
 * Статус запроса на экране (глоссарий, §4). Просрочен — срок ответа прошёл, а ответили не все;
 * то же определение считает «Просрочено» в реестре и карточке.
 */
export function rfqStatus(
  request: SupplyRequest,
  answered: number,
  decided: boolean,
  now: string,
): RfqStatus {
  if (request.status === "ordered") return "ordered";
  if (decided || request.status === "decided") return "decided";
  if (request.status === "draft" || request.status === "cancelled") return "sent";
  if (answered >= request.sentTo.length && answered > 0) return "ready";
  if (request.replyDueAt && request.replyDueAt < now) return "overdue";
  return answered ? "collecting" : "sent";
}

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
 * Одна реализация для адаптеров и интерфейса (P3-1 переносит вызов на сервер).
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
