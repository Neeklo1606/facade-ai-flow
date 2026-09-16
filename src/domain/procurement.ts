import type { ProjectDecision, RfqStatus, SupplierOffer, SupplyRequest } from "@/contracts";

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
