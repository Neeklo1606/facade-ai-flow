/**
 * Порт снабжения (ADR-057): тот же вид, каким станет HTTP-API. Состояние общее с портом
 * учёта времени: объекты, роли и сброс показа одни на оба модуля.
 */
import type {
  Certificate,
  Offer,
  Receipt,
  Supplier,
  SupplyPriority,
  SupplyRequest,
} from "@/domain/gas-ops/supply";

export interface CreateRequestInput {
  objectId: string;
  lines: { itemId: string; qty: string | number }[];
  needBy: string | null;
  priority: SupplyPriority;
  photos: string[];
  clientKey: string | null;
}

export interface AddOfferInput {
  requestId: string;
  supplierId: string;
  /** Цена за единицу рублями, как ввёл человек; пусто — строку поставщик не предложил */
  lines: { lineId: string; price: string }[];
  leadDays: string | number;
  delivery: string;
  terms: string | null;
  fileName: string | null;
}

export interface AcceptDeliveryInput {
  requestId: string;
  lines: { lineId: string; qty: string | number }[];
  withDiscrepancy: boolean;
  discrepancy: string | null;
  invoicePhoto: string | null;
  certificates: Certificate[];
  clientKey: string | null;
}

export interface AddSupplierInput {
  name: string;
  inn: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  categories: string[];
}

export class SupplyError extends Error {
  constructor(
    readonly code:
      | "not-allowed"
      | "not-found"
      | "bad-move"
      | "no-lines"
      | "bad-qty"
      | "no-object"
      | "bad-price"
      | "reason-required"
      | "no-offer"
      | "discrepancy-required"
      | "note-required"
      | "bad-input",
    message: string,
  ) {
    super(message);
    this.name = "SupplyError";
  }
}

export interface GasSupplyPort {
  createRequest(input: CreateRequestInput): Promise<SupplyRequest>;
  /** «Взять в работу», «Запросить предложения», «Закрыть» */
  moveRequest(input: {
    id: string;
    to: "in-work" | "waiting-offers" | "closed";
  }): Promise<SupplyRequest>;
  rejectRequest(input: { id: string; reason: string }): Promise<SupplyRequest>;
  addOffer(input: AddOfferInput): Promise<Offer>;
  chooseOffer(input: { requestId: string; offerId: string }): Promise<SupplyRequest>;
  /** Человек заказал сам: система только отмечает (инвариант 9) */
  markOrdered(input: { requestId: string }): Promise<SupplyRequest>;
  markInTransit(input: { requestId: string; eta: string }): Promise<SupplyRequest>;
  acceptDelivery(input: AcceptDeliveryInput): Promise<Receipt>;
  addSupplier(input: AddSupplierInput): Promise<Supplier>;
}
