import {
  isReadyForRequest,
  isVerifiedPosition,
  type Contract,
  type Counterparty,
  type ExtractedPosition,
  type PositionChange,
  type Project,
  type ProjectDecision,
  type ProjectDocument,
  type ProjectEvent,
  type RequestLine,
  type SupplyRequest,
} from "@/contracts";
import { sheetsOf } from "@/adapters/fixtures";
import { decisionLink } from "@/domain/timeline";
import type {
  CorrectPositionInput,
  CreateProjectInput,
  CreateRequestInput,
  RecordDecisionInput,
  RestoreReviewInput,
  ReviewReportInput,
  UploadRevisionInput,
} from "@/ports";
import { tick } from "./clock";
import { liveId, positionChange, projectEvent } from "./records";
import { orderJob, replyJobs, schedule, uploadJob } from "./simulator";
import { getState, update } from "./state";

/**
 * Мутации демо: меняют строки состояния и пишут журналы так, как это будет делать адаптер БД.
 * Вызываются только из репозиториев адаптера (index.ts).
 */

function patchPositions(
  ids: Set<string>,
  patch: (item: ExtractedPosition) => ExtractedPosition,
  changes: PositionChange[],
  events: ProjectEvent[] = [],
) {
  update((prev) => ({
    ...prev,
    positions: prev.positions.map((item) => (ids.has(item.id) ? patch(item) : item)),
    changes: [...prev.changes, ...changes],
    events: [...prev.events, ...events],
  }));
}

/* ---------- Проверка позиций ---------- */

export function confirm(ids: string[], actorId: string) {
  const wanted = new Set(ids);
  const targets = getState().positions.filter(
    (item) => wanted.has(item.id) && item.review === "pending",
  );
  const at = tick();
  patchPositions(
    new Set(targets.map((item) => item.id)),
    (item) => ({ ...item, review: "confirmed", reviewedBy: actorId, reviewedAt: at }),
    targets.map((item) => positionChange(item.id, actorId, "Подтверждено")),
  );
  return targets.map((item) => item.id);
}

export function correct({ id, ...patch }: CorrectPositionInput, actorId: string) {
  const item = getState().positions.find((p) => p.id === id);
  if (!item) return;
  const changes: PositionChange[] = [];
  const events: ProjectEvent[] = [];
  if (item.qty !== patch.qty || item.unit !== patch.unit) {
    const before = `${item.qty} ${item.unit}`;
    const after = `${patch.qty} ${patch.unit}`;
    changes.push(positionChange(id, actorId, "Исправлено количество", before, after));
    events.push(
      projectEvent(
        {
          projectId: item.projectId,
          type: "qty_corrected",
          title: `Исправлено количество, поз. ${item.position}: ${before} → ${after}`,
          details: item.projectName,
          revisionId: item.documentId,
          positionId: item.id,
        },
        actorId,
      ),
    );
  }
  if (item.projectName !== patch.projectName) {
    changes.push(
      positionChange(id, actorId, "Исправлено наименование", item.projectName, patch.projectName),
    );
  }
  const chars = (list: ExtractedPosition["characteristics"]) =>
    list.map((c) => `${c.label}: ${c.value}`).join("; ");
  if (chars(item.characteristics) !== chars(patch.characteristics)) {
    changes.push(
      positionChange(
        id,
        actorId,
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
      reviewedBy: actorId,
      reviewedAt: tick(),
      confidence: Math.max(p.confidence, 0.85),
    }),
    changes.length ? changes : [positionChange(id, actorId, "Подтверждено с правкой")],
    events,
  );
}

export function setReview(
  id: string,
  review: "excluded" | "header",
  action: string,
  actorId: string,
) {
  patchPositions(
    new Set([id]),
    (p) => ({ ...p, review, reviewedBy: actorId, reviewedAt: tick() }),
    [positionChange(id, actorId, action)],
  );
}

/** Вернуть исключённую, объединённую или заголовок обратно на проверку */
export function reopen(id: string, actorId: string) {
  if (!getState().positions.some((p) => p.id === id)) return;
  patchPositions(
    new Set([id]),
    (p) => ({ ...p, review: "pending", reviewedBy: null, reviewedAt: null, mergedInto: null }),
    [positionChange(id, actorId, "Возвращено на проверку")],
  );
}

/** «Отменить»: вернуть поля проверки, какими они были до действия */
export function restoreReview(items: RestoreReviewInput["items"]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  update((prev) => ({
    ...prev,
    positions: prev.positions.map((item) => {
      const saved = byId.get(item.id);
      return saved ? { ...item, ...saved } : item;
    }),
  }));
}

export function merge(sourceId: string, targetId: string, actorId: string) {
  const { positions } = getState();
  const source = positions.find((p) => p.id === sourceId);
  const target = positions.find((p) => p.id === targetId);
  if (!source || !target) return false;
  const sameUnit = source.unit === target.unit;
  update((prev) => ({
    ...prev,
    positions: prev.positions.map((item) => {
      if (item.id === sourceId)
        return {
          ...item,
          review: "merged",
          mergedInto: targetId,
          reviewedBy: actorId,
          reviewedAt: tick(),
        };
      if (item.id === targetId && sameUnit) return { ...item, qty: item.qty + source.qty };
      return item;
    }),
    changes: [
      ...prev.changes,
      positionChange(sourceId, actorId, `Объединено с поз. ${target.position}`),
      positionChange(
        targetId,
        actorId,
        `Присоединена поз. ${source.position}`,
        `${target.qty} ${target.unit}`,
        sameUnit ? `${target.qty + source.qty} ${target.unit}` : `${target.qty} ${target.unit}`,
      ),
    ],
  }));
  return sameUnit;
}

export function split(id: string, firstQty: number, actorId: string) {
  const item = getState().positions.find((p) => p.id === id);
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
  update((prev) => {
    const index = prev.positions.findIndex((p) => p.id === id);
    const positions = [...prev.positions];
    positions[index] = { ...item, position: `${item.position}.1`, qty: firstQty };
    positions.splice(index + 1, 0, copy);
    return {
      ...prev,
      positions,
      changes: [
        ...prev.changes,
        positionChange(
          id,
          actorId,
          "Разделена на две позиции",
          `${item.qty} ${item.unit}`,
          `${firstQty} + ${secondQty} ${item.unit}`,
        ),
      ],
    };
  });
}

/** Передать проверенные позиции ревизии в закупку: после этого по ним можно запрашивать цены */
export function handOver(revisionId: string, actorId: string) {
  const targets = getState().positions.filter(
    (item) =>
      item.documentId === revisionId && isVerifiedPosition(item) && item.handedOverAt === null,
  );
  const ids = new Set(targets.map((item) => item.id));
  const at = tick();
  update((prev) => ({
    ...prev,
    positions: prev.positions.map((item) =>
      ids.has(item.id) ? { ...item, handedOverAt: at } : item,
    ),
    changes: [
      ...prev.changes,
      ...targets.map((item) => positionChange(item.id, actorId, "Передано в закупку")),
    ],
  }));
  return targets.length;
}

/* ---------- Объекты ---------- */

export function createProject(input: CreateProjectInput) {
  const id = liveId("p");
  const s = getState();
  const known = s.counterparties.find(
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
  const contract: Contract | null = input.contractNumber
    ? {
        id: liveId("ct"),
        projectId: id,
        customerId: customer.id,
        number: input.contractNumber,
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
    manager: input.managerId,
    startDate: input.startDate,
    endDate: input.endDate,
  };
  update((prev) => ({
    ...prev,
    projects: [project, ...prev.projects],
    counterparties: known ? prev.counterparties : [...prev.counterparties, customer],
    contracts: contract ? [...prev.contracts, contract] : prev.contracts,
  }));
  return project;
}

/* ---------- Документы ---------- */

export function upload(input: UploadRevisionInput, actorId: string) {
  const id = liveId("pd");
  const documentId = liveId("doc");
  const ext = input.fileName.split(".").pop()?.toLowerCase();
  const fileType: ProjectDocument["fileType"] =
    ext === "docx" ? "docx" : ext === "xlsx" ? "xlsx" : "pdf";
  const section = /ар/i.test(input.fileName) ? "АР" : /км/i.test(input.fileName) ? "КМ" : "НВФ";
  const doc: ProjectDocument = {
    id,
    documentId,
    revision: 1,
    projectId: input.projectId,
    title: input.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
    section,
    version: "Рев. 1",
    fileName: input.fileName,
    fileType,
    sizeKb: input.sizeKb,
    uploadedAt: tick(),
    uploadedBy: actorId,
    sheetCount: fileType === "xlsx" ? 1 : 1 + Math.round((input.sizeKb * 1024) / 180_000) || 1,
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
  update((prev) => ({
    ...prev,
    documents: [doc, ...prev.documents],
    sheets: [...prev.sheets, ...sheets],
    uploads: { ...prev.uploads, [id]: 0 },
    events: [
      ...prev.events,
      projectEvent(
        {
          projectId: input.projectId,
          type: "version_uploaded",
          title: `Загружен документ «${doc.title}»`,
          details: `${doc.fileName}, ${doc.version}`,
          revisionId: id,
        },
        actorId,
      ),
    ],
  }));
  schedule([uploadJob(id, 1, Date.now())]);
  return doc;
}

/* ---------- Закупка ---------- */

export function createRequest(input: CreateRequestInput, actorId: string) {
  const s = getState();
  const wanted = new Set(input.positionIds);
  const targets = s.positions.filter((item) => wanted.has(item.id) && isReadyForRequest(item));
  if (!targets.length) return null;
  const requestId = liveId("sr");
  const number = `З-2026/${326 + s.requests.filter((r) => r.id.includes("-live-")).length}`;
  const createdAt = tick();

  // Строка без нормализации берёт материал у позиции с тем же проектным названием,
  // иначе один материал ушёл бы поставщику двумя строками под разными именами
  const baseName = (item: ExtractedPosition) => item.projectName.split(",")[0]!.trim();
  const dictionary = new Map<string, string>();
  for (const item of s.positions) {
    if (item.projectId === input.projectId && item.materialId) {
      dictionary.set(`${item.family}:${baseName(item)}`, item.materialId);
    }
  }
  // Одинаковые материалы из разных строк спецификации уходят поставщику одной строкой с суммой
  const lines = new Map<string, RequestLine>();
  for (const item of targets) {
    const materialId =
      item.materialId ?? dictionary.get(`${item.family}:${baseName(item)}`) ?? null;
    const material = materialId ? s.materials.find((m) => m.id === materialId) : null;
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

  const request: SupplyRequest = {
    id: requestId,
    number,
    projectId: input.projectId,
    zoneId: null,
    authorId: actorId,
    createdAt,
    sentAt: createdAt,
    replyDueAt: input.replyDueAt,
    templateId: input.templateId ?? s.templates[0]?.id ?? null,
    status: "sent",
    sourceId: null,
    items: [...lines.values()],
    sentTo: input.supplierIds,
  };
  const supplierNames = input.supplierIds
    .map((id) => s.counterparties.find((item) => item.id === id)?.name ?? "—")
    .join(", ");
  const targetIds = new Set(targets.map((item) => item.id));
  update((prev) => ({
    ...prev,
    requests: [request, ...prev.requests],
    positions: prev.positions.map((item) =>
      targetIds.has(item.id)
        ? { ...item, purchase: "requested", requestIds: [...item.requestIds, request.id] }
        : item,
    ),
    changes: [
      ...prev.changes,
      ...targets.map((item) => positionChange(item.id, actorId, `Добавлено в запрос ${number}`)),
    ],
    events: [
      ...prev.events,
      projectEvent(
        {
          projectId: input.projectId,
          type: "request_created",
          title: `Создан запрос ${number}`,
          details: `${request.items.length} поз. · ${supplierNames}`,
          requestId,
        },
        actorId,
      ),
    ],
  }));

  // Большинство поставщиков отвечает за несколько секунд, последний из трёх и более молчит —
  // так видно и сравнение, и напоминание
  const responders =
    input.supplierIds.length >= 3 ? input.supplierIds.slice(0, -1) : input.supplierIds;
  schedule(replyJobs(request.id, responders, 5_000, 4_000));
  return { request, positions: targets.length };
}

/** Поставщики, которые не ответили и ответа от которых симулятор не ждёт */
export function silentSuppliers(requestId: string) {
  const s = getState();
  const request = s.requests.find((item) => item.id === requestId);
  if (!request) return null;
  return request.sentTo.filter(
    (supplierId) =>
      !s.offers.some((o) => o.requestId === requestId && o.supplierId === supplierId) &&
      !s.jobs.some(
        (job) =>
          job.kind === "reply" && job.requestId === requestId && job.supplierId === supplierId,
      ),
  );
}

/** Напомнить молчащим поставщикам: симулятор пришлёт их ответы позже */
export function remind(requestId: string) {
  const silent = silentSuppliers(requestId) ?? [];
  schedule(replyJobs(requestId, silent, 4_000, 3_000));
  return silent;
}

/** Решение фиксируется в истории объекта; выбор поставщика запускает заказ и отгрузку */
export function recordDecision(input: RecordDecisionInput) {
  const s = getState();
  const record: ProjectDecision = {
    ...input,
    id: liveId("dec"),
    approvedAt: tick(),
    link: decisionLink(input, s.requests),
  };
  update((prev) => ({
    ...prev,
    decisions: [record, ...prev.decisions],
    requests: prev.requests.map((r) =>
      r.id === input.requestId && r.status === "sent" ? { ...r, status: "decided" } : r,
    ),
    positions: prev.positions.map((item) =>
      input.requestId &&
      item.requestIds.includes(input.requestId) &&
      (item.purchase === "requested" || item.purchase === "offers")
        ? { ...item, purchase: "supplier_selected" }
        : item,
    ),
  }));
  if (record.kind === "supplier" && record.requestId) schedule([orderJob(record.id)]);
  return record;
}

export function verifyContact(supplierId: string) {
  const checkedAt = tick().slice(0, 10);
  update((prev) => ({
    ...prev,
    profiles: prev.profiles.map((p) =>
      p.supplierId === supplierId
        ? { ...p, contactStatus: "verified", contactCheckedAt: checkedAt }
        : p,
    ),
  }));
}

export function reviewReport({ id, status, acceptedQty }: ReviewReportInput) {
  update((prev) => ({
    ...prev,
    reports: prev.reports.map((r) => (r.id === id ? { ...r, status, acceptedQty } : r)),
  }));
}
