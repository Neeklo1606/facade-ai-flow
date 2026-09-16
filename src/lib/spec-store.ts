import { useSyncExternalStore } from "react";
import {
  counterpartyById,
  counterpartyName,
  emailTemplates,
  extractedPositions,
  fieldReports,
  offerLines,
  offerTerms,
  positionChanges,
  projectDecisions,
  projectDocuments,
  projectOverviews,
  projects,
  rfqMeta,
  simulatedPositions,
  sources,
  supplierOffers,
  supplierProfiles,
  supplyRequests,
  timelineSeed,
  type ExtractedPosition,
  type FieldReport,
  type OfferLine,
  type OfferTerms,
  type PositionChange,
  type Project,
  type ProjectDecision,
  type ProjectDocument,
  type ProjectOverview,
  type RfqMeta,
  type Source,
  type SupplierOffer,
  type SupplierProfile,
  type SupplyRequest,
  type TimelineEvent,
} from "@/mock/repository";
import { simulateReply } from "@/lib/demo-simulator";
import { MOCK_NOW } from "@/lib/format";
import { toast } from "@/lib/toast";

/**
 * Клиентское состояние цепочки «документ → позиции → закупка».
 * Стартует с моков репозитория; экраны читают только отсюда, чтобы решение
 * на экране извлечения сразу было видно в материалах, карточке и реестре.
 * Потом этот слой заменяется запросами к API без изменения экранов.
 */

export interface UploadProgress {
  /** Индекс пройденной стадии обработки, 0…4 */
  stage: number;
  /** Когда начата обработка, мс — чтобы продолжить стадии после перезагрузки */
  startedAt: number;
}

/** Ответ поставщика, который симулятор пришлёт позже. */
export interface PendingReply {
  requestId: string;
  supplierId: string;
  dueAt: number;
}

export interface SpecState {
  version: number;
  projects: Project[];
  overviews: ProjectOverview[];
  documents: ProjectDocument[];
  positions: ExtractedPosition[];
  changes: PositionChange[];
  uploads: Record<string, UploadProgress>;
  requests: SupplyRequest[];
  /** Документы, чьи проверенные позиции переданы в закупку, и когда */
  sentDocuments: Record<string, string>;
  rfq: RfqMeta[];
  offers: SupplierOffer[];
  offerLines: OfferLine[];
  offerTerms: OfferTerms[];
  sources: Source[];
  pendingReplies: PendingReply[];
  decisions: ProjectDecision[];
  reports: FieldReport[];
  profiles: SupplierProfile[];
}

const ACTOR = "e-sokolov";
const STORAGE_KEY = "neeklo-fieldops-demo";
const CLOCK_KEY = "neeklo-fieldops-demo-clock";
/** Меняется при несовместимом изменении формы состояния: старое сохранение тогда игнорируется. */
const STATE_VERSION = 2;

function createSeed(): SpecState {
  return {
    version: STATE_VERSION,
    projects,
    overviews: projectOverviews,
    documents: projectDocuments,
    positions: extractedPositions,
    changes: positionChanges,
    uploads: {},
    requests: supplyRequests,
    sentDocuments: {},
    rfq: rfqMeta,
    offers: supplierOffers,
    offerLines,
    offerTerms,
    sources,
    pendingReplies: [],
    decisions: projectDecisions,
    reports: fieldReports,
    profiles: supplierProfiles,
  };
}

/** Состояние, с которым рендерится сервер: гидратация идёт от него, а не от сохранения во вкладке. */
const seedState = createSeed();
let state: SpecState = seedState;

const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  saveTimer = null;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Хранилище вкладки недоступно или переполнено — демо продолжит работать до перезагрузки
  }
}

function set(next: (prev: SpecState) => SpecState) {
  state = next(state);
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined" && !saveTimer) saveTimer = setTimeout(persist, 300);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;
const getServerSnapshot = () => seedState;

/** Текущее состояние вне React — для действий и проверок. */
export const getSpecState = getSnapshot;

export function useSpecStore<T>(selector: (s: SpecState) => T): T {
  return selector(useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot));
}

const noopSubscribe = () => () => {};
/** true после гидратации: до неё экран видит только серверное состояние без сохранённых действий. */
export function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/* ---------- Отложенные процессы: стадии загрузки и ответы поставщиков ---------- */

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function schedule(key: string, dueAt: number, run: () => void) {
  if (typeof window === "undefined" || timers.has(key)) return;
  timers.set(
    key,
    setTimeout(
      () => {
        timers.delete(key);
        run();
      },
      Math.max(0, dueAt - Date.now()),
    ),
  );
}

const UPLOAD_STAGE_MS = 1400;
const uploadStatusByStage: ProjectDocument["status"][] = [
  "uploaded",
  "recognizing",
  "recognizing",
  "extracted",
  "review",
];

function scheduleUpload(id: string) {
  const upload = state.uploads[id];
  if (!upload || upload.stage >= 4) return;
  const stage = upload.stage + 1;
  schedule(`upload:${id}:${stage}`, upload.startedAt + stage * UPLOAD_STAGE_MS, () => {
    const doc = state.documents.find((item) => item.id === id);
    if (!doc) return;
    set((prev) => ({
      ...prev,
      uploads: { ...prev.uploads, [id]: { ...prev.uploads[id]!, stage } },
      documents: prev.documents.map((item) =>
        item.id === id ? { ...item, status: uploadStatusByStage[stage]! } : item,
      ),
      positions:
        stage === 3 && !prev.positions.some((item) => item.documentId === id)
          ? [...prev.positions, ...simulatedPositions(id, doc.projectId, 36)]
          : prev.positions,
    }));
    scheduleUpload(id);
  });
}

function deliverReply(requestId: string, supplierId: string) {
  const request = state.requests.find((item) => item.id === requestId);
  const profile = state.profiles.find((item) => item.supplierId === supplierId);
  const alreadyAnswered = state.offers.some(
    (item) => item.requestId === requestId && item.supplierId === supplierId,
  );
  const dropPending = (list: PendingReply[]) =>
    list.filter((item) => !(item.requestId === requestId && item.supplierId === supplierId));
  if (!request || !profile || alreadyAnswered) {
    set((prev) => ({ ...prev, pendingReplies: dropPending(prev.pendingReplies) }));
    return;
  }
  const supplierName = counterpartyById(supplierId)?.name ?? profile.contactName;
  const reply = simulateReply(request, profile, supplierName, now());
  set((prev) => {
    const answered = new Set(
      [...prev.offers, reply.offer]
        .filter((o) => o.requestId === requestId)
        .map((o) => o.supplierId),
    );
    return {
      ...prev,
      offers: [...prev.offers, reply.offer],
      offerLines: [...prev.offerLines, ...reply.lines],
      offerTerms: [...prev.offerTerms, reply.terms],
      sources: [...prev.sources, reply.source],
      pendingReplies: dropPending(prev.pendingReplies),
      requests: prev.requests.map((item) =>
        item.id === requestId && item.status !== "ordered"
          ? { ...item, status: answered.size >= item.sentTo.length ? "compared" : "collecting" }
          : item,
      ),
      positions: prev.positions.map((item) =>
        item.requestIds.includes(requestId) && item.purchase === "requested"
          ? { ...item, purchase: "offers" }
          : item,
      ),
    };
  });
  toast.success(`Пришло предложение «${supplierName}»`, {
    description: `Запрос ${request.number}: цены и сроки добавлены в сравнение.`,
  });
}

function scheduleReplies(
  requestId: string,
  supplierIds: string[],
  firstDelayMs: number,
  stepMs: number,
) {
  const base = Date.now();
  const planned: PendingReply[] = supplierIds.map((supplierId, index) => ({
    requestId,
    supplierId,
    dueAt: base + firstDelayMs + index * stepMs,
  }));
  set((prev) => ({ ...prev, pendingReplies: [...prev.pendingReplies, ...planned] }));
  for (const reply of planned) {
    schedule(`reply:${reply.requestId}:${reply.supplierId}`, reply.dueAt, () =>
      deliverReply(reply.requestId, reply.supplierId),
    );
  }
}

/** После перезагрузки: поднять сохранённое демо и продолжить незавершённые процессы. */
function restore() {
  try {
    const clock = Number(sessionStorage.getItem(CLOCK_KEY));
    if (clock > 0) clockStartedAt = clock;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SpecState;
      if (parsed.version === STATE_VERSION) state = parsed;
    }
  } catch {
    state = seedState;
  }
  Object.keys(state.uploads).forEach(scheduleUpload);
  for (const reply of state.pendingReplies) {
    schedule(`reply:${reply.requestId}:${reply.supplierId}`, reply.dueAt, () =>
      deliverReply(reply.requestId, reply.supplierId),
    );
  }
  window.addEventListener("pagehide", () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      persist();
    }
  });
}

/**
 * Часы демо: идут от «сегодня» моков (MOCK_NOW) с момента первого действия в сессии.
 * Иначе новые записи получали бы реальную дату и спорили со сроками и историей в моках.
 */
let clockStartedAt: number | null = null;

function demoTime() {
  if (clockStartedAt === null) {
    clockStartedAt = Date.now();
    try {
      sessionStorage.setItem(CLOCK_KEY, String(clockStartedAt));
    } catch {
      // без хранилища часы начнутся заново после перезагрузки
    }
  }
  return new Date(new Date(MOCK_NOW).getTime() + (Date.now() - clockStartedAt));
}

function localIso(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

/** Локальное время демо без часового пояса — в том же формате, что даты в моках. */
function now() {
  return localIso(demoTime());
}

let changeSeq = 0;
function change(
  positionId: string,
  action: string,
  before: string | null = null,
  after: string | null = null,
): PositionChange {
  changeSeq += 1;
  return {
    id: `pc-live-${changeSeq}`,
    positionId,
    at: now(),
    actorId: ACTOR,
    action,
    before,
    after,
  };
}

function patchPositions(
  ids: Set<string>,
  patch: (item: ExtractedPosition) => ExtractedPosition,
  changes: PositionChange[],
) {
  set((prev) => ({
    ...prev,
    positions: prev.positions.map((item) => (ids.has(item.id) ? patch(item) : item)),
    changes: [...prev.changes, ...changes],
  }));
}

/* ---------- Решения по позициям ---------- */

export function isActive(item: ExtractedPosition) {
  return item.review !== "excluded" && item.review !== "merged" && item.review !== "header";
}

export function isVerified(item: ExtractedPosition) {
  return item.review === "confirmed" || item.review === "corrected";
}

/** По позиции можно запросить цены: проверена, передана в закупку и ещё не в работе. */
export function isReadyForRequest(item: ExtractedPosition) {
  return isVerified(item) && item.handedOver && item.purchase === "none";
}

export const specActions = {
  confirm(ids: string[]) {
    const targets = new Set(ids);
    const snapshot = state.positions.filter(
      (item) => targets.has(item.id) && item.review === "pending",
    );
    const at = now();
    patchPositions(
      new Set(snapshot.map((item) => item.id)),
      (item) => ({ ...item, review: "confirmed", reviewedBy: ACTOR, reviewedAt: at }),
      snapshot.map((item) => change(item.id, "Подтверждено")),
    );
    return snapshot.map((item) => item.id);
  },

  correct(
    id: string,
    patch: Pick<ExtractedPosition, "projectName" | "qty" | "unit" | "characteristics">,
  ) {
    const item = state.positions.find((p) => p.id === id);
    if (!item) return;
    const changes: PositionChange[] = [];
    if (item.qty !== patch.qty || item.unit !== patch.unit) {
      changes.push(
        change(
          id,
          "Исправлено количество",
          `${item.qty} ${item.unit}`,
          `${patch.qty} ${patch.unit}`,
        ),
      );
    }
    if (item.projectName !== patch.projectName) {
      changes.push(change(id, "Исправлено наименование", item.projectName, patch.projectName));
    }
    const chars = (list: ExtractedPosition["characteristics"]) =>
      list.map((c) => `${c.label}: ${c.value}`).join("; ");
    if (chars(item.characteristics) !== chars(patch.characteristics)) {
      changes.push(
        change(
          id,
          "Исправлены характеристики",
          chars(item.characteristics) || "—",
          chars(patch.characteristics) || "—",
        ),
      );
    }
    patchPositions(
      new Set([id]),
      (p) => ({
        ...p,
        ...patch,
        review: "corrected",
        reviewedBy: ACTOR,
        reviewedAt: now(),
        confidence: Math.max(p.confidence, 0.85),
      }),
      changes.length ? changes : [change(id, "Подтверждено с правкой")],
    );
  },

  exclude(id: string) {
    patchPositions(
      new Set([id]),
      (p) => ({ ...p, review: "excluded", reviewedBy: ACTOR, reviewedAt: now() }),
      [change(id, "Исключено из спецификации")],
    );
  },

  markHeader(id: string) {
    patchPositions(
      new Set([id]),
      (p) => ({ ...p, review: "header", reviewedBy: ACTOR, reviewedAt: now() }),
      [change(id, "Отмечено как заголовок раздела")],
    );
  },

  /** Вернуть исключённую, объединённую или заголовок обратно на проверку. */
  reopen(id: string) {
    const item = state.positions.find((p) => p.id === id);
    if (!item) return;
    patchPositions(
      new Set([id]),
      (p) => ({ ...p, review: "pending", reviewedBy: null, reviewedAt: null, mergedInto: null }),
      [change(id, "Возвращено на проверку")],
    );
  },

  /** Вернуть позицию к исходному состоянию — для «Отменить» в уведомлении. */
  restore(items: ExtractedPosition[]) {
    const byId = new Map(items.map((item) => [item.id, item]));
    set((prev) => ({
      ...prev,
      positions: prev.positions.map((item) => byId.get(item.id) ?? item),
    }));
  },

  merge(sourceId: string, targetId: string) {
    const source = state.positions.find((p) => p.id === sourceId);
    const target = state.positions.find((p) => p.id === targetId);
    if (!source || !target) return false;
    const sameUnit = source.unit === target.unit;
    set((prev) => ({
      ...prev,
      positions: prev.positions.map((item) => {
        if (item.id === sourceId)
          return {
            ...item,
            review: "merged",
            mergedInto: targetId,
            reviewedBy: ACTOR,
            reviewedAt: now(),
          };
        if (item.id === targetId && sameUnit) return { ...item, qty: item.qty + source.qty };
        return item;
      }),
      changes: [
        ...prev.changes,
        change(sourceId, `Объединено с поз. ${target.position}`),
        change(
          targetId,
          `Присоединена поз. ${source.position}`,
          `${target.qty} ${target.unit}`,
          sameUnit ? `${target.qty + source.qty} ${target.unit}` : `${target.qty} ${target.unit}`,
        ),
      ],
    }));
    return sameUnit;
  },

  split(id: string, firstQty: number) {
    const item = state.positions.find((p) => p.id === id);
    if (!item || firstQty <= 0 || firstQty >= item.qty) return;
    const secondQty = item.qty - firstQty;
    const copy: ExtractedPosition = {
      ...item,
      id: `${item.id}-split`,
      position: `${item.position}.2`,
      qty: secondQty,
      review: "pending",
      reviewedBy: null,
      reviewedAt: null,
      purchase: "none",
      requestIds: [],
    };
    set((prev) => {
      const index = prev.positions.findIndex((p) => p.id === id);
      const positions = [...prev.positions];
      positions[index] = { ...item, position: `${item.position}.1`, qty: firstQty };
      positions.splice(index + 1, 0, copy);
      return {
        ...prev,
        positions,
        changes: [
          ...prev.changes,
          change(
            id,
            "Разделена на две позиции",
            `${item.qty} ${item.unit}`,
            `${firstQty} + ${secondQty} ${item.unit}`,
          ),
        ],
      };
    });
  },

  /** Передать проверенные позиции документа в закупку: после этого по ним можно запрашивать цены. */
  sendToProcurement(documentId: string) {
    const targets = state.positions.filter(
      (item) => item.documentId === documentId && isVerified(item) && !item.handedOver,
    );
    const ids = new Set(targets.map((item) => item.id));
    set((prev) => ({
      ...prev,
      sentDocuments: { ...prev.sentDocuments, [documentId]: now() },
      positions: prev.positions.map((item) =>
        ids.has(item.id) ? { ...item, handedOver: true } : item,
      ),
      changes: [...prev.changes, ...targets.map((item) => change(item.id, "Передано в закупку"))],
    }));
    return targets.length;
  },

  /* ---------- Объекты ---------- */

  createProject(input: {
    name: string;
    code: string;
    region: string;
    customer: string;
    contract: string;
    startDate: string;
    endDate: string;
    manager: string;
  }) {
    const id = `p-live-${Date.now()}`;
    const project: Project = {
      id,
      name: input.name,
      code: input.code,
      customer: input.customer,
      contract: input.contract || "—",
      startDate: input.startDate,
      endDate: input.endDate,
      plannedProgress: 0,
      actualProgress: 0,
      contractAmount: 0,
      performedAmount: 0,
      approvedAmount: 0,
      closedAmount: 0,
      paidAmount: 0,
      unclosedAmount: 0,
      unclosedValue: 0,
      status: "active",
      manager: input.manager,
      teams: [],
      workZones: [],
    };
    const overview: ProjectOverview = {
      projectId: id,
      region: input.region,
      stage: "Подготовка: нет документации",
      docVersion: "—",
      specTotal: 0,
      specUnverified: 0,
      inRequests: 0,
      offersReceived: 0,
      ordered: 0,
      inTransit: 0,
      delivered: 0,
      activeRequests: 0,
      overdueRequests: 0,
      openChanges: 0,
      missingReports: 0,
    };
    set((prev) => ({
      ...prev,
      projects: [project, ...prev.projects],
      overviews: [overview, ...prev.overviews],
    }));
    return id;
  },

  /* ---------- Закупка ---------- */

  createRequest(
    projectId: string,
    ids: string[],
    supplierIds: string[],
    options: { templateId?: string; replyDueAt?: string } = {},
  ) {
    const wanted = new Set(ids);
    const targets = state.positions.filter(
      (item) => wanted.has(item.id) && isReadyForRequest(item),
    );
    if (!targets.length) return null;
    const number = `З-2026/${326 + state.requests.filter((r) => r.id.startsWith("sr-live")).length}`;
    const createdAt = now();

    // Одинаковые материалы из разных строк спецификации уходят поставщику одной строкой с суммой
    // Строка без нормализации берёт справочное наименование у позиции с тем же проектным названием,
    // иначе один материал ушёл бы поставщику двумя строками под разными именами
    const baseName = (item: ExtractedPosition) => item.projectName.split(",")[0]!.trim();
    const dictionary = new Map<string, string>();
    for (const item of state.positions) {
      if (item.projectId === projectId && item.normalizedName) {
        dictionary.set(`${item.family}:${baseName(item)}`, item.normalizedName);
      }
    }
    const items = new Map<string, SupplyRequest["items"][number]>();
    for (const item of targets) {
      const name =
        item.normalizedName ?? dictionary.get(`${item.family}:${baseName(item)}`) ?? baseName(item);
      const key = `${item.family}:${name}:${item.unit}`;
      const existing = items.get(key);
      if (existing) existing.qty += item.qty;
      else items.set(key, { materialId: key, name, qty: item.qty, unit: item.unit });
    }

    const request: SupplyRequest = {
      id: `sr-live-${Date.now()}`,
      number,
      projectId,
      zoneId: null,
      createdAt,
      authorId: ACTOR,
      items: [...items.values()],
      sentTo: supplierIds,
      status: "sent",
      sourceId: null,
    };
    const due =
      options.replyDueAt ??
      localIso(new Date(demoTime().getTime() + 3 * 86_400_000)).slice(0, 10) + "T18:00:00";
    const targetIds = new Set(targets.map((item) => item.id));
    set((prev) => ({
      ...prev,
      requests: [request, ...prev.requests],
      rfq: [
        ...prev.rfq,
        {
          requestId: request.id,
          sentAt: createdAt,
          replyDueAt: due,
          templateId: options.templateId ?? emailTemplates[0].id,
        },
      ],
      positions: prev.positions.map((item) =>
        targetIds.has(item.id)
          ? { ...item, purchase: "requested", requestIds: [...item.requestIds, request.id] }
          : item,
      ),
      changes: [
        ...prev.changes,
        ...targets.map((item) => change(item.id, `Добавлено в запрос ${number}`)),
      ],
    }));

    // Демо: большинство поставщиков отвечает за несколько секунд, последний из трёх и более молчит —
    // так видно и сравнение, и напоминание
    const responders = supplierIds.length >= 3 ? supplierIds.slice(0, -1) : supplierIds;
    scheduleReplies(request.id, responders, 5_000, 4_000);
    return { request, count: targets.length, positions: request.items.length };
  },

  /** Напомнить молчащим поставщикам. Возвращает, скольким ушло напоминание. */
  remindSuppliers(requestId: string) {
    const request = state.requests.find((item) => item.id === requestId);
    if (!request) return 0;
    const silent = request.sentTo.filter(
      (supplierId) =>
        !state.offers.some((o) => o.requestId === requestId && o.supplierId === supplierId) &&
        !state.pendingReplies.some((p) => p.requestId === requestId && p.supplierId === supplierId),
    );
    scheduleReplies(requestId, silent, 4_000, 3_000);
    return silent.length;
  },

  /** Начать демо заново: сбросить все действия и сохранение вкладки. */
  resetDemo() {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    clockStartedAt = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(CLOCK_KEY);
    } catch {
      // нечего удалять
    }
    set(() => createSeed());
  },

  /** Зафиксировать выбор поставщика: решение уходит в историю объекта, позиции — в «Выбран поставщик». */
  recordDecision(decision: Omit<ProjectDecision, "id" | "approvedAt">) {
    const record: ProjectDecision = {
      ...decision,
      id: `dec-live-${Date.now()}`,
      approvedAt: now(),
    };
    set((prev) => ({
      ...prev,
      decisions: [record, ...prev.decisions],
      requests: prev.requests.map((r) =>
        r.id === decision.requestId ? { ...r, status: "compared" } : r,
      ),
      positions: prev.positions.map((item) =>
        decision.requestId &&
        item.requestIds.includes(decision.requestId) &&
        (item.purchase === "requested" || item.purchase === "offers")
          ? { ...item, purchase: "supplier_selected" }
          : item,
      ),
    }));
    return record;
  },

  verifyContact(supplierId: string) {
    set((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) =>
        p.supplierId === supplierId
          ? { ...p, contactStatus: "verified", contactCheckedAt: now().slice(0, 10) }
          : p,
      ),
    }));
  },

  reviewReport(id: string, status: FieldReport["status"], acceptedQty: number | null) {
    set((prev) => ({
      ...prev,
      reports: prev.reports.map((r) => (r.id === id ? { ...r, status, acceptedQty } : r)),
    }));
  },

  /* ---------- Загрузка ---------- */

  upload(projectId: string, file: { name: string; size: number }) {
    const id = `pd-live-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const ext = file.name.split(".").pop()?.toLowerCase();
    const fileType: ProjectDocument["fileType"] =
      ext === "docx" ? "docx" : ext === "xlsx" ? "xlsx" : "pdf";
    const doc: ProjectDocument = {
      id,
      projectId,
      title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
      section: /ар/i.test(file.name) ? "АР" : /км/i.test(file.name) ? "КМ" : "НВФ",
      version: "Рев. 1",
      fileName: file.name,
      fileType,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      uploadedAt: now(),
      uploadedBy: ACTOR,
      sheetCount: fileType === "xlsx" ? 1 : 1 + Math.round(file.size / 180_000) || 1,
      status: "uploaded",
      sourceId: null,
    };
    set((prev) => ({
      ...prev,
      documents: [doc, ...prev.documents],
      uploads: { ...prev.uploads, [id]: { stage: 0, startedAt: Date.now() } },
    }));
    scheduleUpload(id);
    return id;
  },
};

/* ---------- Селекторы ---------- */

export function documentStats(s: SpecState, documentId: string) {
  const items = s.positions.filter((item) => item.documentId === documentId && isActive(item));
  return {
    extracted: items.length,
    verified: items.filter(isVerified).length,
  };
}

/** Сводные цифры спецификации объекта; null — если позиций в системе нет. */
export function projectSpecStats(s: SpecState, projectId: string) {
  const items = s.positions.filter((item) => item.projectId === projectId && isActive(item));
  if (!items.length) return null;
  const verified = items.filter(isVerified);
  const count = (statuses: ExtractedPosition["purchase"][]) =>
    verified.filter((item) => statuses.includes(item.purchase)).length;
  return {
    specTotal: items.length,
    specUnverified: items.length - verified.length,
    inRequests: count(["requested", "offers", "supplier_selected", "ordered", "delivered"]),
    offersReceived: count(["offers", "supplier_selected", "ordered", "delivered"]),
    ordered: count(["ordered", "delivered"]),
    inTransit: count(["ordered"]),
    delivered: count(["delivered"]),
  };
}

export function projectOf(s: SpecState, projectId: string) {
  return s.projects.find((item) => item.id === projectId) ?? null;
}

export function sourceOf(s: SpecState, sourceId: string | null) {
  return sourceId ? (s.sources.find((item) => item.id === sourceId) ?? null) : null;
}

export function offersOf(s: SpecState, requestId: string) {
  return s.offers.filter((item) => item.requestId === requestId).sort((a, b) => a.total - b.total);
}

/** Решение по запросу, если оно уже зафиксировано. */
export function decisionForRequest(s: SpecState, requestId: string) {
  return s.decisions.find((item) => item.requestId === requestId) ?? null;
}

/** История объекта: исходные события плюс то, что произошло в этой сессии. */
export function timelineOf(s: SpecState, projectId: string): TimelineEvent[] {
  const base = timelineSeed.filter((item) => item.projectId === projectId);
  const live: TimelineEvent[] = [];
  const positionsById = new Map(s.positions.map((item) => [item.id, item]));

  for (const c of s.changes) {
    if (!c.id.startsWith("pc-live") || !c.action.startsWith("Исправлено количество")) continue;
    const item = positionsById.get(c.positionId);
    if (!item || item.projectId !== projectId) continue;
    live.push({
      id: `tl-${c.id}`,
      projectId,
      at: c.at,
      type: "qty_corrected",
      title: `Исправлено количество, поз. ${item.position}: ${c.before} → ${c.after}`,
      details: item.projectName,
      actorId: c.actorId,
      sourceId: null,
      link: {
        to: `/projects/${projectId}/documents/${item.documentId}?position=${item.id}`,
        label: `Лист ${item.sheetNumber}`,
      },
    });
  }
  for (const r of s.requests) {
    if (!r.id.startsWith("sr-live") || r.projectId !== projectId) continue;
    live.push({
      id: `tl-${r.id}`,
      projectId,
      at: r.createdAt,
      type: "request_created",
      title: `Создан запрос ${r.number}`,
      details: `${r.items.length} поз. · ${r.sentTo.map(counterpartyName).join(", ")}`,
      actorId: r.authorId,
      sourceId: null,
      link: { to: `/projects/${projectId}/procurement/${r.id}`, label: `Запрос ${r.number}` },
    });
  }
  for (const o of s.offers) {
    if (!o.id.startsWith("so-live")) continue;
    const request = s.requests.find((r) => r.id === o.requestId);
    if (!request || request.projectId !== projectId) continue;
    live.push({
      id: `tl-${o.id}`,
      projectId,
      at: o.receivedAt,
      type: "offer_received",
      title: `Получено предложение «${counterpartyName(o.supplierId)}» по запросу ${request.number}`,
      details: `${o.prices.length} поз., срок до ${o.leadTimeDays} дн.`,
      actorId: "agent-extract",
      sourceId: o.sourceId,
      link: {
        to: `/projects/${projectId}/procurement/${request.id}`,
        label: "Сравнение предложений",
      },
    });
  }
  for (const d of s.decisions) {
    if (!d.id.startsWith("dec-live") || d.projectId !== projectId) continue;
    live.push({
      id: `tl-${d.id}`,
      projectId,
      at: d.approvedAt,
      type: "decision",
      title: d.title,
      details: d.reason,
      actorId: d.approvedBy,
      sourceId: d.basis.sourceId,
      link: d.link,
    });
  }
  for (const doc of s.documents) {
    if (!doc.id.startsWith("pd-live") || doc.projectId !== projectId) continue;
    live.push({
      id: `tl-${doc.id}`,
      projectId,
      at: doc.uploadedAt,
      type: "version_uploaded",
      title: `Загружен документ «${doc.title}»`,
      details: `${doc.fileName}, ${doc.version}`,
      actorId: doc.uploadedBy,
      sourceId: null,
      link: { to: `/projects/${projectId}/documents/${doc.id}`, label: "Документ" },
    });
  }
  return [...base, ...live].sort((a, b) => b.at.localeCompare(a.at));
}

// В конце модуля: восстановлению нужны все объявления выше (часы демо, таймеры, действия)
if (typeof window !== "undefined") restore();
