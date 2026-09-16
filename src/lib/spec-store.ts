import { useSyncExternalStore } from "react";
import {
  isActivePosition,
  isReadyForRequest,
  isVerifiedPosition,
  type Contract,
  type Counterparty,
  type ExtractedPosition,
  type FieldReport,
  type PositionChange,
  type Project,
  type ProjectDecision,
  type ProjectDocument,
  type ProjectEvent,
  type RequestLine,
  type SupplyRequest,
} from "@/contracts";
import {
  buildSnapshot,
  sheetsOf,
  simulatedPositions,
  type FixtureSnapshot,
} from "@/adapters/fixtures";
import { projectOverview, revisionStats } from "@/domain/overview";
import { decisionFor } from "@/domain/procurement";
import { decisionLink, timelineOf as buildTimeline } from "@/domain/timeline";
import { simulateReply } from "@/lib/demo-simulator";
import { MOCK_NOW } from "@/lib/format";
import { toast } from "@/lib/toast";

/**
 * Клиентское состояние демо до перехода на запросы к серверу (ADR-002, фаза 2).
 * Стартует со снимка адаптера фикстур: представления из src/contracts, собранные из таблиц.
 * Экраны читают только отсюда, поэтому решение на экране проверки сразу видно в материалах,
 * карточке и реестре. Действия ведут себя как мутации портов: меняют строки и пишут журнал.
 */

export { isActivePosition as isActive, isVerifiedPosition as isVerified, isReadyForRequest };

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

export interface SpecState extends FixtureSnapshot {
  version: number;
  uploads: Record<string, UploadProgress>;
  pendingReplies: PendingReply[];
}

const ACTOR = "e-sokolov";
const STORAGE_KEY = "neeklo-fieldops-demo";
const CLOCK_KEY = "neeklo-fieldops-demo-clock";
/** Меняется при несовместимом изменении формы состояния: старое сохранение тогда игнорируется. */
const STATE_VERSION = 3;

function createSeed(): SpecState {
  return { version: STATE_VERSION, ...buildSnapshot(), uploads: {}, pendingReplies: [] };
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

/** События, которые меняют данные без действия пользователя: ответ поставщика, стадия распознавания */
export type DemoEventArea = "documents" | "positions" | "projects" | "procurement" | "timeline";
const demoEventListeners = new Set<(areas: DemoEventArea[]) => void>();

/** Подписка на события симулятора — кеш запросов обновляет только затронутые области (P2-3). */
export function onDemoEvent(listener: (areas: DemoEventArea[]) => void) {
  demoEventListeners.add(listener);
  return () => demoEventListeners.delete(listener);
}

function emitDemoEvent(areas: DemoEventArea[]) {
  demoEventListeners.forEach((listener) => listener(areas));
}

const getSnapshot = () => state;
const getServerSnapshot = () => seedState;

/** Текущее состояние вне React — для действий, справочников и проверок. */
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

/* ---------- Часы демо ---------- */

/**
 * Часы демо: идут от «сегодня» фикстур (MOCK_NOW) с момента первого действия в сессии.
 * Иначе новые записи получали бы реальную дату и спорили со сроками и историей в фикстурах.
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

/** Локальное время демо без часового пояса — в том же формате, что даты в фикстурах. */
function now() {
  return localIso(demoTime());
}

/** Текущее время демо без запуска часов: до первого действия — MOCK_NOW. Для расчётов на экране. */
export function demoNow() {
  if (clockStartedAt === null) return MOCK_NOW;
  return localIso(new Date(new Date(MOCK_NOW).getTime() + (Date.now() - clockStartedAt)));
}

let seq = 0;
function liveId(prefix: string) {
  seq += 1;
  return `${prefix}-live-${Date.now()}-${seq}`;
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
    emitDemoEvent(["documents", "positions", "projects"]);
    scheduleUpload(id);
  });
}

function event(
  input: Omit<
    ProjectEvent,
    | "id"
    | "occurredAt"
    | "actorKind"
    | "actorId"
    | "sourceId"
    | "requestId"
    | "revisionId"
    | "positionId"
    | "reportId"
  > &
    Partial<ProjectEvent>,
): ProjectEvent {
  return {
    id: liveId("ev"),
    occurredAt: now(),
    actorKind: "user",
    actorId: ACTOR,
    sourceId: null,
    requestId: null,
    revisionId: null,
    positionId: null,
    reportId: null,
    ...input,
  };
}

function familyOfLine(line: RequestLine) {
  const material = line.materialId
    ? state.materials.find((item) => item.id === line.materialId)
    : null;
  return material?.family ?? "other";
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
  const supplierName =
    state.counterparties.find((item) => item.id === supplierId)?.name ?? profile.contactName;
  const reply = simulateReply(request, profile, supplierName, now(), familyOfLine);
  const maxLead = Math.max(...reply.lines.map((line) => line.leadTimeDays));
  set((prev) => ({
    ...prev,
    offers: [...prev.offers, reply.offer],
    offerLines: [...prev.offerLines, ...reply.lines],
    sources: [...prev.sources, reply.source],
    pendingReplies: dropPending(prev.pendingReplies),
    positions: prev.positions.map((item) =>
      item.requestIds.includes(requestId) && item.purchase === "requested"
        ? { ...item, purchase: "offers" }
        : item,
    ),
    events: [
      ...prev.events,
      event({
        projectId: request.projectId,
        type: "offer_received",
        title: `Получено предложение «${supplierName}» по запросу ${request.number}`,
        details: `${reply.lines.length} поз., срок до ${maxLead} дн.`,
        actorKind: "system",
        actorId: null,
        sourceId: reply.source.id,
        requestId,
      }),
    ],
  }));
  emitDemoEvent(["procurement", "positions", "projects", "timeline"]);
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

function change(
  positionId: string,
  action: string,
  before: string | null = null,
  after: string | null = null,
): PositionChange {
  return {
    id: liveId("pc"),
    positionId,
    at: now(),
    actorKind: "user",
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
  events: ProjectEvent[] = [],
) {
  set((prev) => ({
    ...prev,
    positions: prev.positions.map((item) => (ids.has(item.id) ? patch(item) : item)),
    changes: [...prev.changes, ...changes],
    events: [...prev.events, ...events],
  }));
}

/* ---------- Действия ---------- */

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
    const events: ProjectEvent[] = [];
    if (item.qty !== patch.qty || item.unit !== patch.unit) {
      const before = `${item.qty} ${item.unit}`;
      const after = `${patch.qty} ${patch.unit}`;
      changes.push(change(id, "Исправлено количество", before, after));
      events.push(
        event({
          projectId: item.projectId,
          type: "qty_corrected",
          title: `Исправлено количество, поз. ${item.position}: ${before} → ${after}`,
          details: item.projectName,
          revisionId: item.documentId,
          positionId: item.id,
        }),
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
      events,
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
      handedOverAt: null,
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

  /** Передать проверенные позиции ревизии в закупку: после этого по ним можно запрашивать цены. */
  sendToProcurement(documentId: string) {
    const targets = state.positions.filter(
      (item) =>
        item.documentId === documentId && isVerifiedPosition(item) && item.handedOverAt === null,
    );
    const ids = new Set(targets.map((item) => item.id));
    const at = now();
    set((prev) => ({
      ...prev,
      positions: prev.positions.map((item) =>
        ids.has(item.id) ? { ...item, handedOverAt: at } : item,
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
    const id = liveId("p");
    const known = state.counterparties.find(
      (item) => item.role === "customer" && item.name === input.customer,
    );
    const customer: Counterparty = known ?? {
      id: liveId("c"),
      name: input.customer,
      role: "customer",
      inn: null,
      contactName: "",
      email: "",
      phone: "",
      avgReplyHours: 0,
      rating: 0,
    };
    const contract: Contract | null = input.contract
      ? {
          id: liveId("ct"),
          projectId: id,
          customerId: customer.id,
          number: input.contract,
          signedAt: input.startDate,
          startDate: input.startDate,
          endDate: input.endDate,
          amount: 0,
          advance: 0,
          retentionPct: 0,
          paymentTermDays: 0,
          status: "draft",
          sourceId: null,
        }
      : null;
    const project: Project = {
      id,
      name: input.name,
      code: input.code,
      customerId: customer.id,
      customer: customer.name,
      contractId: contract?.id ?? null,
      contract: contract?.number ?? "—",
      region: input.region,
      stage: "Подготовка: нет документации",
      status: "active",
      manager: input.manager,
      startDate: input.startDate,
      endDate: input.endDate,
    };
    set((prev) => ({
      ...prev,
      projects: [project, ...prev.projects],
      counterparties: known ? prev.counterparties : [...prev.counterparties, customer],
      contracts: contract ? [...prev.contracts, contract] : prev.contracts,
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
    const requestId = liveId("sr");
    const number = `З-2026/${326 + state.requests.filter((r) => r.id.includes("-live-")).length}`;
    const createdAt = now();

    // Строка без нормализации берёт материал у позиции с тем же проектным названием,
    // иначе один материал ушёл бы поставщику двумя строками под разными именами
    const baseName = (item: ExtractedPosition) => item.projectName.split(",")[0]!.trim();
    const dictionary = new Map<string, string>();
    for (const item of state.positions) {
      if (item.projectId === projectId && item.materialId) {
        dictionary.set(`${item.family}:${baseName(item)}`, item.materialId);
      }
    }
    // Одинаковые материалы из разных строк спецификации уходят поставщику одной строкой с суммой
    const lines = new Map<string, RequestLine>();
    for (const item of targets) {
      const materialId =
        item.materialId ?? dictionary.get(`${item.family}:${baseName(item)}`) ?? null;
      const material = materialId ? state.materials.find((m) => m.id === materialId) : null;
      const name = material?.name ?? baseName(item);
      const key = materialId ?? `${name}:${item.unit}`;
      const existing = lines.get(key);
      if (existing) existing.qty += item.qty;
      else {
        lines.set(key, {
          id: `${requestId}-l${lines.size + 1}`,
          materialId,
          name,
          qty: item.qty,
          unit: item.unit,
        });
      }
    }

    const due =
      options.replyDueAt ??
      localIso(new Date(demoTime().getTime() + 3 * 86_400_000)).slice(0, 10) + "T18:00:00";
    const request: SupplyRequest = {
      id: requestId,
      number,
      projectId,
      zoneId: null,
      authorId: ACTOR,
      createdAt,
      sentAt: createdAt,
      replyDueAt: due,
      templateId: options.templateId ?? state.templates[0]?.id ?? null,
      status: "sent",
      sourceId: null,
      items: [...lines.values()],
      sentTo: supplierIds,
    };
    const supplierNames = supplierIds
      .map((id) => state.counterparties.find((item) => item.id === id)?.name ?? "—")
      .join(", ");
    const targetIds = new Set(targets.map((item) => item.id));
    set((prev) => ({
      ...prev,
      requests: [request, ...prev.requests],
      positions: prev.positions.map((item) =>
        targetIds.has(item.id)
          ? { ...item, purchase: "requested", requestIds: [...item.requestIds, request.id] }
          : item,
      ),
      changes: [
        ...prev.changes,
        ...targets.map((item) => change(item.id, `Добавлено в запрос ${number}`)),
      ],
      events: [
        ...prev.events,
        event({
          projectId,
          type: "request_created",
          title: `Создан запрос ${number}`,
          details: `${request.items.length} поз. · ${supplierNames}`,
          requestId,
        }),
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
  recordDecision(decision: Omit<ProjectDecision, "id" | "approvedAt" | "link">) {
    const record: ProjectDecision = {
      ...decision,
      id: liveId("dec"),
      approvedAt: now(),
      link: decisionLink(decision, state.requests),
    };
    set((prev) => ({
      ...prev,
      decisions: [record, ...prev.decisions],
      requests: prev.requests.map((r) =>
        r.id === decision.requestId && r.status === "sent" ? { ...r, status: "decided" } : r,
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
    const id = liveId("pd");
    const documentId = liveId("doc");
    const ext = file.name.split(".").pop()?.toLowerCase();
    const fileType: ProjectDocument["fileType"] =
      ext === "docx" ? "docx" : ext === "xlsx" ? "xlsx" : "pdf";
    const section = /ар/i.test(file.name) ? "АР" : /км/i.test(file.name) ? "КМ" : "НВФ";
    const doc: ProjectDocument = {
      id,
      documentId,
      revision: 1,
      projectId,
      title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
      section,
      version: "Рев. 1",
      fileName: file.name,
      fileType,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      uploadedAt: now(),
      uploadedBy: ACTOR,
      sheetCount: fileType === "xlsx" ? 1 : 1 + Math.round(file.size / 180_000) || 1,
      status: "uploaded",
      sourceId: null,
      positionsTotal: null,
      positionsVerified: null,
    };
    const sheets = sheetsOf(doc, section).map((row) => ({
      id: row.id,
      documentId: row.revisionId,
      number: row.number,
      title: row.title,
      group: row.groupName,
    }));
    set((prev) => ({
      ...prev,
      documents: [doc, ...prev.documents],
      sheets: [...prev.sheets, ...sheets],
      uploads: { ...prev.uploads, [id]: { stage: 0, startedAt: Date.now() } },
      events: [
        ...prev.events,
        event({
          projectId,
          type: "version_uploaded",
          title: `Загружен документ «${doc.title}»`,
          details: `${doc.fileName}, ${doc.version}`,
          revisionId: id,
        }),
      ],
    }));
    scheduleUpload(id);
    return id;
  },
};

/* ---------- Селекторы ---------- */

/** Извлечено и проверено у ревизии: по позициям или по счётчику ревизии */
export function documentStats(s: SpecState, documentId: string) {
  const revision = s.documents.find((item) => item.id === documentId);
  if (!revision) return { extracted: 0, verified: 0, loaded: true };
  const stats = revisionStats(s.positions, revision);
  return { extracted: stats.total, verified: stats.verified, loaded: stats.loaded };
}

export function overviewOf(s: SpecState, projectId: string) {
  return projectOverview(s, projectId, demoNow());
}

export function projectOf(s: SpecState, projectId: string) {
  return s.projects.find((item) => item.id === projectId) ?? null;
}

export function sourceOf(s: SpecState, sourceId: string | null) {
  return sourceId ? (s.sources.find((item) => item.id === sourceId) ?? null) : null;
}

/** Предложения по запросу в порядке получения */
export function offersOf(s: SpecState, requestId: string) {
  return s.offers
    .filter((item) => item.requestId === requestId)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

/** Решение по запросу, если оно уже зафиксировано. */
export function decisionForRequest(s: SpecState, requestId: string) {
  return decisionFor(s.decisions, requestId);
}

/** Когда проверенные позиции ревизии переданы в закупку: время последней передачи */
export function handedOverAt(s: SpecState, documentId: string) {
  return s.positions
    .filter((item) => item.documentId === documentId && item.handedOverAt)
    .reduce<string | null>(
      (acc, item) => (!acc || item.handedOverAt! > acc ? item.handedOverAt : acc),
      null,
    );
}

/** История объекта: события журнала и решения. */
export function timelineOf(s: SpecState, projectId: string) {
  return buildTimeline(s, projectId);
}

// В конце модуля: восстановлению нужны все объявления выше (часы демо, таймеры, действия)
if (typeof window !== "undefined") restore();
