import { z } from "zod";
import { actorKind } from "./positions";
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

/* ---------- Поставки (ADR-011) ---------- */

export const deliveryStatus = pgEnum(
  "delivery_status",
  ["expected", "shipped", "in_transit", "arrived", "accepted", "accepted_with_remarks", "rejected"],
  "Состояние поставки: создаётся решением по запросу, закрывается актом приёмки",
  {
    expected: ["shipped", "in_transit", "arrived", "rejected"],
    shipped: ["in_transit", "arrived", "rejected"],
    in_transit: ["arrived", "rejected"],
    arrived: ["accepted", "accepted_with_remarks", "rejected"],
  },
);

export const deliveries = table(
  {
    name: "deliveries",
    comment: "Поставка по запросу от выбранного поставщика; создаётся решением (ADR-011)",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      { columns: ["projectId", "expectedAt"], purpose: "поставки объекта по дате" },
      { columns: ["requestId"], purpose: "поставки по запросу" },
      { columns: ["projectId", "status"], purpose: "экран поставок: к приёмке, в пути, приняты" },
    ],
    checks: ["(status in ('accepted', 'accepted_with_remarks')) = (received_at is not null)"],
  },
  {
    id: col.id(),
    requestId: col.ref("supply_requests", "restrict"),
    projectId: col.ref("projects", "restrict"),
    zoneId: col.ref("work_zones", "set null", { nullable: true, comment: "захватка из запроса" }),
    supplierId: col.ref("counterparties", "restrict"),
    decisionId: col.ref("project_decisions", "restrict", {
      nullable: true,
      comment: "решение, которым создана поставка",
    }),
    expectedAt: col.date(),
    receivedAt: col.date({ nullable: true }),
    status: col.enum(deliveryStatus),
    sourceId: col.ref("sources", "set null", { nullable: true }),
  },
);

export const deliveryLines = table(
  {
    name: "delivery_lines",
    comment: "Что везут в поставке и сколько принято",
    primaryKey: ["id"],
    indexes: [{ columns: ["deliveryId"], purpose: "состав поставки" }],
    checks: ["qty > 0", "accepted_qty is null or accepted_qty >= 0"],
  },
  {
    id: col.id(),
    deliveryId: col.ref("deliveries", "cascade"),
    requestLineId: col.ref("supply_request_lines", "restrict"),
    qty: col.qty({ comment: "заявлено поставщиком" }),
    price: col.money({ nullable: true, comment: "цена из предложения, копейки за единицу" }),
    acceptedQty: col.qty({ nullable: true, comment: "принято по акту; null — ещё не принималось" }),
    remark: col.text({ nullable: true, comment: "замечание по строке при приёмке" }),
  },
);

export const deliveryStatusChanges = table(
  {
    name: "delivery_status_changes",
    comment: "Движение поставки: кто и когда перевёл статус",
    primaryKey: ["id"],
    appendOnly: true,
    indexes: [{ columns: ["deliveryId", "at"], purpose: "движение поставки по времени" }],
    checks: ["(actor_kind = 'user') = (actor_id is not null)"],
  },
  {
    id: col.id(),
    deliveryId: col.ref("deliveries", "cascade"),
    status: col.enum(deliveryStatus),
    at: col.timestamp(),
    actorKind: col.enum(actorKind),
    actorId: col.ref("employees", "restrict", { nullable: true }),
    note: col.text({ nullable: true }),
  },
);

/** Пункт чек-листа входного контроля и его результат */
export const checklistResult = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  ok: z.boolean(),
  note: z.string().max(300).nullable(),
});

export const deliveryAcceptances = table(
  {
    name: "delivery_acceptances",
    comment: "Акт приёмки поставки: результат, чек-лист, подтверждение принявшего",
    primaryKey: ["id"],
    appendOnly: true,
    indexes: [{ columns: ["deliveryId"], unique: true, purpose: "одна поставка — один акт" }],
    checks: ["result <> 'rejected' or reason is not null"],
  },
  {
    id: col.id(),
    deliveryId: col.ref("deliveries", "cascade"),
    acceptedAt: col.timestamp(),
    acceptedBy: col.ref("employees", "restrict", {
      comment: "подтверждение приёмки сотрудником сессии; электронной подписи нет",
    }),
    result: col.enum(deliveryStatus),
    reason: col.text({ nullable: true, comment: "причина отклонения" }),
    checklist: col.jsonb(z.array(checklistResult)),
  },
);

export const deliveryPhotos = table(
  {
    name: "delivery_photos",
    comment: "Фотофиксация при приёмке; в демо — уменьшенная копия в состоянии вкладки",
    primaryKey: ["id"],
    indexes: [{ columns: ["deliveryId"], purpose: "фото поставки" }],
  },
  {
    id: col.id(),
    deliveryId: col.ref("deliveries", "cascade"),
    acceptanceId: col.ref("delivery_acceptances", "cascade"),
    takenAt: col.timestamp(),
    takenBy: col.ref("employees", "restrict"),
    dataUrl: col.text({ comment: "JPEG data URL до ~120 КБ; с адаптером БД — ключ хранилища" }),
    caption: col.text({ nullable: true }),
  },
);

export const remarkKind = pgEnum(
  "delivery_remark_kind",
  ["shortage", "surplus", "checklist", "rejected"],
  "Вид замечания по поставке: недостача, излишек, непройденный пункт контроля, отклонение",
);

export const deliveryRemarks = table(
  {
    name: "delivery_remarks",
    comment: "Замечание по поставке для снабжения; попадает в очередь «Требует решения»",
    primaryKey: ["id"],
    indexes: [
      { columns: ["deliveryId"], purpose: "замечания поставки" },
      { columns: ["status", "createdAt"], purpose: "открытые замечания на дашборде" },
    ],
  },
  {
    id: col.id(),
    deliveryId: col.ref("deliveries", "cascade"),
    projectId: col.ref("projects", "restrict"),
    lineId: col.ref("delivery_lines", "cascade", { nullable: true }),
    kind: col.enum(remarkKind),
    text: col.text(),
    createdAt: col.timestamp(),
    createdBy: col.ref("employees", "restrict"),
    status: col.enum(pgEnum("delivery_remark_status", ["open", "resolved"], "Состояние замечания")),
    resolvedAt: col.timestamp({ nullable: true }),
    resolvedBy: col.ref("employees", "restrict", { nullable: true }),
    resolution: col.text({ nullable: true, comment: "чем закрыто: допоставка, скидка, возврат" }),
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

/** Строка поставки для экрана: наименование и единица — из строки запроса */
export const deliveryItem = z.object({
  id: idSchema,
  requestLineId: idSchema,
  materialId: idSchema.nullable(),
  name: z.string(),
  qty: z.number(),
  unit: z.string(),
  price: z.number().int().nullable(),
  acceptedQty: z.number().nullable(),
  remark: z.string().nullable(),
});

export const delivery = deliveries.extend({
  items: z.array(deliveryItem),
});

/** Карточка поставки: движение, акт, фото, замечания, связи с запросом и решением */
export const deliveryCard = z.object({
  delivery,
  requestNumber: z.string(),
  statusChanges: z.array(deliveryStatusChanges),
  acceptance: deliveryAcceptances.nullable(),
  photos: z.array(deliveryPhotos),
  remarks: z.array(deliveryRemarks),
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
export type DeliveryItem = z.infer<typeof deliveryItem>;
export type DeliveryStatus = z.infer<typeof deliveryStatus.schema>;
export type DeliveryStatusChange = z.infer<typeof deliveryStatusChanges>;
export type DeliveryAcceptance = z.infer<typeof deliveryAcceptances>;
export type DeliveryPhoto = z.infer<typeof deliveryPhotos>;
export type DeliveryRemark = z.infer<typeof deliveryRemarks>;
export type ChecklistResult = z.infer<typeof checklistResult>;
export type DeliveryCard = z.infer<typeof deliveryCard>;
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

export const deliveryStatusLabel: Record<DeliveryStatus, string> = {
  expected: "Ожидается",
  shipped: "Отгружена",
  in_transit: "В пути",
  arrived: "Прибыла",
  accepted: "Принята",
  accepted_with_remarks: "Принята с замечаниями",
  rejected: "Отклонена",
};

export const remarkKindLabel: Record<DeliveryRemark["kind"], string> = {
  shortage: "Недостача",
  surplus: "Излишек",
  checklist: "Входной контроль",
  rejected: "Поставка отклонена",
};

export const decisionKindLabel: Record<ProjectDecision["kind"], string> = {
  supplier: "Выбор поставщика",
  replacement: "Замена материала",
  quantity: "Изменение количества",
};
