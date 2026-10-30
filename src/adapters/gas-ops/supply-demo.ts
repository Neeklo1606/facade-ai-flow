/**
 * Демо-адаптер снабжения (ADR-057) поверх общего состояния вкладки. Права и переходы
 * проверяются здесь, как их будет проверять сервер: скрытая кнопка защитой не является.
 */
import {
  canMove,
  nextRequestNumber,
  parseQty,
  parseRubToKop,
  receiptOf,
  SUPPLY_STATUS_LABEL,
  type Offer,
  type Receipt,
  type Supplier,
  type SupplyRequest,
  type SupplyState,
  type SupplyStatus,
} from "@/domain/gas-ops/supply";
import type { AuditLog, Role, User } from "@/domain/gas-ops/model";
import type { GasOpsSnapshot } from "@/ports/gas-ops";
import { SupplyError, type GasSupplyPort } from "@/ports/gas-supply";
import { getSnapshot, update } from "./state";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function nowOf(snapshot: GasOpsSnapshot): string {
  const device = new Date();
  const time = `${String(device.getHours()).padStart(2, "0")}:${String(device.getMinutes()).padStart(2, "0")}`;
  return `${snapshot.today}T${time}:00`;
}

function actorOf(snapshot: GasOpsSnapshot): User {
  const user = snapshot.users.find((u) => u.id === snapshot.actorId);
  if (!user) throw new SupplyError("not-allowed", "Войдите под своей ролью.");
  return user;
}

function must(snapshot: GasOpsSnapshot, roles: readonly Role[], message: string): User {
  const user = actorOf(snapshot);
  if (!roles.includes(user.role)) throw new SupplyError("not-allowed", message);
  return user;
}

/** Прораб работает только со своими объектами: чужой объект для него не существует */
function mustObject(snapshot: GasOpsSnapshot, user: User, objectId: string): void {
  if (!snapshot.objects.some((o) => o.id === objectId)) {
    throw new SupplyError("no-object", "Объект не выбран или больше не доступен.");
  }
  if (user.allowedObjectIds !== "all" && !user.allowedObjectIds.includes(objectId)) {
    throw new SupplyError("not-allowed", "Этот объект не закреплён за вами.");
  }
}

function mustRequest(snapshot: GasOpsSnapshot, id: string): SupplyRequest {
  const request = snapshot.supply.requests.find((r) => r.id === id);
  if (!request) throw new SupplyError("not-found", "Заявка не найдена. Обновите экран.");
  return request;
}

function mustMove(request: SupplyRequest, to: SupplyStatus): void {
  if (!canMove(request.status, to)) {
    throw new SupplyError(
      "bad-move",
      `Из статуса «${SUPPLY_STATUS_LABEL[request.status]}» нельзя перейти в «${SUPPLY_STATUS_LABEL[to]}».`,
    );
  }
}

function audit(
  snapshot: GasOpsSnapshot,
  user: User,
  action: string,
  entityId: string,
  detail: string,
): AuditLog {
  return { id: newId("aud"), at: nowOf(snapshot), actor: user.name, action, entityId, detail };
}

/** Записать изменение снабжения и строку журнала действий одним шагом */
function commit(change: (supply: SupplyState) => SupplyState, log: AuditLog): void {
  update((s) => ({ ...s, supply: change(s.supply), audit: [log, ...s.audit] }));
}

function moved(
  snapshot: GasOpsSnapshot,
  user: User,
  request: SupplyRequest,
  to: SupplyStatus,
  patch: Partial<SupplyRequest> = {},
  note: string | null = null,
): SupplyRequest {
  return {
    ...request,
    ...patch,
    status: to,
    history: [...request.history, { at: nowOf(snapshot), actor: user.name, status: to, note }],
  };
}

function replace(supply: SupplyState, request: SupplyRequest): SupplyState {
  return { ...supply, requests: supply.requests.map((r) => (r.id === request.id ? request : r)) };
}

const DECIDERS: readonly Role[] = ["supply", "admin"];
const AUTHORS: readonly Role[] = ["prorab", "supply", "admin"];

/** Методы асинхронные, как у будущего сервера: ошибка правил приходит отказом обещания */
export function createGasSupplyDemo(): GasSupplyPort {
  return {
    async createRequest(input) {
      const snapshot = getSnapshot();
      const user = must(snapshot, AUTHORS, "Заявку создают прораб и снабженец.");
      // Повтор отправки с телефона: та же заявка, без дубля (инвариант 4)
      if (input.clientKey) {
        const same = snapshot.supply.requests.find((r) => r.clientKey === input.clientKey);
        if (same) return same;
      }
      mustObject(snapshot, user, input.objectId);
      if (input.lines.length === 0)
        throw new SupplyError("no-lines", "Добавьте хотя бы одну позицию.");
      const lines = input.lines.map((line, index) => {
        if (!snapshot.supply.items.some((i) => i.id === line.itemId)) {
          throw new SupplyError(
            "bad-input",
            `Строка ${index + 1}: выберите позицию из номенклатуры.`,
          );
        }
        const qty = parseQty(line.qty);
        if (qty === null)
          throw new SupplyError("bad-qty", `Строка ${index + 1}: укажите количество больше нуля.`);
        return { id: newId("zl"), itemId: line.itemId, qty };
      });
      const at = nowOf(snapshot);
      const request: SupplyRequest = {
        id: newId("zk"),
        number: nextRequestNumber(snapshot.supply.requests),
        objectId: input.objectId,
        lines,
        needBy: input.needBy,
        priority: input.priority,
        photos: input.photos,
        authorId: user.id,
        authorName: user.name,
        clientKey: input.clientKey,
        createdAt: at,
        status: "new",
        rejectReason: null,
        chosenOfferId: null,
        eta: null,
        history: [{ at, actor: user.name, status: "new", note: null }],
        source: "mock",
      };
      commit(
        (supply) => ({ ...supply, requests: [request, ...supply.requests] }),
        audit(
          snapshot,
          user,
          "Создал заявку",
          request.id,
          `${request.number}, позиций ${lines.length}`,
        ),
      );
      return request;
    },

    async moveRequest({ id, to }) {
      const snapshot = getSnapshot();
      const user = must(snapshot, DECIDERS, "Заявку ведёт снабженец.");
      const request = mustRequest(snapshot, id);
      mustMove(request, to);
      const next = moved(snapshot, user, request, to);
      commit(
        (supply) => replace(supply, next),
        audit(snapshot, user, SUPPLY_STATUS_LABEL[to], id, request.number),
      );
      return next;
    },

    async rejectRequest({ id, reason }) {
      const snapshot = getSnapshot();
      const user = must(snapshot, DECIDERS, "Отклоняет заявку снабженец.");
      const request = mustRequest(snapshot, id);
      if (!reason.trim()) throw new SupplyError("reason-required", "Укажите причину отклонения.");
      mustMove(request, "rejected");
      const next = moved(
        snapshot,
        user,
        request,
        "rejected",
        { rejectReason: reason.trim() },
        reason.trim(),
      );
      commit(
        (supply) => replace(supply, next),
        audit(snapshot, user, "Отклонил заявку", id, reason.trim()),
      );
      return next;
    },

    async addOffer(input) {
      const snapshot = getSnapshot();
      const user = must(snapshot, DECIDERS, "Предложения вводит снабженец.");
      const request = mustRequest(snapshot, input.requestId);
      if (request.status !== "waiting-offers") {
        throw new SupplyError("bad-move", "Сначала нажмите «Запросить предложения».");
      }
      if (!snapshot.supply.suppliers.some((s) => s.id === input.supplierId)) {
        throw new SupplyError("bad-input", "Выберите поставщика из справочника.");
      }
      const lines = request.lines.map((line) => {
        const text = input.lines.find((l) => l.lineId === line.id)?.price.trim() ?? "";
        if (!text) return { lineId: line.id, priceKop: null };
        const priceKop = parseRubToKop(text);
        if (priceKop === null) throw new SupplyError("bad-price", `Цена «${text}» не число.`);
        return { lineId: line.id, priceKop };
      });
      if (lines.every((l) => l.priceKop === null)) {
        throw new SupplyError("bad-price", "Укажите цену хотя бы по одной позиции.");
      }
      const leadDays = parseQty(input.leadDays);
      if (leadDays === null || !Number.isInteger(leadDays)) {
        throw new SupplyError("bad-input", "Срок поставки: целое число дней.");
      }
      const deliveryKop = input.delivery.trim() ? parseRubToKop(input.delivery) : 0;
      if (deliveryKop === null) throw new SupplyError("bad-price", "Стоимость доставки не число.");
      const offer: Offer = {
        id: newId("of"),
        requestId: request.id,
        supplierId: input.supplierId,
        lines,
        leadDays,
        deliveryKop,
        terms: input.terms?.trim() || null,
        fileName: input.fileName,
        enteredBy: user.name,
        at: nowOf(snapshot),
      };
      const supplier = snapshot.supply.suppliers.find((s) => s.id === input.supplierId)!;
      commit(
        (supply) => ({ ...supply, offers: [...supply.offers, offer] }),
        audit(
          snapshot,
          user,
          "Внёс предложение",
          request.id,
          `${request.number}: ${supplier.name}`,
        ),
      );
      return offer;
    },

    async chooseOffer({ requestId, offerId }) {
      const snapshot = getSnapshot();
      const user = must(snapshot, DECIDERS, "Предложение выбирает снабженец.");
      const request = mustRequest(snapshot, requestId);
      if (request.status !== "waiting-offers") {
        throw new SupplyError(
          "bad-move",
          "Выбрать предложение можно, пока заявка ждёт предложения.",
        );
      }
      if (!snapshot.supply.offers.some((o) => o.id === offerId && o.requestId === requestId)) {
        throw new SupplyError("no-offer", "Предложение не найдено.");
      }
      const next = { ...request, chosenOfferId: offerId };
      commit(
        (supply) => replace(supply, next),
        audit(snapshot, user, "Выбрал предложение", requestId, request.number),
      );
      return next;
    },

    async markOrdered({ requestId }) {
      const snapshot = getSnapshot();
      const user = must(snapshot, DECIDERS, "Заказ отмечает снабженец.");
      const request = mustRequest(snapshot, requestId);
      mustMove(request, "ordered");
      if (!request.chosenOfferId)
        throw new SupplyError("no-offer", "Сначала выберите предложение.");
      const next = moved(snapshot, user, request, "ordered");
      commit(
        (supply) => replace(supply, next),
        audit(snapshot, user, "Отметил «заказано»", requestId, request.number),
      );
      return next;
    },

    async markInTransit({ requestId, eta }) {
      const snapshot = getSnapshot();
      const user = must(snapshot, DECIDERS, "Поставку отмечает снабженец.");
      const request = mustRequest(snapshot, requestId);
      mustMove(request, "in-transit");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eta))
        throw new SupplyError("bad-input", "Укажите ожидаемую дату доставки.");
      const next = moved(snapshot, user, request, "in-transit", { eta });
      commit(
        (supply) => replace(supply, next),
        audit(snapshot, user, "Отметил «в пути»", requestId, `${request.number}, к ${eta}`),
      );
      return next;
    },

    async acceptDelivery(input) {
      const snapshot = getSnapshot();
      const user = must(snapshot, AUTHORS, "Поставку принимает прораб или снабженец.");
      if (input.clientKey) {
        const same = snapshot.supply.receipts.find((r) => r.clientKey === input.clientKey);
        if (same) return same;
      }
      const request = mustRequest(snapshot, input.requestId);
      mustObject(snapshot, user, request.objectId);
      if (request.status !== "in-transit" && request.status !== "partial") {
        throw new SupplyError("bad-move", "Принять можно поставку в пути.");
      }
      const check = receiptOf(request, snapshot.supply.receipts, input);
      if (!check.ok) throw new SupplyError(check.code, check.message);
      const receipt: Receipt = {
        id: newId("rc"),
        requestId: request.id,
        lines: check.lines,
        result: check.result,
        discrepancy: input.withDiscrepancy ? input.discrepancy!.trim() : null,
        invoicePhoto: input.invoicePhoto,
        certificates: input.certificates,
        acceptedBy: user.name,
        at: nowOf(snapshot),
        clientKey: input.clientKey,
      };
      const next = moved(snapshot, user, request, check.status, {}, receipt.discrepancy);
      commit(
        (supply) => ({ ...replace(supply, next), receipts: [...supply.receipts, receipt] }),
        audit(
          snapshot,
          user,
          "Принял поставку",
          request.id,
          `${request.number}: ${check.result === "accepted" ? "без расхождений" : "с расхождением"}`,
        ),
      );
      return receipt;
    },

    async addSupplier(input) {
      const snapshot = getSnapshot();
      const user = must(snapshot, DECIDERS, "Справочник поставщиков ведёт снабженец.");
      if (!input.name.trim()) throw new SupplyError("bad-input", "Укажите название поставщика.");
      const inn = input.inn?.replace(/\s/g, "") || null;
      if (inn && !/^(\d{10}|\d{12})$/.test(inn)) {
        throw new SupplyError("bad-input", "ИНН: 10 цифр у организации или 12 у предпринимателя.");
      }
      const supplier: Supplier = {
        id: newId("sp"),
        name: input.name.trim(),
        inn,
        contact: input.contact?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        categories: input.categories,
        // Как у записей, введённых в показе: демонстрация, не данные заказчика
        source: "mock",
      };
      commit(
        (supply) => ({ ...supply, suppliers: [...supply.suppliers, supplier] }),
        audit(snapshot, user, "Добавил поставщика", supplier.id, supplier.name),
      );
      return supplier;
    },
  };
}

export const gasSupply = createGasSupplyDemo();
