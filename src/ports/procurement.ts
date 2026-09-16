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

export const requestCard = z.object({
  summary: requestSummary,
  recipients: z.array(recipientView),
  offers: z.array(supplierOffer),
  lines: z.array(offerLine),
  decision: projectDecision.nullable(),
});

export const recordDecisionInput = projectDecision.omit({ id: true, approvedAt: true, link: true });

export const remindResult = z.object({ reminded: z.array(id) });
export const templateList = z.array(emailTemplates);
export const deliveryList = z.array(delivery);

export type CreateRequestInput = z.infer<typeof createRequestInput>;
export type CreateRequestResult = z.infer<typeof createRequestResult>;
export type RecordDecisionInput = z.infer<typeof recordDecisionInput>;
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
  /** Решение по запросу одно: повтор — ConflictError. Позиции переходят в `supplier_selected` */
  recordDecision(input: RecordDecisionInput, actor: Actor): Promise<ProjectDecision>;

  deliveries(projectId: string): Promise<Delivery[]>;
}
