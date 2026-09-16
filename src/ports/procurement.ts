import { z } from "zod";
import {
  counterparties,
  delivery,
  emailTemplates,
  offerLine,
  projectDecision,
  supplierOffer,
  supplierProfiles,
  supplyRequest,
  type Counterparty,
  type Delivery,
  type EmailTemplate,
  type OfferLine,
  type ProjectDecision,
  type SupplierOffer,
  type SupplierProfile,
  type SupplyRequest,
} from "@/contracts";
import type { Actor } from "./common";

export const createRequestInput = z.object({
  projectId: z.string().min(1),
  /** Позиции, готовые к запросу; одинаковые материалы собираются в одну строку */
  positionIds: z.array(z.string().min(1)).min(1),
  supplierIds: z.array(z.string().min(1)).min(1),
  templateId: z.string().min(1).nullable(),
  replyDueAt: z.string().datetime({ local: true, offset: true }),
});

export const listSuppliersInput = z.object({
  region: z.string().optional(),
  categories: z.array(z.string()).optional(),
});

export const supplierListItem = z.object({ supplier: counterparties, profile: supplierProfiles });

export const requestCard = z.object({
  request: supplyRequest,
  offers: z.array(supplierOffer),
  lines: z.array(offerLine),
  decision: projectDecision.nullable(),
});

export const recordDecisionInput = projectDecision.omit({
  id: true,
  approvedAt: true,
  link: true,
});

export const recordOfferInput = supplierOffer.omit({ id: true }).extend({
  lines: z.array(offerLine.omit({ id: true, offerId: true })).min(1),
});

export const templateList = z.array(emailTemplates);
export const deliveryList = z.array(delivery);

export type CreateRequestInput = z.infer<typeof createRequestInput>;
export type ListSuppliersInput = z.infer<typeof listSuppliersInput>;
export type RecordDecisionInput = z.infer<typeof recordDecisionInput>;
export type RecordOfferInput = z.infer<typeof recordOfferInput>;

export interface SupplierListItem {
  supplier: Counterparty;
  profile: SupplierProfile;
}

export interface RequestCard {
  request: SupplyRequest;
  offers: SupplierOffer[];
  lines: OfferLine[];
  decision: ProjectDecision | null;
}

/** Поставщики, запросы, предложения, решения и поставки. */
export interface ProcurementPort {
  suppliers(input: ListSuppliersInput): Promise<SupplierListItem[]>;
  /** Отмечает контакт проверенным сегодняшней датой */
  verifyContact(supplierId: string, actor: Actor): Promise<SupplierProfile>;
  templates(): Promise<EmailTemplate[]>;

  requests(projectId: string): Promise<SupplyRequest[]>;
  request(requestId: string): Promise<RequestCard | null>;
  /**
   * Создаёт запрос со строками, получателями и связями с позициями, переводит позиции
   * в `requested`, пишет событие `request_created`. Позиции не готовы к запросу — ConflictError.
   */
  createRequest(input: CreateRequestInput, actor: Actor): Promise<SupplyRequest>;
  /** Напоминает поставщикам без ответа; возвращает их id */
  remind(requestId: string, actor: Actor): Promise<string[]>;
  /** Предложение, распознанное из письма; позиции запроса переходят в `offers` */
  recordOffer(input: RecordOfferInput): Promise<SupplierOffer>;
  /** Решение по запросу одно: повтор — ConflictError. Позиции переходят в `supplier_selected` */
  recordDecision(input: RecordDecisionInput, actor: Actor): Promise<ProjectDecision>;

  deliveries(projectId: string): Promise<Delivery[]>;
}
