import { z } from "zod";
import { col, idSchema, pgEnum, table } from "./db";

/* ---------- Шаблоны писем ---------- */

export const emailTemplates = table(
  {
    name: "email_templates",
    comment: "Шаблон письма запроса цены с подстановками {объект}, {контакт}, {срок}…",
    primaryKey: ["id"],
    audited: true,
    indexes: [{ columns: ["name"], unique: true, purpose: "выбор шаблона в мастере запроса" }],
  },
  {
    id: col.id(),
    name: col.name(),
    subject: col.name(),
    body: col.name(),
  },
);

/* ---------- Запрос поставщикам ---------- */

export const requestStatus = pgEnum(
  "request_status",
  ["draft", "sent", "decided", "ordered", "cancelled"],
  "Хранимый жизненный цикл запроса. Статус на экране (ждём ответы, просрочен, готов) вычисляется",
  {
    draft: ["sent", "cancelled"],
    sent: ["decided", "cancelled"],
    decided: ["ordered", "cancelled"],
  },
);

export const supplyRequests = table(
  {
    name: "supply_requests",
    comment: "Запрос цены поставщикам по материалам объекта",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      {
        columns: ["number"],
        unique: true,
        purpose:
          "номер «З-2026/318» уникален; год входит в номер, счётчик — последовательность на год",
      },
      {
        columns: ["projectId", "status", "replyDueAt"],
        purpose: "закупки объекта: ждём ответы, просроченные; счётчики реестра",
      },
      {
        columns: ["projectId", "createdAt desc"],
        purpose: "список запросов объекта, новые сверху",
      },
    ],
    checks: [
      "(status = 'draft') = (sent_at is null)",
      "reply_due_at is null or sent_at is null or reply_due_at > sent_at",
    ],
  },
  {
    id: col.id(),
    number: col.name(),
    projectId: col.ref("projects", "restrict"),
    zoneId: col.ref("work_zones", "set null", { nullable: true }),
    authorId: col.ref("employees", "restrict"),
    createdAt: col.timestamp(),
    sentAt: col.timestamp({ nullable: true }),
    replyDueAt: col.timestamp({ nullable: true, comment: "до какого момента ждём ответы" }),
    templateId: col.ref("email_templates", "set null", { nullable: true }),
    status: col.enum(requestStatus),
    sourceId: col.ref("sources", "set null", { nullable: true }),
  },
);

export const supplyRequestLines = table(
  {
    name: "supply_request_lines",
    comment: "Материал в запросе с суммарным количеством по позициям",
    primaryKey: ["id"],
    indexes: [
      {
        columns: ["requestId", "materialId"],
        unique: true,
        where: "material_id is not null",
        purpose: "одинаковые материалы уходят поставщику одной строкой",
      },
    ],
    checks: ["qty > 0"],
  },
  {
    id: col.id(),
    requestId: col.ref("supply_requests", "cascade"),
    materialId: col.ref("materials", "restrict", { nullable: true }),
    name: col.name({ comment: "наименование в письме поставщику" }),
    qty: col.qty(),
    unit: col.name(),
  },
);

export const supplyRequestPositions = table(
  {
    name: "supply_request_positions",
    comment: "Позиции спецификации, из которых собрана строка запроса",
    primaryKey: ["requestLineId", "positionId"],
    indexes: [{ columns: ["positionId"], purpose: "запросы позиции в карточке материала" }],
  },
  {
    requestLineId: col.ref("supply_request_lines", "cascade"),
    positionId: col.ref("positions", "restrict"),
  },
);

export const supplyRequestRecipients = table(
  {
    name: "supply_request_recipients",
    comment: "Кому отправлен запрос и когда напоминали",
    primaryKey: ["requestId", "supplierId"],
    indexes: [{ columns: ["supplierId"], purpose: "история запросов поставщику" }],
  },
  {
    requestId: col.ref("supply_requests", "cascade"),
    supplierId: col.ref("counterparties", "restrict"),
    remindedAt: col.timestamp({ nullable: true }),
  },
);

/* ---------- Предложения ---------- */

export const supplierOffers = table(
  {
    name: "supplier_offers",
    comment: "Ответ поставщика на запрос: условия всего предложения. Итог не хранится (R3)",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      {
        columns: ["requestId", "supplierId"],
        unique: true,
        purpose: "одно действующее предложение поставщика на запрос; колонки сравнения",
      },
      { columns: ["supplierId", "receivedAt desc"], purpose: "история предложений поставщика" },
    ],
    checks: ["delivery_cost >= 0", "vat_pct between 0 and 100"],
  },
  {
    id: col.id(),
    requestId: col.ref("supply_requests", "restrict"),
    supplierId: col.ref("counterparties", "restrict"),
    receivedAt: col.timestamp(),
    deliveryCost: col.money(),
    vatPct: col.smallint({ comment: "ставка НДС, %" }),
    validUntil: col.date({ nullable: true }),
    confidence: col.ratio({ comment: "уверенность распознавания письма" }),
    sourceId: col.ref("sources", "set null", { nullable: true }),
  },
);

export const supplierOfferLines = table(
  {
    name: "supplier_offer_lines",
    comment: "Цена поставщика по строке запроса",
    primaryKey: ["id"],
    indexes: [
      { columns: ["offerId", "requestLineId"], unique: true, purpose: "ячейки таблицы сравнения" },
      { columns: ["requestLineId"], purpose: "лучшая цена по материалу" },
    ],
    checks: ["price >= 0", "available_qty >= 0", "lead_time_days >= 0"],
  },
  {
    id: col.id(),
    offerId: col.ref("supplier_offers", "cascade"),
    requestLineId: col.ref("supply_request_lines", "restrict"),
    name: col.name({ comment: "как назвал поставщик" }),
    price: col.money({ comment: "цена за единицу без НДС, копейки" }),
    availableQty: col.qty(),
    leadTimeDays: col.smallint(),
    deviation: col.text({ nullable: true, comment: "отклонение от требования спецификации" }),
    sourceId: col.ref("sources", "set null", { nullable: true }),
    location: col.text({ comment: "где в письме указана цена" }),
  },
);

/* ---------- Поставки ---------- */

export const deliveryStatus = pgEnum(
  "delivery_status",
  ["expected", "in_transit", "received", "rejected"],
  "Состояние поставки",
  { expected: ["in_transit", "received", "rejected"], in_transit: ["received", "rejected"] },
);

export const deliveries = table(
  {
    name: "deliveries",
    comment: "Поставка по запросу от выбранного поставщика",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      { columns: ["projectId", "expectedAt"], purpose: "поставки объекта по дате" },
      { columns: ["requestId"], purpose: "поставки по запросу" },
    ],
    checks: ["(status = 'received') = (received_at is not null)"],
  },
  {
    id: col.id(),
    requestId: col.ref("supply_requests", "restrict"),
    projectId: col.ref("projects", "restrict"),
    supplierId: col.ref("counterparties", "restrict"),
    expectedAt: col.date(),
    receivedAt: col.date({ nullable: true }),
    status: col.enum(deliveryStatus),
    sourceId: col.ref("sources", "set null", { nullable: true }),
  },
);

export const deliveryLines = table(
  {
    name: "delivery_lines",
    comment: "Что везут в поставке",
    primaryKey: ["id"],
    indexes: [{ columns: ["deliveryId"], purpose: "состав поставки" }],
    checks: ["qty > 0"],
  },
  {
    id: col.id(),
    deliveryId: col.ref("deliveries", "cascade"),
    requestLineId: col.ref("supply_request_lines", "restrict"),
    qty: col.qty(),
  },
);

/* ---------- Решения ---------- */

export const decisionKind = pgEnum(
  "decision_kind",
  ["supplier", "replacement", "quantity"],
  "Вид зафиксированного решения",
);

export const projectDecisions = table(
  {
    name: "project_decisions",
    comment: "Зафиксированное решение с требованием, вариантами, выбором и основанием",
    primaryKey: ["id"],
    appendOnly: true,
    indexes: [
      { columns: ["projectId", "approvedAt desc"], purpose: "решения в истории объекта" },
      {
        columns: ["requestId"],
        unique: true,
        where: "request_id is not null",
        purpose: "решение по запросу одно",
      },
    ],
    checks: [
      "kind <> 'supplier' or (request_id is not null and supplier_id is not null)",
      "cardinality(options) >= 1",
    ],
  },
  {
    id: col.id(),
    projectId: col.ref("projects", "restrict"),
    kind: col.enum(decisionKind),
    requestId: col.ref("supply_requests", "restrict", { nullable: true }),
    supplierId: col.ref("counterparties", "restrict", { nullable: true }),
    reportId: col.ref("field_reports", "restrict", { nullable: true }),
    materialFamily: col.text({ nullable: true, comment: "семейство для решений о замене" }),
    title: col.name(),
    requirement: col.text(),
    problem: col.text(),
    options: col.textArray(),
    choice: col.name(),
    reason: col.name(),
    approvedBy: col.ref("employees", "restrict"),
    approvedAt: col.timestamp(),
    basisLabel: col.name({ comment: "основание словами: «Счёт № 1184»" }),
    basisSourceId: col.ref("sources", "set null", { nullable: true }),
  },
);

/* ---------- Представления ---------- */

export const requestLineView = z.object({
  id: idSchema,
  materialId: idSchema.nullable(),
  name: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().min(1),
});

/** Запрос с строками, получателями и параметрами рассылки. */
export const supplyRequest = supplyRequests.extend({
  items: z.array(requestLineView),
  sentTo: z.array(idSchema),
});

export const supplierOffer = supplierOffers;
export const offerLine = supplierOfferLines;

export const delivery = deliveries.extend({
  items: z.array(
    z.object({ requestLineId: idSchema, name: z.string(), qty: z.number(), unit: z.string() }),
  ),
});

/** Решение для экрана: ссылка на связанный раздел строится из ссылок на запрос, отчёт или семейство. */
export const projectDecision = projectDecisions.extend({
  link: z.object({ to: z.string(), label: z.string() }).nullable(),
});

/** Вычисляемый статус запроса на экране (глоссарий, §4) */
export const rfqDisplayStatus = z.enum([
  "sent",
  "collecting",
  "ready",
  "overdue",
  "decided",
  "ordered",
]);

export type EmailTemplate = z.infer<typeof emailTemplates>;
export type SupplyRequestRow = z.infer<typeof supplyRequests>;
export type SupplyRequestLine = z.infer<typeof supplyRequestLines>;
export type SupplyRequestPosition = z.infer<typeof supplyRequestPositions>;
export type SupplyRequestRecipient = z.infer<typeof supplyRequestRecipients>;
export type SupplyRequest = z.infer<typeof supplyRequest>;
export type RequestLine = z.infer<typeof requestLineView>;
export type RequestStatus = z.infer<typeof requestStatus.schema>;
export type SupplierOffer = z.infer<typeof supplierOffers>;
export type OfferLine = z.infer<typeof supplierOfferLines>;
export type DeliveryRow = z.infer<typeof deliveries>;
export type DeliveryLine = z.infer<typeof deliveryLines>;
export type Delivery = z.infer<typeof delivery>;
export type ProjectDecisionRow = z.infer<typeof projectDecisions>;
export type ProjectDecision = z.infer<typeof projectDecision>;
export type RfqStatus = z.infer<typeof rfqDisplayStatus>;

/* ---------- Словари ---------- */

export const rfqStatusLabel: Record<RfqStatus, string> = {
  sent: "Отправлен",
  collecting: "Собираем ответы",
  ready: "Готово к сравнению",
  overdue: "Ответы просрочены",
  decided: "Решение принято",
  ordered: "Заказано",
};

export const deliveryStatusLabel: Record<Delivery["status"], string> = {
  expected: "Ожидается",
  in_transit: "В пути",
  received: "Принята",
  rejected: "Отклонена",
};

export const decisionKindLabel: Record<ProjectDecision["kind"], string> = {
  supplier: "Выбор поставщика",
  replacement: "Замена материала",
  quantity: "Изменение количества",
};
