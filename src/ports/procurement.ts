import { z } from "zod";
import {
  counterparties,
  delivery,
  emailTemplates,
  offerLine,
  projectDecision,
  rfqDisplayStatus,
  supplierOffer,
  supplierProfiles,
  supplyRequest,
  timestampSchema,
  type Counterparty,
  type Delivery,
  type EmailTemplate,
  type OfferLine,
  type ProjectDecision,
  type SupplierOffer,
  type SupplierProfile,
} from "@/contracts";
import type { Actor } from "./common";

const id = z.string().min(1);

export const createRequestInput = z.object({
  projectId: id,
  /** Позиции, готовые к запросу; одинаковые материалы собираются в одну строку */
  positionIds: z.array(id).min(1),
  supplierIds: z.array(id).min(1),
  templateId: id.nullable(),
  replyDueAt: timestampSchema,
});

export const createRequestResult = z.object({
  request: supplyRequest,
  /** Сколько позиций спецификации вошло в запрос */
  positions: z.number().int().positive(),
});

export const supplierListItem = z.object({ supplier: counterparties, profile: supplierProfiles });

/** Запрос в списке: с числом ответов, лучшей ценой и статусом на экране */
export const requestSummary = z.object({
  request: supplyRequest,
  answered: z.number().int().nonnegative(),
  /** Кто из получателей прислал предложение */
  answeredBy: z.array(id),
  /** Кому напомнили и чей ответ ещё ждём */
  awaiting: z.array(id),
  bestSupplierId: id.nullable(),
  /** Итог лучшего предложения с НДС и доставкой, копейки */
  bestTotal: z.number().int().nullable(),
  status: rfqDisplayStatus,
  decisionId: id.nullable(),
});

export const recipientView = z.object({ supplierId: id, remindedAt: timestampSchema.nullable() });

const money = z.number().int();

/** Ячейка сравнения: строка запроса у одного поставщика. Суммы в копейках */
export const comparisonCell = z.object({
  price: z.number().nonnegative(),
  qty: z.number().nonnegative(),
  amount: money,
  delivery: money,
  vat: money,
  total: money,
  leadTimeDays: z.number().int().nonnegative(),
  availableQty: z.number().nonnegative(),
  shortage: z.boolean(),
  deviation: z.string().nullable(),
  sourceId: id.nullable(),
  location: z.string(),
  name: z.string(),
});

/** Колонка сравнения: итог поставщика по запросу */
export const comparisonColumn = z.object({
  supplierId: id,
  offerId: id.nullable(),
  receivedAt: timestampSchema.nullable(),
  /** Ключ — id строки запроса; строки, на которые поставщик не ответил, отсутствуют */
  cells: z.record(comparisonCell),
  goods: money,
  deliveryCost: money,
  vatPct: z.number().nonnegative(),
  subtotal: money,
  vat: money,
  total: money,
  complete: z.boolean(),
  deviations: z.number().int().nonnegative(),
  maxLeadTime: z.number().int().nonnegative(),
});

/** Сравнение предложений: считается на сервере (P3-1), экран только показывает */
export const offerComparison = z.object({
  columns: z.array(comparisonColumn),
  answered: z.number().int().nonnegative(),
  bestSupplierId: id.nullable(),
});

export const requestCard = z.object({
  summary: requestSummary,
  recipients: z.array(recipientView),
  offers: z.array(supplierOffer),
  lines: z.array(offerLine),
  comparison: offerComparison,
  decision: projectDecision.nullable(),
});

/**
 * Выбор поставщика по запросу. Требование, варианты, цены и основание решения сервер собирает сам
 * из запроса и сравнения; от формы — только выбор, причина и кто согласовал.
 */
export const chooseSupplierInput = z.object({
  requestId: id,
  supplierId: id,
  reason: z.string().trim().min(15).max(2000),
  approvedBy: id,
});

export const remindResult = z.object({ reminded: z.array(id) });
export const templateList = z.array(emailTemplates);
export const deliveryList = z.array(delivery);

export type CreateRequestInput = z.infer<typeof createRequestInput>;
export type CreateRequestResult = z.infer<typeof createRequestResult>;
export type ChooseSupplierInput = z.infer<typeof chooseSupplierInput>;
export type OfferComparison = z.infer<typeof offerComparison>;
export type ComparisonColumn = z.infer<typeof comparisonColumn>;
export type ComparisonCell = z.infer<typeof comparisonCell>;
export type RequestSummary = z.infer<typeof requestSummary>;

export interface SupplierListItem {
  supplier: Counterparty;
  profile: SupplierProfile;
}

export interface RequestCard {
  summary: RequestSummary;
  recipients: { supplierId: string; remindedAt: string | null }[];
  offers: SupplierOffer[];
  lines: OfferLine[];
  comparison: OfferComparison;
  decision: ProjectDecision | null;
}

/** Поставщики, запросы, предложения, решения и поставки. */
export interface ProcurementPort {
  suppliers(): Promise<SupplierListItem[]>;
  /** Отмечает контакт проверенным сегодняшней датой */
  verifyContact(input: { supplierId: string }, actor: Actor): Promise<void>;
  templates(): Promise<EmailTemplate[]>;

  requests(projectId: string): Promise<RequestSummary[]>;
  request(requestId: string): Promise<RequestCard | null>;
  /**
   * Создаёт запрос со строками, получателями и связями с позициями, переводит позиции
   * в `requested`, пишет событие `request_created`. Позиции не готовы к запросу — ConflictError.
   */
  createRequest(input: CreateRequestInput, actor: Actor): Promise<CreateRequestResult>;
  /** Напоминает поставщикам без ответа; возвращает их id */
  remind(input: { requestId: string }, actor: Actor): Promise<{ reminded: string[] }>;
  /**
   * Фиксирует выбор поставщика. Решение по запросу одно: повтор — ConflictError; поставщик без
   * предложения — ConflictError. Позиции переходят в `supplier_selected`
   */
  chooseSupplier(input: ChooseSupplierInput, actor: Actor): Promise<ProjectDecision>;

  deliveries(projectId: string): Promise<Delivery[]>;
}
