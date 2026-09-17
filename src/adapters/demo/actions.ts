import {
  isActivePosition,
  positionReviewLabel,
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
import { ConflictError, NotFoundError } from "@/ports";
import type {
  CorrectPositionInput,
  CreateProjectInput,
  CreateRequestInput,
  UndoReviewInput,
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

/** Количество как numeric(14,3): без хвостов двоичной арифметики */
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const label = (review: ExtractedPosition["review"]) => positionReviewLabel[review];

/**
 * Запись журнала о смене решения проверки: «до» и «после» — подписи решений.
 * По ней отмена проверяет, что возвращает именно то решение, которое было до действия.
 */
function reviewChange(
  item: ExtractedPosition,
  next: ExtractedPosition["review"],
  actorId: string,
  action: string,
) {
  return positionChange(item.id, actorId, action, label(item.review), label(next));
}

/* ---------- Целостность количества (объединения) ---------- */

/** Позиция в закупке: её количество уже ушло в запросы, менять его задним числом нельзя */
const inProcurement = (item: ExtractedPosition) =>
  item.handedOverAt !== null || item.purchase !== "none";

const hasMergedSources = (positions: ExtractedPosition[], id: string) =>
  positions.some((item) => item.review === "merged" && item.mergedInto === id);

function requirePosition(positions: ExtractedPosition[], id: string) {
  const item = positions.find((p) => p.id === id);
  if (!item) throw new NotFoundError("Позиция", id);
  return item;
}

/**
 * Правило объединений: количество цели = её собственное + присоединённые позиции. Поэтому объединённую
 * позицию нельзя править, а у позиции с присоединёнными нельзя менять количество и единицу, делить
 * и исключать, пока присоединённые не возвращены на проверку.
 */
function assertNotMerged(item: ExtractedPosition) {
  if (item.review === "merged") {
    throw new ConflictError(
      `Поз. ${item.position} объединена с другой позицией — сначала верните её на проверку`,
    );
  }
}

function assertNoMergedSources(positions: ExtractedPosition[], item: ExtractedPosition) {
  if (hasMergedSources(positions, item.id)) {
    throw new ConflictError(
      `К поз. ${item.position} присоединены другие позиции — сначала верните их на проверку`,
    );
  }
}

/** Количество позиции в закупке уже ушло в запросы поставщикам: менять его задним числом нельзя */
function assertNotInProcurement(item: ExtractedPosition, what: string) {
  if (inProcurement(item)) {
    throw new ConflictError(`Поз. ${item.position} уже передана в закупку — ${what} нельзя`);
  }
}

export function confirm(ids: string[], actorId: string) {
  const wanted = new Set(ids);
  const targets = getState().positions.filter(
    (item) => wanted.has(item.id) && item.review === "pending",
  );
  const at = tick();
  patchPositions(
    new Set(targets.map((item) => item.id)),
    (item) => ({ ...item, review: "confirmed", reviewedBy: actorId, reviewedAt: at }),
    targets.map((item) => reviewChange(item, "confirmed", actorId, "Подтверждено")),
  );
  return targets.map((item) => item.id);
}

export function correct({ id, ...patch }: CorrectPositionInput, actorId: string) {
  const { positions } = getState();
  const item = requirePosition(positions, id);
  assertNotMerged(item);
  patch = { ...patch, qty: round3(patch.qty) };
  if (item.qty !== patch.qty || item.unit !== patch.unit) {
    assertNoMergedSources(positions, item);
    assertNotInProcurement(item, "менять количество");
  }
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
  const { positions } = getState();
  const item = requirePosition(positions, id);
  assertNotMerged(item);
  assertNoMergedSources(positions, item);
  assertNotInProcurement(item, review === "excluded" ? "исключать" : "отмечать заголовком");
  patchPositions(
    new Set([id]),
    (p) => ({ ...p, review, reviewedBy: actorId, reviewedAt: tick() }),
    [reviewChange(item, review, actorId, action)],
  );
}

type Patches = Map<string, Partial<ExtractedPosition>>;

/**
 * Разъединить объединённую позицию: вычесть её количество из цели. Количество цели с присоединёнными
 * менять нельзя (см. assertNoMergedSources), поэтому вычитание всегда возвращает цель к прежнему.
 * Строка — причина, по которой разъединять нельзя.
 */
function unmerge(
  item: ExtractedPosition,
  current: (id: string) => ExtractedPosition | undefined,
  changes: PositionChange[],
  actorId: string,
): { patches: Patches; changes: PositionChange[] } | string {
  const target = item.mergedInto ? current(item.mergedInto) : undefined;
  if (!target) return "позиции, с которой объединяли, больше нет";
  if (target.review === "merged") {
    return `поз. ${target.position} сама объединена дальше — сначала верните её на проверку`;
  }
  if (inProcurement(target)) {
    return `поз. ${target.position} уже передана в закупку — её количество ушло в запросы`;
  }
  // Запись на источнике и на цели сделаны одним действием — в одну и ту же секунду
  const merged = [...changes]
    .reverse()
    .find((change) => change.positionId === item.id && change.after === label("merged"));
  const joined = merged
    ? changes.find(
        (change) =>
          change.positionId === target.id &&
          change.at === merged.at &&
          change.action === `Присоединена поз. ${item.position}`,
      )
    : undefined;
  if (!joined) return "в журнале нет записи об объединении";
  const patches: Patches = new Map();
  const result: PositionChange[] = [];
  // Единицы разные — при объединении количество не складывали, вычитать нечего
  if (joined.before !== joined.after) {
    const qty = round3(target.qty - item.qty);
    if (qty < 0) return `у поз. ${target.position} меньше, чем присоединяли`;
    patches.set(target.id, { qty });
    result.push(
      positionChange(
        target.id,
        actorId,
        `Отменено присоединение поз. ${item.position}`,
        `${target.qty} ${target.unit}`,
        `${qty} ${target.unit}`,
      ),
    );
  }
  return { patches, changes: result };
}

/**
 * Вернуть исключённую, объединённую или заголовок обратно на проверку. Объединённую — вместе
 * с вычитанием её количества из цели; если разъединить нельзя — ConflictError с причиной.
 */
export function reopen(id: string, actorId: string) {
  const s = getState();
  const item = requirePosition(s.positions, id);
  const byId = new Map(s.positions.map((p) => [p.id, p]));
  const result =
    item.review === "merged" ? unmerge(item, (key) => byId.get(key), s.changes, actorId) : null;
  if (typeof result === "string") {
    throw new ConflictError(`Вернуть поз. ${item.position} нельзя: ${result}`);
  }
  const split = result;
  update((prev) => ({
    ...prev,
    positions: prev.positions.map((p) => {
      if (p.id === id)
        return { ...p, review: "pending", reviewedBy: null, reviewedAt: null, mergedInto: null };
      const patch = split?.patches.get(p.id);
      return patch ? { ...p, ...patch } : p;
    }),
    changes: [
      ...prev.changes,
      reviewChange(item, "pending", actorId, "Возвращено на проверку"),
      ...(split?.changes ?? []),
    ],
  }));
  return true;
}

/**
 * «Отменить»: вернуть решение проверки, которое было до действия. Отмена пишется в журнал.
 * Позиция не трогается, если её успели изменить после действия: другое решение; «до» в журнале
 * не совпадает с тем, что просит вернуть клиент; передана в закупку и стала бы непроверенной;
 * объединение нельзя разъединить (см. unmerge).
 */
export function undoReview(items: UndoReviewInput["items"], actorId: string) {
  const s = getState();
  const byId = new Map(s.positions.map((item) => [item.id, item]));
  const patches: Patches = new Map();
  const changes: PositionChange[] = [];
  const at = tick();
  let undone = 0;

  const current = (id: string) => {
    const item = byId.get(id);
    return item ? { ...item, ...patches.get(id) } : undefined;
  };
  const touched = new Set<string>();
  // Один проход по журналу вместо поиска на каждую позицию: последняя запись «после» по позиции
  const lastByPositionAndAfter = new Map<string, PositionChange>();
  for (const change of s.changes) {
    if (change.after !== null)
      lastByPositionAndAfter.set(`${change.positionId}|${change.after}`, change);
  }

  for (const { id, from, to } of items) {
    const item = current(id);
    if (!item || touched.has(id) || from === to || item.review !== from) continue;
    // Последняя смена решения этой позиции должна быть именно «to → from»
    const last = lastByPositionAndAfter.get(`${id}|${label(from)}`);
    if (!last || last.before !== label(to)) continue;
    if (inProcurement(item) && !isVerifiedPosition({ ...item, review: to })) continue;
    // Недействующим решением нельзя «отменить» позицию, к которой присоединены другие: они выпали бы из итогов
    if (!isActivePosition({ ...item, review: to }) && hasMergedSources(s.positions, id)) continue;

    let split: Exclude<ReturnType<typeof unmerge>, string> | null = null;
    if (from === "merged") {
      const result = unmerge(item, current, s.changes, actorId);
      if (typeof result === "string") continue;
      split = result;
    }

    touched.add(id);
    patches.set(id, {
      ...patches.get(id),
      review: to,
      mergedInto: null,
      reviewedBy: to === "pending" ? null : actorId,
      reviewedAt: to === "pending" ? null : at,
    });
    changes.push(positionChange(id, actorId, "Действие отменено", label(from), label(to)));
    for (const [targetId, patch] of split?.patches ?? []) {
      patches.set(targetId, { ...patches.get(targetId), ...patch });
    }
    changes.push(...(split?.changes ?? []));
    undone += 1;
  }

  if (!undone) return 0;
  update((prev) => ({
    ...prev,
    positions: prev.positions.map((item) => {
      const patch = patches.get(item.id);
      return patch ? { ...item, ...patch } : item;
    }),
    changes: [...prev.changes, ...changes],
  }));
  return undone;
}

export function merge(sourceId: string, targetId: string, actorId: string) {
  const { positions } = getState();
  if (sourceId === targetId) throw new ConflictError("Позицию нельзя объединить саму с собой");
  const source = requirePosition(positions, sourceId);
  const target = requirePosition(positions, targetId);
  for (const item of [source, target]) {
    if (!isActivePosition(item)) {
      throw new ConflictError(
        `Поз. ${item.position} не действует (исключена, объединена или заголовок) — объединять нельзя`,
      );
    }
    if (inProcurement(item)) {
      throw new ConflictError(`Поз. ${item.position} уже передана в закупку — объединять нельзя`);
    }
  }
  const sameUnit = source.unit === target.unit;
  const at = tick();
  const summed = round3(target.qty + source.qty);
  update((prev) => ({
    ...prev,
    positions: prev.positions.map((item) => {
      if (item.id === sourceId)
        return {
          ...item,
          review: "merged",
          mergedInto: targetId,
          reviewedBy: actorId,
          reviewedAt: at,
        };
      if (item.id === targetId && sameUnit) return { ...item, qty: summed };
      return item;
    }),
    changes: [
      ...prev.changes,
      // Обе записи с одним временем: по нему отмена находит пару «источник — цель»
      { ...reviewChange(source, "merged", actorId, `Объединено с поз. ${target.position}`), at },
      {
        ...positionChange(
          targetId,
          actorId,
          `Присоединена поз. ${source.position}`,
          `${target.qty} ${target.unit}`,
          sameUnit ? `${summed} ${target.unit}` : `${target.qty} ${target.unit}`,
        ),
        at,
      },
    ],
  }));
  return sameUnit;
}

export function split(id: string, firstQty: number, actorId: string) {
  const { positions } = getState();
  const item = requirePosition(positions, id);
  assertNotMerged(item);
  assertNoMergedSources(positions, item);
  if (inProcurement(item)) {
    throw new ConflictError(`Поз. ${item.position} уже передана в закупку — делить нельзя`);
  }
  firstQty = round3(firstQty);
  if (firstQty <= 0 || firstQty >= item.qty) {
    throw new ConflictError("Первая часть должна быть больше нуля и меньше количества позиции");
  }
  const secondQty = round3(item.qty - firstQty);
  const copy: ExtractedPosition = {
    ...item,
    id: liveId(`${item.id}-part`),
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

/** Верхняя граница листов демо-документа: число листов оценивается по размеру файла */
const MAX_SHEETS = 200;

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
    sheetCount:
      fileType === "xlsx"
        ? 1
        : Math.min(MAX_SHEETS, 1 + Math.round((input.sizeKb * 1024) / 180_000)),
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
    // Задача извлечения в очереди; стадии проводит симулятор, как обработчик на сервере
    extractionJobs: [
      ...prev.extractionJobs,
      {
        id: liveId("ej"),
        revisionId: id,
        status: "queued",
        stage: 0,
        queuedAt: doc.uploadedAt,
        startedAt: null,
        finishedAt: null,
        error: null,
      },
    ],
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
export function recordDecision(input: Omit<ProjectDecision, "id" | "approvedAt" | "link">) {
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
