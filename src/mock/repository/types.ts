/**
 * neeklo FieldOps — типы централизованного репозитория демо-данных.
 * Одна сущность описывается здесь ровно один раз.
 */

export type Id = string;

/* ---------- Происхождение ---------- */

export type SourceKind = "telegram" | "email" | "upload" | "call" | "manual";

/** Первоисточник: сообщение, письмо, файл, страница договора. */
export interface Source {
  id: Id;
  kind: SourceKind;
  title: string;
  /** Кто или что породило источник */
  author: string;
  receivedAt: string;
  projectId: Id | null;
  /** Ссылка внутри источника: страница, таймкод, абзац */
  location: string;
  excerpt: string;
}

export type ConfidenceBand = "verified" | "clarify" | "check";

/** Извлечённое из источника поле. */
export interface Extraction {
  id: Id;
  sourceId: Id;
  eventId: Id | null;
  label: string;
  value: string;
  /** 0…1, в интерфейсе показывается словами */
  confidence: number;
  quote: string;
  location: string;
  /** Куда легло значение после подтверждения */
  appliedTo: { entity: string; id: Id } | null;
}

/** Подтверждение человеком: прежнее значение, новое, кто и когда. */
export interface Approval {
  id: Id;
  extractionId: Id | null;
  entity: string;
  entityId: Id;
  field: string;
  previousValue: string | null;
  newValue: string;
  approvedBy: Id;
  approvedAt: string;
  decision: "accepted" | "corrected" | "rejected";
  comment?: string;
}

export interface AuditLog {
  id: Id;
  at: string;
  actorId: Id;
  actorKind: "user" | "agent";
  action: string;
  entity: string;
  entityId: Id;
  sourceId: Id | null;
  details: string;
}

/* ---------- Входящий поток ---------- */

export type IncomingStatus = "received" | "recognizing" | "extracted" | "review" | "applied" | "rejected";

export interface IncomingEvent {
  id: Id;
  sourceId: Id;
  projectId: Id | null;
  authorId: Id;
  receivedAt: string;
  kind: "field_report" | "supplier_offer" | "document" | "question" | "other";
  status: IncomingStatus;
  preview: string;
  confidence: number;
  extractionIds: Id[];
  /** Что изменилось в системе после подтверждения */
  appliedTo: { entity: string; id: Id; label: string } | null;
}

/* ---------- Организация ---------- */

export type CounterpartyRole = "customer" | "supplier" | "subcontractor";

export interface Counterparty {
  id: Id;
  name: string;
  role: CounterpartyRole;
  inn: string;
  contactName: string;
  email: string;
  phone: string;
  /** Средний срок ответа, ч */
  avgReplyHours: number;
  rating: number;
}

export interface Employee {
  id: Id;
  name: string;
  position: string;
  role: "manager" | "foreman" | "pto" | "supply" | "finance" | "worker";
  phone: string;
  telegram: string | null;
  projectIds: Id[];
  status: "active" | "vacation" | "blocked";
}

export interface Crew {
  id: Id;
  name: string;
  projectId: Id;
  foremanId: Id;
  memberIds: Id[];
  headcount: number;
  specialization: string;
}

/* ---------- Договор ---------- */

export interface Contract {
  id: Id;
  number: string;
  projectId: Id;
  customerId: Id;
  signedAt: string;
  startDate: string;
  endDate: string;
  amount: number;
  /** Аванс, ₽ */
  advance: number;
  /** Гарантийное удержание, % */
  retentionPct: number;
  paymentTermDays: number;
  status: "draft" | "active" | "closed";
  sourceId: Id | null;
}

export interface Milestone {
  id: Id;
  contractId: Id;
  projectId: Id;
  name: string;
  dueDate: string;
  /** Требуемый объём или сумма к этой дате */
  requirement: string;
  status: "planned" | "at_risk" | "done" | "overdue";
  sourceId: Id | null;
  location: string;
}

/* ---------- Объект и работы ---------- */

export type ProjectStatus = "active" | "at_risk" | "paused" | "done";

export interface WorkZone {
  id: Id;
  projectId: Id;
  parentId: Id | null;
  level: "building" | "section" | "floor" | "zone";
  name: string;
  /** Оси, если применимо */
  axes: string | null;
  floors: string | null;
  planQty: number;
  factQty: number;
  unit: string;
}

export interface WorkType {
  id: Id;
  name: string;
  unit: string;
  /** Договорная расценка, ₽ за единицу */
  rate: number;
}

export interface WorkItem {
  id: Id;
  projectId: Id;
  zoneId: Id;
  workTypeId: Id;
  name: string;
  unit: string;
  planQty: number;
  factQty: number;
  rate: number;
}

/** Запись объёма: смена, партия или акт. */
export interface VolumeEntry {
  id: Id;
  projectId: Id;
  zoneId: Id;
  workItemId: Id;
  date: string;
  qty: number;
  unit: string;
  rate: number;
  /** qty × rate, округление до рубля */
  amount: number;
  /** Принят заказчиком (входит в approvedAmount) */
  approved: boolean;
  /** Закрыт актом КС-2 (входит в closedAmount) */
  closed: boolean;
  actNumber: string | null;
  crewId: Id | null;
  sourceId: Id | null;
  reportId: Id | null;
}

export interface ScheduleItem {
  id: Id;
  projectId: Id;
  zoneId: Id | null;
  name: string;
  startDate: string;
  endDate: string;
  /** 0…100 */
  progress: number;
  dependsOn: Id[];
  crewId: Id | null;
  critical: boolean;
}

export interface Project {
  id: Id;
  name: string;
  code: string;
  customer: string;
  contract: string;
  startDate: string;
  endDate: string;
  /** 0…100 */
  plannedProgress: number;
  actualProgress: number;
  contractAmount: number;
  performedAmount: number;
  approvedAmount: number;
  closedAmount: number;
  paidAmount: number;
  /** Незакрытый объём в натуральных единицах, м² */
  unclosedAmount: number;
  /** Стоимость незакрытого объёма, ₽ */
  unclosedValue: number;
  status: ProjectStatus;
  manager: Id;
  teams: Id[];
  workZones: Id[];
}

/** Сводка объекта для реестра и карточки: ответ GET /projects/:id/overview. */
export interface ProjectOverview {
  projectId: Id;
  region: string;
  stage: string;
  /** Актуальная ревизия проектной документации */
  docVersion: string;
  /** Позиций материалов в спецификации */
  specTotal: number;
  /** Позиций, которые ещё не подтвердил человек */
  specUnverified: number;
  /** Позиций, по которым отправлены запросы поставщикам */
  inRequests: number;
  /** Позиций, по которым получены предложения */
  offersReceived: number;
  ordered: number;
  inTransit: number;
  delivered: number;
  activeRequests: number;
  /** Запросов, по которым поставщик не ответил в срок */
  overdueRequests: number;
  /** Изменений документации, которые никто не разобрал */
  openChanges: number;
  /** Смен без отчёта с площадки за последнюю неделю */
  missingReports: number;
}

/** Загруженная ревизия проектной документации. */
export interface DocVersionRecord {
  id: Id;
  projectId: Id;
  version: string;
  uploadedAt: string;
  uploadedBy: Id;
  sheets: number;
  /** Позиций извлечено из документации */
  extracted: number;
  /** Позиций подтверждено человеком */
  verified: number;
  sourceId: Id | null;
  documentId: Id | null;
}

export type ActivityKind =
  | "version_uploaded"
  | "spec_extracted"
  | "qty_corrected"
  | "request_sent"
  | "offer_received"
  | "replacement_agreed"
  | "report_added";

/** Событие в ленте объекта. */
export interface ActivityItem {
  id: Id;
  projectId: Id;
  at: string;
  kind: ActivityKind;
  title: string;
  actorId: Id;
  sourceId: Id | null;
}

/* ---------- Снабжение ---------- */

export interface Material {
  id: Id;
  name: string;
  category: string;
  unit: string;
  need: number;
  ordered: number;
  delivered: number;
  stock: number;
}

/** Позиция спецификации, извлечённая из проектной документации. */
export interface SpecItem {
  id: Id;
  projectId: Id;
  documentId: Id;
  sourceId: Id;
  /** Страница документации, откуда взята позиция */
  page: number;
  section: string;
  /** Номер позиции в таблице документации */
  position: string;
  name: string;
  materialId: Id | null;
  unit: string;
  qty: number;
  confidence: number;
  approvedBy: Id | null;
  approvedAt: string | null;
  note: string | null;
}

export interface SupplyRequest {
  id: Id;
  number: string;
  projectId: Id;
  zoneId: Id | null;
  createdAt: string;
  authorId: Id;
  items: { materialId: Id; name: string; qty: number; unit: string }[];
  sentTo: Id[];
  status: "draft" | "sent" | "collecting" | "compared" | "ordered";
  sourceId: Id | null;
}

export interface SupplierOffer {
  id: Id;
  requestId: Id;
  supplierId: Id;
  receivedAt: string;
  prices: { materialId: Id; price: number }[];
  total: number;
  leadTimeDays: number;
  confidence: number;
  sourceId: Id | null;
  best: boolean;
}

export interface Delivery {
  id: Id;
  requestId: Id;
  projectId: Id;
  supplierId: Id;
  expectedAt: string;
  receivedAt: string | null;
  status: "expected" | "in_transit" | "received" | "rejected";
  items: { materialId: Id; name: string; qty: number; unit: string }[];
  sourceId: Id | null;
}

/* ---------- Поле ---------- */

export interface Evidence {
  id: Id;
  reportId: Id;
  kind: "photo" | "audio" | "file";
  caption: string;
  takenAt: string;
  /** Таймкод, страница или координаты */
  location: string;
}

export interface FieldReport {
  id: Id;
  projectId: Id;
  zoneId: Id;
  authorId: Id;
  crewId: Id | null;
  date: string;
  status: "review" | "accepted" | "returned";
  summary: string;
  /** Заявленный бригадой объём */
  declaredQty: number;
  unit: string;
  /** Принятый после проверки объём */
  acceptedQty: number | null;
  headcount: number;
  evidenceIds: Id[];
  sourceId: Id;
  eventId: Id | null;
}

/* ---------- Документы, задачи, риски ---------- */

export type DocumentKind =
  | "contract"
  | "annex"
  | "design"
  | "act_ks2"
  | "act_ks3"
  | "certificate"
  | "checklist"
  | "letter";

export interface DocumentRecord {
  id: Id;
  name: string;
  kind: DocumentKind;
  projectId: Id;
  authorId: Id;
  createdAt: string;
  status: "processing" | "review" | "confirmed" | "rejected";
  version: number;
  pages: number;
  sizeKb: number;
  sourceId: Id | null;
}

export interface Task {
  id: Id;
  title: string;
  projectId: Id;
  zoneId: Id | null;
  assigneeId: Id;
  status: "open" | "in_progress" | "review" | "done" | "overdue";
  dueDate: string;
  priority: "low" | "normal" | "high" | "critical";
  origin: "manual" | "contract" | "report" | "supply" | "agent";
  sourceId: Id | null;
  sourceLabel: string;
}

export type RiskKind =
  | "deadline"
  | "material"
  | "overspend"
  | "unclosed_volume"
  | "quality"
  | "document";

export interface Risk {
  id: Id;
  kind: RiskKind;
  severity: "critical" | "high" | "medium";
  projectId: Id;
  zoneId: Id | null;
  title: string;
  cause: string;
  action: string;
  ownerId: Id;
  dueDate: string;
  /** Денежная оценка последствия, ₽ */
  impactValue: number | null;
  sourceId: Id | null;
  sourceLabel: string;
}
