import { z } from "zod";
import {
  checklistResult,
  counterparties,
  delivery,
  deliveryCard,
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
  type DeliveryCard,
  type EmailTemplate,
  type OfferLine,
  type ProjectDecision,
  type SupplierOffer,
  type SupplierProfile,
  materialCategories,
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

/** Показатели поставщика по фактам: запросы, ответы, поставки (ADR-014, п. 7) */
export const supplierStatsView = z.object({
  requests: z.number().int().nonnegative(),
  answered: z.number().int().nonnegative(),
  avgReplyHours: z.number().nonnegative().nullable(),
  onTimeShare: z.number().min(0).max(1).nullable(),
  deliveriesReceived: z.number().int().nonnegative(),
});

export const supplierListItem = z.object({
  supplier: counterparties,
  profile: supplierProfiles,
  stats: supplierStatsView,
});

/** Карточка поставщика: всё считается по запросам, предложениям и поставкам (ADR-014, п. 7) */
export const supplierCard = z.object({
  supplier: counterparties,
  profile: supplierProfiles,
  categories: z.array(materialCategories),
  stats: supplierStatsView,
  requests: z.array(
    z.object({
      requestId: z.string(),
      number: z.string(),
      projectId: z.string(),
      projectName: z.string(),
      sentAt: timestampSchema.nullable(),
      answered: z.boolean(),
      chosen: z.boolean(),
    }),
  ),
});
export type SupplierCard = z.infer<typeof supplierCard>;

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
  /** Срок ответа от времени сервера; null — ответов уже не ждём */
  replyDue: z.object({ hours: z.number().int(), overdue: z.boolean() }).nullable(),
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

/**
 * Движение поставки до приёмки (ADR-011): отгружено, в пути, прибыло — или отклонение
 * до приёмки, тогда примечание обязательно (это причина).
 */
export const moveDeliveryInput = z
  .object({
    deliveryId: id,
    status: z.enum(["shipped", "in_transit", "arrived", "rejected"]),
    note: z.string().trim().max(500).nullable().default(null),
  })
  .refine((value) => value.status !== "rejected" || !!value.note, {
    message: "Причина отклонения обязательна",
    path: ["note"],
  });

/** Фото приёмки: уменьшенный JPEG из браузера, не больше ~150 КБ в base64 */
export const acceptancePhoto = z.object({
  dataUrl: z
    .string()
    .startsWith("data:image/jpeg;base64,")
    .max(200_000, "Фото слишком большое: уменьшите перед отправкой"),
  caption: z.string().trim().max(200).nullable().default(null),
});

/**
 * Акт приёмки. Правила результата — в src/domain/deliveries.ts (`acceptanceError`), адаптер
 * проверяет их перед записью: экран может ошибиться, акт — нет.
 */
export const acceptDeliveryInput = z.object({
  deliveryId: id,
  result: z.enum(["accepted", "accepted_with_remarks", "rejected"]),
  lines: z
    .array(
      z.object({
        lineId: id,
        acceptedQty: z.number().nonnegative(),
        remark: z.string().trim().max(500).nullable().default(null),
      }),
    )
    .min(1),
  checklist: z.array(checklistResult).min(1),
  photos: z.array(acceptancePhoto).max(6),
  reason: z.string().trim().max(1000).nullable().default(null),
  /** Подтверждение принявшего: электронной подписи нет, это подтверждение от своего имени */
  confirmed: z.literal(true),
});

/** Закрыть замечание по поставке: чем решено — обязательно, иначе очередь теряет смысл */
export const resolveRemarkInput = z.object({
  remarkId: id,
  resolution: z.string().trim().min(3).max(500),
});

export const remindResult = z.object({ reminded: z.array(id) });
export const templateList = z.array(emailTemplates);
export const deliveryList = z.array(delivery);
export const deliveryCardView = deliveryCard;

export type CreateRequestInput = z.infer<typeof createRequestInput>;
export type CreateRequestResult = z.infer<typeof createRequestResult>;
export type ChooseSupplierInput = z.infer<typeof chooseSupplierInput>;
export type MoveDeliveryInput = z.infer<typeof moveDeliveryInput>;
export type AcceptDeliveryInput = z.infer<typeof acceptDeliveryInput>;
export type ResolveRemarkInput = z.infer<typeof resolveRemarkInput>;
export type OfferComparison = z.infer<typeof offerComparison>;
export type ComparisonColumn = z.infer<typeof comparisonColumn>;
export type ComparisonCell = z.infer<typeof comparisonCell>;
export type RequestSummary = z.infer<typeof requestSummary>;

export type SupplierListItem = z.infer<typeof supplierListItem>;

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
  /** Карточка поставщика: категории, контакты, история запросов, показатели (ADR-014, п. 7) */
  supplier(supplierId: string): Promise<SupplierCard | null>;
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
   * Фиксирует выбор поставщика и создаёт поставку «ожидается» (ADR-011). Решение по запросу одно:
   * повтор — ConflictError; поставщик без предложения — ConflictError. Позиции переходят в `ordered`
   */
  chooseSupplier(input: ChooseSupplierInput, actor: Actor): Promise<ProjectDecision>;

  deliveries(projectId: string): Promise<Delivery[]>;
  delivery(deliveryId: string): Promise<DeliveryCard | null>;
  /** Движение поставки; недопустимый переход — ConflictError, нет поставки — NotFoundError */
  moveDelivery(input: MoveDeliveryInput, actor: Actor): Promise<DeliveryCard>;
  /**
   * Акт приёмки: факт по строкам, чек-лист, фото, результат. Нарушение правил акта —
   * ConflictError с текстом правила. Расхождения создают замечания снабжению
   */
  acceptDelivery(input: AcceptDeliveryInput, actor: Actor): Promise<DeliveryCard>;
  /** Закрывает замечание снабжения; уже закрытое — ConflictError */
  resolveRemark(input: ResolveRemarkInput, actor: Actor): Promise<DeliveryCard>;
}
