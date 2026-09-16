/**
 * neeklo FieldOps — объектное ядро.
 * Слой 1: общая модель данных для всех отраслевых пакетов.
 */

export type IndustryPack = "facade" | "road" | "hvac" | "crane";

export type RoleId = "owner" | "pm" | "foreman" | "pto" | "supply" | "finance" | "mechanic";

export interface Tenant {
  id: string;
  name: string;
  pack: IndustryPack;
  timezone: string;
}

export interface User {
  id: string;
  name: string;
  role: RoleId;
  roleLabel: string;
  siteIds: string[];
  telegram: string | null;
  status: "active" | "invited" | "blocked";
  lastActiveAt: string;
}

/* ---------- Объект ---------- */

export type SiteStatus = "active" | "risk" | "paused" | "done";

export interface Site {
  id: string;
  name: string;
  address: string;
  client: string;
  contractNo: string;
  contractSum: number;
  deadline: string;
  managerId: string;
  status: SiteStatus;
  progress: number;
  areaPlan: number;
  areaFact: number;
}

export interface Zone {
  id: string;
  siteId: string;
  parentId: string | null;
  /** объект → корпус → секция → этаж → захватка */
  level: "site" | "building" | "section" | "floor" | "zone";
  name: string;
  progress: number;
}

export interface WorkItem {
  id: string;
  siteId: string;
  zoneId: string;
  name: string;
  unit: string;
  plan: number;
  fact: number;
  /** отклонение в единицах измерения */
  deviation: number;
}

export interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  need: number;
  ordered: number;
  delivered: number;
  stock: number;
}

export type DocumentType =
  | "contract"
  | "annex"
  | "design"
  | "survey"
  | "act"
  | "ks2"
  | "ks3"
  | "certificate"
  | "checklist"
  | "letter";

export interface DocumentRecord {
  id: string;
  name: string;
  type: DocumentType;
  siteId: string;
  authorId: string;
  createdAt: string;
  status: ProcessingStatus;
  version: number;
  sizeKb: number;
  sourceEventId?: string;
}

export type TaskStatus = "open" | "in_progress" | "review" | "done" | "overdue";
export type TaskOrigin = "manual" | "contract" | "report_issue" | "agent";

export interface TaskRecord {
  id: string;
  title: string;
  siteId: string;
  zoneId?: string;
  assigneeId: string;
  status: TaskStatus;
  dueDate: string;
  origin: TaskOrigin;
  sourceEventId?: string;
  sourceLabel?: string;
  priority: "low" | "normal" | "high" | "critical";
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  actorType: "user" | "agent";
  action: string;
  target: string;
  details: string;
}

/* ---------- Оборудование (crane / hvac) ---------- */

export interface Asset {
  id: string;
  type: string;
  serial: string;
  siteId: string;
  lastService: string;
  nextService: string;
  openIssues: number;
}

/* ---------- Событие: центральная сущность ---------- */

export type EventChannel = "telegram" | "email" | "upload" | "web" | "telephony";

export type EventType =
  "field_report" | "supplier_reply" | "contract" | "checklist" | "invoice" | "other";

export type ProcessingStatus =
  "received" | "recognizing" | "extracted" | "review" | "confirmed" | "rejected";

export interface ExtractedField {
  id: string;
  label: string;
  value: string;
  confidence: number;
  quote: string;
  /** страница / таймкод / координаты в оригинале */
  location: string;
  confirmed?: boolean;
  edited?: boolean;
}

export interface EventOriginal {
  kind: "text" | "audio" | "photo" | "file";
  text?: string;
  transcript?: string;
  durationSec?: number;
  photos?: { id: string; caption: string }[];
  fileName?: string;
  pages?: number;
}

export interface ProcessingLogEntry {
  at: string;
  agentId: string;
  model: string;
  tokens: number;
  result: string;
}

export interface FieldEvent {
  id: string;
  channel: EventChannel;
  authorId: string;
  authorName: string;
  at: string;
  siteId: string | null;
  type: EventType;
  status: ProcessingStatus;
  preview: string;
  original: EventOriginal;
  fields: ExtractedField[];
  confidence: number;
  linkedRecord?: {
    kind: "work" | "request" | "issue" | "document" | "delivery";
    id: string;
    label: string;
  };
  log: ProcessingLogEntry[];
}

/* ---------- Снабжение ---------- */

export interface PurchaseRequest {
  id: string;
  siteId: string;
  zoneId?: string;
  items: { materialId: string; name: string; qty: number; unit: string }[];
  sentTo: string[];
  repliesCount: number;
  bestPrice: number | null;
  leadTimeDays: number | null;
  status: "draft" | "sent" | "collecting" | "compared" | "ordered";
  createdAt: string;
}

export interface Quote {
  id: string;
  requestId: string;
  supplierId: string;
  prices: Record<string, number>;
  leadTimeDays: number;
  total: number;
  sourceEventId: string;
  confidence: number;
}

export interface Supplier {
  id: string;
  name: string;
  categories: string[];
  contact: string;
  email: string;
  avgReplyHours: number;
  avgLeadDays: number;
  requestsCount: number;
  rating: number;
}

export interface Delivery {
  id: string;
  requestId: string;
  siteId: string;
  supplierId: string;
  expectedAt: string;
  receivedAt: string | null;
  status: "expected" | "in_transit" | "received" | "rejected";
  items: string;
}

/* ---------- Риски ---------- */

export type RiskKind =
  | "deadline"
  | "material"
  | "overspend"
  | "unclosed_volume"
  | "open_issue"
  | "document"
  | "reporting";

export interface Risk {
  id: string;
  kind: RiskKind;
  severity: "critical" | "high" | "medium";
  siteId: string;
  risk: string;
  cause: string;
  action: string;
  ownerId: string;
  dueDate: string;
  sourceEventId?: string;
  sourceLabel: string;
}

/* ---------- Агенты ---------- */

export interface Agent {
  id: string;
  name: string;
  purpose: string;
  status: "active" | "paused";
  model: string;
  prompt: string;
  tools: string[];
  confidenceThreshold: number;
  boundaries: string[];
  runsWeek: number;
  accuracy: number;
  avgCost: number;
  manualFixShare: number;
}

export interface AgentRun {
  id: string;
  at: string;
  agentId: string;
  target: string;
  siteId: string | null;
  durationMs: number;
  success: boolean;
  confidence: number;
  tokens: number;
  cost: number;
  input: string;
  steps: string[];
  tools: string[];
  output: string;
  humanConfirmed: string;
  failReason?: string;
}
