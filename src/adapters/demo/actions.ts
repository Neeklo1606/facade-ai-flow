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
  type Delivery,
  type DeliveryCard,
  type DeliveryRemark,
  type DeliveryStatus,
  type RequestLine,
  type SupplyRequest,
  deliveryStatusLabel,
  remarkKindLabel,
} from "@/contracts";
import { sheetsOf } from "@/adapters/fixtures";
import { decisionLink } from "@/domain/timeline";
import {
  acceptanceError,
  canMove,
  lineDiscrepancies,
  withDeliveries,
  type RequestPositionLink,
} from "@/domain/deliveries";
import { DEMO_DECISION_ORDER_NOTE } from "@/lib/demo-copy";
import { ConflictError, NotFoundError } from "@/ports";
import { reportStatusLabel, reportTransitions } from "@/contracts";
import type {
  ResolveRemarkInput,
  AcceptDeliveryInput,
  CorrectPositionInput,
  MoveDeliveryInput,
  CreateProjectInput,
  CreateRequestInput,
  UndoReviewInput,
  ReviewReportInput,
  UploadRevisionInput,
} from "@/ports";
import { addDays, tick } from "./clock";
import { liveId, positionChange, projectEvent } from "./records";
import { replyJobs, schedule, shipmentJobs, uploadJob } from "./simulator";
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
  // Новая ревизия существующего документа: тот же документ, номер на единицу больше, название
  // и раздел — от документа. Раньше `documentId` игнорировался и появлялся новый документ «Рев. 1»
  const previous = input.documentId
    ? getState()
        .documents.filter(
          (item) => item.documentId === input.documentId && item.projectId === input.projectId,
        )
        .sort((a, b) => b.revision - a.revision)[0]
    : undefined;
  if (input.documentId && !previous) throw new NotFoundError("Документ", input.documentId);
  const documentId = previous?.documentId ?? liveId("doc");
  const revision = previous ? previous.revision + 1 : 1;
  const ext = input.fileName.split(".").pop()?.toLowerCase();
  const fileType: ProjectDocument["fileType"] =
    ext === "docx" ? "docx" : ext === "xlsx" ? "xlsx" : "pdf";
  const section =
    previous?.section ??
    (/ар/i.test(input.fileName) ? "АР" : /км/i.test(input.fileName) ? "КМ" : "НВФ");
  const doc: ProjectDocument = {
    id,
    documentId,
    revision,
    projectId: input.projectId,
    title: previous?.title ?? input.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
    section,
    version: `Рев. ${revision}`,
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
          title: previous
            ? `Загружена ${doc.version} документа «${doc.title}»`
            : `Загружен документ «${doc.title}»`,
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
  const links: RequestPositionLink[] = [];
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
    // Из каких позиций собрана строка: по этой связи приёмка раскладывает принятое (ADR-011)
    links.push({ requestLineId: lines.get(key)!.id, positionId: item.id });
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
    requestPositions: [...prev.requestPositions, ...links],
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
  if (record.kind === "supplier" && record.requestId && record.supplierId) {
    const delivery = createDelivery(record);
    if (delivery) schedule(shipmentJobs(delivery.id));
  }
  return record;
}

/**
 * Поставка по решению (ADR-011, п. 1): строки и цены — из предложения выбранного поставщика,
 * срок — наибольший из его предложения, захватка — из запроса. Позиции переходят в «заказано».
 */
function createDelivery(decision: ProjectDecision) {
  const s = getState();
  const request = s.requests.find((item) => item.id === decision.requestId);
  const supplierId = decision.supplierId;
  if (!request || !supplierId || s.deliveries.some((item) => item.requestId === request.id))
    return null;
  const supplierName = s.counterparties.find((item) => item.id === supplierId)?.name ?? "—";
  const offer = s.offers.find(
    (item) => item.requestId === request.id && item.supplierId === supplierId,
  );
  const offerLines = s.offerLines.filter((line) => line.offerId === offer?.id);
  const leadDays = Math.max(1, ...offerLines.map((line) => line.leadTimeDays));
  const now = tick();
  const delivery: Delivery = {
    id: liveId("dl"),
    requestId: request.id,
    projectId: request.projectId,
    zoneId: request.zoneId,
    supplierId,
    decisionId: decision.id,
    expectedAt: addDays(now, leadDays).slice(0, 10),
    receivedAt: null,
    status: "expected",
    sourceId: null,
    items: request.items.map((line, index) => ({
      id: `${request.id}-dl${index + 1}`,
      requestLineId: line.id,
      materialId: line.materialId,
      name: line.name,
      qty: offerLines.find((o) => o.requestLineId === line.id)?.availableQty ?? line.qty,
      unit: line.unit,
      price: offerLines.find((o) => o.requestLineId === line.id)?.price ?? null,
      acceptedQty: null,
      remark: null,
    })),
  };
  update((prev) => ({
    ...prev,
    deliveries: [delivery, ...prev.deliveries],
    deliveryChanges: [
      ...prev.deliveryChanges,
      {
        id: liveId("dsc"),
        deliveryId: delivery.id,
        status: "expected",
        at: now,
        actorKind: "user",
        actorId: decision.approvedBy,
        note: `Создана решением по запросу ${request.number}`,
      },
    ],
    requests: prev.requests.map((item) =>
      item.id === request.id ? { ...item, status: "ordered" } : item,
    ),
    positions: prev.positions.map((item) =>
      item.requestIds.includes(request.id) &&
      (item.purchase === "supplier_selected" ||
        item.purchase === "requested" ||
        item.purchase === "offers")
        ? { ...item, purchase: "ordered" }
        : item,
    ),
    events: [
      ...prev.events,
      projectEvent(
        {
          projectId: request.projectId,
          type: "material_ordered",
          title: `Поставка «${supplierName}» по запросу ${request.number} создана решением`,
          details: `${delivery.items.length} поз., ожидается ${delivery.expectedAt.split("-").reverse().join(".")}. ${DEMO_DECISION_ORDER_NOTE}`,
          requestId: request.id,
          deliveryId: delivery.id,
        },
        decision.approvedBy,
      ),
    ],
  }));
  return delivery;
}

/** Карточка поставки: движение, акт, фото, замечания, номер запроса */
export function deliveryCard(deliveryId: string): DeliveryCard | null {
  const s = getState();
  const delivery = s.deliveries.find((item) => item.id === deliveryId);
  if (!delivery) return null;
  return {
    delivery,
    requestNumber: s.requests.find((item) => item.id === delivery.requestId)?.number ?? "—",
    statusChanges: s.deliveryChanges
      .filter((item) => item.deliveryId === deliveryId)
      .sort((a, b) => a.at.localeCompare(b.at)),
    acceptance: s.acceptances.find((item) => item.deliveryId === deliveryId) ?? null,
    photos: s.deliveryPhotos.filter((item) => item.deliveryId === deliveryId),
    remarks: s.remarks.filter((item) => item.deliveryId === deliveryId),
  };
}

/** Движение поставки до приёмки: отгружено, в пути, прибыло, или отклонение с причиной */
export function moveDelivery(input: MoveDeliveryInput, actorId: string | null) {
  const s = getState();
  const delivery = s.deliveries.find((item) => item.id === input.deliveryId);
  if (!delivery) throw new NotFoundError("Поставка", input.deliveryId);
  const status: DeliveryStatus = input.status;
  if (!canMove(delivery.status, status))
    throw new ConflictError(
      `Поставка «${deliveryStatusLabel[delivery.status]}»: перевести в «${deliveryStatusLabel[status]}» нельзя`,
    );
  const request = s.requests.find((item) => item.id === delivery.requestId);
  const at = tick();
  const remark: DeliveryRemark | null =
    status === "rejected" && actorId
      ? {
          id: liveId("drm"),
          deliveryId: delivery.id,
          projectId: delivery.projectId,
          lineId: null,
          kind: "rejected",
          text: input.note ?? "",
          createdAt: at,
          createdBy: actorId,
          status: "open",
          resolvedAt: null,
          resolvedBy: null,
          resolution: null,
        }
      : null;
  update((prev) => ({
    ...prev,
    deliveries: prev.deliveries.map((item) =>
      item.id === delivery.id ? { ...item, status } : item,
    ),
    deliveryChanges: [
      ...prev.deliveryChanges,
      {
        id: liveId("dsc"),
        deliveryId: delivery.id,
        status,
        at,
        actorKind: actorId ? "user" : "system",
        actorId,
        note: input.note,
      },
    ],
    remarks: remark ? [...prev.remarks, remark] : prev.remarks,
    events: [
      ...prev.events,
      projectEvent(
        {
          projectId: delivery.projectId,
          type: status === "rejected" ? "delivery_rejected" : "delivery_moved",
          title: `Поставка по запросу ${request?.number ?? "—"}: ${deliveryStatusLabel[status].toLowerCase()}`,
          details: input.note,
          requestId: delivery.requestId,
          deliveryId: delivery.id,
        },
        actorId,
      ),
    ],
  }));
  return deliveryCard(delivery.id)!;
}

/**
 * Акт приёмки (ADR-011, п. 3–7): правила — `acceptanceError`; факт по строкам, чек-лист, фото,
 * замечания снабжению по расхождениям, поставленное количество позиций, события истории.
 */
export function acceptDelivery(input: AcceptDeliveryInput, actorId: string) {
  const s = getState();
  const delivery = s.deliveries.find((item) => item.id === input.deliveryId);
  if (!delivery) throw new NotFoundError("Поставка", input.deliveryId);
  const error = acceptanceError(delivery, {
    result: input.result,
    lines: input.lines,
    checklist: input.checklist,
    photos: input.photos.length,
    reason: input.reason,
    confirmed: input.confirmed,
  });
  if (error) throw new ConflictError(error);

  const at = tick();
  const request = s.requests.find((item) => item.id === delivery.requestId);
  const acceptanceId = liveId("da");
  const factByLine = new Map(input.lines.map((line) => [line.lineId, line]));
  const accepted = input.result !== "rejected";
  const nextDelivery: Delivery = {
    ...delivery,
    status: input.result,
    receivedAt: accepted ? at.slice(0, 10) : null,
    items: delivery.items.map((line) => ({
      ...line,
      acceptedQty: accepted ? (factByLine.get(line.id)?.acceptedQty ?? line.qty) : 0,
      remark: factByLine.get(line.id)?.remark ?? null,
    })),
  };
  const discrepancies = lineDiscrepancies(delivery, input);
  const remarks: DeliveryRemark[] = [
    ...discrepancies.map((item) => {
      const line = delivery.items.find((row) => row.id === item.lineId)!;
      const diff = Math.abs(item.declared - item.accepted);
      return {
        id: liveId("drm"),
        deliveryId: delivery.id,
        projectId: delivery.projectId,
        lineId: item.lineId,
        kind: item.kind,
        text: `${line.name}: заявлено ${item.declared}, принято ${item.accepted} ${line.unit} (${item.kind === "shortage" ? "недостача" : "излишек"} ${diff})${factByLine.get(item.lineId)?.remark ? ` — ${factByLine.get(item.lineId)!.remark}` : ""}`,
        createdAt: at,
        createdBy: actorId,
        status: "open" as const,
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
      };
    }),
    ...input.checklist
      .filter((entry) => !entry.ok)
      .map((entry) => ({
        id: liveId("drm"),
        deliveryId: delivery.id,
        projectId: delivery.projectId,
        lineId: null,
        kind: "checklist" as const,
        text: `${entry.label}: не пройдено${entry.note ? ` — ${entry.note}` : ""}`,
        createdAt: at,
        createdBy: actorId,
        status: "open" as const,
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
      })),
    ...(input.result === "rejected"
      ? [
          {
            id: liveId("drm"),
            deliveryId: delivery.id,
            projectId: delivery.projectId,
            lineId: null,
            kind: "rejected" as const,
            text: `Поставка отклонена: ${input.reason ?? ""}`,
            createdAt: at,
            createdBy: actorId,
            status: "open" as const,
            resolvedAt: null,
            resolvedBy: null,
            resolution: null,
          },
        ]
      : []),
  ];

  update((prev) => {
    const deliveries = prev.deliveries.map((item) =>
      item.id === delivery.id ? nextDelivery : item,
    );
    return {
      ...prev,
      deliveries,
      deliveryChanges: [
        ...prev.deliveryChanges,
        {
          id: liveId("dsc"),
          deliveryId: delivery.id,
          status: input.result,
          at,
          actorKind: "user",
          actorId,
          note: input.reason,
        },
      ],
      acceptances: [
        ...prev.acceptances,
        {
          id: acceptanceId,
          deliveryId: delivery.id,
          acceptedAt: at,
          acceptedBy: actorId,
          result: input.result,
          reason: input.reason,
          checklist: input.checklist,
        },
      ],
      deliveryPhotos: [
        ...prev.deliveryPhotos,
        ...input.photos.map((photo) => ({
          id: liveId("dph"),
          deliveryId: delivery.id,
          acceptanceId,
          takenAt: at,
          takenBy: actorId,
          dataUrl: photo.dataUrl,
          caption: photo.caption,
        })),
      ],
      remarks: [...prev.remarks, ...remarks],
      // Поставленное считается тем же правилом, что и в фикстурах: по всем принятым актам
      positions: withDeliveries(prev.positions, deliveries, prev.requestPositions),
      events: [
        ...prev.events,
        projectEvent(
          {
            projectId: delivery.projectId,
            type: input.result === "rejected" ? "delivery_rejected" : "delivery_received",
            title:
              input.result === "rejected"
                ? `Поставка по запросу ${request?.number ?? "—"} отклонена`
                : `Поставка по запросу ${request?.number ?? "—"} ${input.result === "accepted" ? "принята" : "принята с замечаниями"}`,
            details:
              input.result === "rejected"
                ? input.reason
                : `По акту приёмки: ${nextDelivery.items.map((line) => `${line.name} ${line.acceptedQty} ${line.unit}`).join(", ")}`,
            requestId: delivery.requestId,
            deliveryId: delivery.id,
          },
          actorId,
        ),
        ...remarks.map((remark) =>
          projectEvent(
            {
              projectId: delivery.projectId,
              type: "delivery_remark",
              title: `${remarkKindLabel[remark.kind]}: замечание снабжению`,
              details: remark.text,
              requestId: delivery.requestId,
              deliveryId: delivery.id,
            },
            actorId,
          ),
        ),
      ],
    };
  });
  return deliveryCard(delivery.id)!;
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
  const report = getState().reports.find((item) => item.id === id);
  if (!report) throw new NotFoundError("Отчёт", id);
  // Переход по таблице контракта: вернуть уже возвращённый или принять принятый нельзя
  const allowed: readonly string[] = reportTransitions[report.status];
  if (!allowed.includes(status)) {
    throw new ConflictError(`Отчёт уже в статусе «${reportStatusLabel[report.status]}»`);
  }
  update((prev) => ({
    ...prev,
    reports: prev.reports.map((r) => (r.id === id ? { ...r, status, acceptedQty } : r)),
  }));
}

/** Закрыть замечание по поставке: кто, когда и чем решено (ADR-011, п. 5) */
export function resolveRemark(input: ResolveRemarkInput, actorId: string) {
  const s = getState();
  const remark = s.remarks.find((item) => item.id === input.remarkId);
  if (!remark) throw new NotFoundError("Замечание", input.remarkId);
  if (remark.status === "resolved") throw new ConflictError("Замечание уже закрыто");
  const at = tick();
  const request = s.deliveries.find((item) => item.id === remark.deliveryId);
  update((prev) => ({
    ...prev,
    remarks: prev.remarks.map((item) =>
      item.id === remark.id
        ? {
            ...item,
            status: "resolved",
            resolvedAt: at,
            resolvedBy: actorId,
            resolution: input.resolution,
          }
        : item,
    ),
    events: [
      ...prev.events,
      projectEvent(
        {
          projectId: remark.projectId,
          type: "delivery_remark",
          title: `Замечание по поставке закрыто: ${remarkKindLabel[remark.kind].toLowerCase()}`,
          details: input.resolution,
          requestId: request?.requestId ?? null,
          deliveryId: remark.deliveryId,
        },
        actorId,
      ),
    ],
  }));
  return deliveryCard(remark.deliveryId)!;
}
