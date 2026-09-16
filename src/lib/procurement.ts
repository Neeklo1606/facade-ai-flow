import {
  offerLines,
  offerTerms,
  supplierOffers,
  type RfqMeta,
  type SupplyRequest,
} from "@/mock/repository";
import { MOCK_NOW } from "@/lib/format";
import { decisionForRequest, type SpecState } from "@/lib/spec-store";

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
 * НДС считается на товар и доставку, итог колонки — всё вместе.
 */
export function compareOffers(request: SupplyRequest) {
  const columns: ColumnCalc[] = request.sentTo.map((supplierId) => {
    const offer =
      supplierOffers.find((o) => o.requestId === request.id && o.supplierId === supplierId) ?? null;
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

    const terms = offerTerms.find((t) => t.offerId === offer.id);
    const lines = offerLines.filter((line) => line.offerId === offer.id);
    const deliveryCost = terms?.deliveryCost ?? 0;
    const vatPct = terms?.vatPct ?? 20;
    const amounts = request.items.map((item) => {
      const line = lines.find((l) => l.materialId === item.materialId);
      const price =
        line?.price ?? offer.prices.find((p) => p.materialId === item.materialId)?.price ?? 0;
      return { item, line, price, amount: price * item.qty };
    });
    const goods = amounts.reduce((acc, a) => acc + a.amount, 0);
    const cells = new Map<string, CellCalc>();
    for (const { item, line, price, amount } of amounts) {
      if (!price) continue;
      const delivery = goods ? Math.round((deliveryCost * amount) / goods) : 0;
      const vat = Math.round(((amount + delivery) * vatPct) / 100);
      const availableQty = line?.availableQty ?? item.qty;
      cells.set(item.materialId, {
        price,
        qty: item.qty,
        amount,
        delivery,
        vat,
        total: amount + delivery + vat,
        leadTimeDays: line?.leadTimeDays ?? offer.leadTimeDays,
        availableQty,
        shortage: availableQty < item.qty,
        deviation: line?.deviation ?? null,
        sourceId: line?.sourceId ?? offer.sourceId,
        location: line?.location ?? "",
        name: line?.name ?? item.name,
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

export type RfqStatus = "decided" | "ordered" | "overdue" | "collecting" | "ready" | "sent";

export const rfqStatusMeta: Record<
  RfqStatus,
  { label: string; tone: "ok" | "warn" | "danger" | "info" | "accent" | "neutral" }
> = {
  decided: { label: "Решение принято", tone: "ok" },
  ordered: { label: "Заказано", tone: "ok" },
  overdue: { label: "Ответы просрочены", tone: "danger" },
  collecting: { label: "Собираем ответы", tone: "warn" },
  ready: { label: "Готово к сравнению", tone: "accent" },
  sent: { label: "Отправлен", tone: "info" },
};

export function rfqStatus(
  s: SpecState,
  request: SupplyRequest,
  meta: RfqMeta | undefined,
  answered: number,
): RfqStatus {
  if (request.status === "ordered") return "ordered";
  if (decisionForRequest(s, request.id)) return "decided";
  const overdue = meta ? meta.replyDueAt < MOCK_NOW : false;
  if (answered >= request.sentTo.length && answered > 0) return "ready";
  if (overdue && answered < request.sentTo.length) return answered ? "collecting" : "overdue";
  return answered ? "collecting" : "sent";
}
