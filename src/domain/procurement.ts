import type {
  OfferLine,
  ProjectDecision,
  RfqStatus,
  SupplierOffer,
  SupplyRequest,
} from "@/contracts";
import { fmtMoney, fmtNum } from "@/shared/number-format";
import { wallMs } from "./time";

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
  // Моменты времени, а не строки: у срока и «сейчас» может быть разный часовой пояс
  if (request.replyDueAt && wallMs(request.replyDueAt) < wallMs(now)) return "overdue";
  return answered ? "collecting" : "sent";
}

/**
 * Срок ответа поставщиков для экрана: сколько часов осталось (отрицательное — просрочено).
 * Только пока ответы ждём; у готового к сравнению, решённого и заказанного запроса срока нет.
 */
export function replyDue(request: SupplyRequest, status: RfqStatus, now: string) {
  const waiting = status === "sent" || status === "collecting" || status === "overdue";
  if (!waiting || !request.replyDueAt) return null;
  const hours = Math.round((wallMs(request.replyDueAt) - wallMs(now)) / 3_600_000);
  return { hours, overdue: status === "overdue" };
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
  cells: Record<string, CellCalc>;
  /** Товар без доставки и НДС */
  goods: number;
  deliveryCost: number;
  vatPct: number;
  /** Товар и доставка без НДС */
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
 * Считается в адаптере и приходит в карточке запроса: экраны деньги не считают (P3-1).
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
      cells: {},
      goods: 0,
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
    const subtotal = goods + deliveryCost;
    const vat = Math.round((subtotal * vatPct) / 100);
    // Доставка и НДС раскладываются по строкам целыми копейками так, чтобы сумма долей
    // совпала с итогом колонки: округление каждой доли отдельно теряло копейки
    const deliveries = spread(
      goods ? deliveryCost : 0,
      amounts.map((a) => a.amount),
    );
    const vats = spread(
      vat,
      amounts.map((a, index) => a.amount + (deliveries[index] ?? 0)),
    );
    const cells: Record<string, CellCalc> = {};
    for (const [index, { item, line, amount }] of amounts.entries()) {
      const delivery = deliveries[index] ?? 0;
      const vat = vats[index] ?? 0;
      cells[item.id] = {
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
      };
    }
    const list = Object.values(cells);
    return {
      supplierId,
      offerId: offer.id,
      receivedAt: offer.receivedAt,
      cells,
      goods,
      deliveryCost,
      vatPct,
      subtotal,
      vat,
      total: subtotal + vat,
      complete: list.length === request.items.length,
      deviations: list.filter((c) => c.deviation || c.shortage).length,
      maxLeadTime: Math.max(0, ...list.map((c) => c.leadTimeDays)),
    };
  });

  const answered = columns.filter((c) => c.offerId);
  const candidates = answered.filter((c) => c.complete);
  const best = (candidates.length ? candidates : answered).reduce<ColumnCalc | null>(
    (acc, c) => (!acc || c.total < acc.total ? c : acc),
    null,
  );
  return { columns, answered: answered.length, bestSupplierId: best?.supplierId ?? null };
}

export type OfferComparison = ReturnType<typeof compareOffers>;

/**
 * Разложить целую сумму по весам методом наибольшего остатка: доли целые, их сумма равна
 * сумме. Нулевые веса — нулевые доли.
 */
export function spread(total: number, weights: number[]) {
  const sumOfWeights = weights.reduce((acc, weight) => acc + weight, 0);
  if (!sumOfWeights) return weights.map(() => 0);
  const exact = weights.map((weight) => (total * weight) / sumOfWeights);
  const shares = exact.map(Math.floor);
  let left = total - shares.reduce((acc, share) => acc + share, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares;
}

/** Склонение по числу: 1 предложение, 2 предложения, 5 предложений */
function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Причина решения обязательна и содержательна: столько же требует форма и схема порта */
export const DECISION_REASON_MIN = 15;

export function decisionReasonError(reason: string): string | null {
  return reason.trim().length < DECISION_REASON_MIN
    ? `Напишите причину решения: не короче ${DECISION_REASON_MIN} символов`
    : null;
}

/**
 * Решение «выбор поставщика»: требование, варианты и выбор собираются из запроса и сравнения,
 * а не из формы — в истории остаются те цифры, которые видел сервер в момент решения.
 */
export function supplierDecision(input: {
  request: SupplyRequest;
  comparison: OfferComparison;
  supplierId: string;
  reason: string;
  approvedBy: string;
  supplierName: (id: string) => string;
}): Omit<ProjectDecision, "id" | "approvedAt" | "link"> {
  const { request, comparison, supplierId, supplierName } = input;
  const chosen = comparison.columns.find((c) => c.supplierId === supplierId);
  if (!chosen?.offerId) throw new Error("Поставщик не прислал предложение по запросу");
  const answered = comparison.answered;
  const offered = comparison.columns.filter((c) => c.offerId);
  const names = request.items.slice(0, 2).map((item) => item.name);
  const rest = request.items.length - names.length;
  return {
    projectId: request.projectId,
    kind: "supplier",
    requestId: request.id,
    supplierId,
    reportId: null,
    materialFamily: null,
    title: `${names.join(", ")}${rest > 0 ? ` и ещё ${rest}` : ""} — «${supplierName(supplierId)}»`,
    requirement: request.items.map((i) => `${i.name} — ${fmtNum(i.qty)} ${i.unit}`).join("; "),
    problem: `Получено ${answered} ${plural(answered, "предложение", "предложения", "предложений")} из ${request.sentTo.length}; цены и сроки различаются${offered.some((c) => c.deviations) ? ", есть отклонения от спецификации" : ""}`,
    options: offered.map(
      (c) =>
        `«${supplierName(c.supplierId)}» — ${fmtMoney(c.total)} с НДС и доставкой, до ${c.maxLeadTime} дн.${c.deviations ? `, отклонений: ${c.deviations}` : ""}`,
    ),
    choice: `«${supplierName(supplierId)}», ${fmtMoney(chosen.total)}`,
    reason: input.reason,
    approvedBy: input.approvedBy,
    basisLabel: `Письма поставщиков по запросу ${request.number}`,
    basisSourceId: Object.values(chosen.cells)[0]?.sourceId ?? null,
  };
}
