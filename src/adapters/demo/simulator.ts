import type { Delivery, ProjectDocument, RequestLine } from "@/contracts";
import { simulatedPositions } from "@/adapters/fixtures";
import { addDays, tick } from "./clock";
import { projectEvent } from "./records";
import { simulateReply } from "./replies";
import { emitDemoEvent, getState, update, type DemoJob } from "./state";

/**
 * Симулятор событий демо: то, что в рабочем режиме приходит извне — стадии распознавания,
 * ответы поставщиков, заказ и отгрузка. Отложенные события лежат в состоянии (`jobs`),
 * поэтому после перезагрузки вкладки они продолжаются с того же места.
 */

export const UPLOAD_STAGE_MS = 1_400;
/** Заказ оформляется через несколько секунд после выбора поставщика, отгрузка — ещё позже */
const ORDER_DELAY_MS = 6_000;
const SHIPMENT_DELAY_MS = 10_000;

const uploadStatusByStage: ProjectDocument["status"][] = [
  "uploaded",
  "recognizing",
  "recognizing",
  "extracted",
  "review",
];

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let running = false;

function jobKey(job: DemoJob) {
  switch (job.kind) {
    case "upload":
      return `upload:${job.revisionId}:${job.stage}`;
    case "reply":
      return `reply:${job.requestId}:${job.supplierId}`;
    case "order":
      return `order:${job.decisionId}`;
    case "shipment":
      return `shipment:${job.deliveryId}`;
  }
}

function arm(job: DemoJob) {
  const key = jobKey(job);
  if (!running || timers.has(key)) return;
  timers.set(
    key,
    setTimeout(
      () => {
        timers.delete(key);
        update((prev) => ({ ...prev, jobs: prev.jobs.filter((item) => jobKey(item) !== key) }));
        run(job);
      },
      Math.max(0, job.dueAt - Date.now()),
    ),
  );
}

/** Запланировать события: записать в состояние и завести таймеры */
export function schedule(jobs: DemoJob[]) {
  if (!jobs.length) return;
  update((prev) => ({ ...prev, jobs: [...prev.jobs, ...jobs] }));
  jobs.forEach(arm);
}

/** Запустить симулятор и продолжить события, сохранённые до перезагрузки */
export function startSimulator() {
  running = true;
  getState().jobs.forEach(arm);
}

export function stopSimulator() {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
}

function run(job: DemoJob) {
  switch (job.kind) {
    case "upload":
      return advanceUpload(job.revisionId, job.stage);
    case "reply":
      return deliverReply(job.requestId, job.supplierId);
    case "order":
      return placeOrder(job.decisionId);
    case "shipment":
      return ship(job.deliveryId);
  }
}

/* ---------- Распознавание загруженного документа ---------- */

export function uploadJob(revisionId: string, stage: number, startedAt: number): DemoJob {
  return { kind: "upload", revisionId, stage, dueAt: startedAt + stage * UPLOAD_STAGE_MS };
}

function advanceUpload(revisionId: string, stage: number) {
  const doc = getState().documents.find((item) => item.id === revisionId);
  if (!doc) return;
  update((prev) => ({
    ...prev,
    uploads: { ...prev.uploads, [revisionId]: stage },
    documents: prev.documents.map((item) =>
      item.id === revisionId ? { ...item, status: uploadStatusByStage[stage]! } : item,
    ),
    positions:
      stage === 3 && !prev.positions.some((item) => item.documentId === revisionId)
        ? [...prev.positions, ...simulatedPositions(revisionId, doc.projectId, 36)]
        : prev.positions,
  }));
  emitDemoEvent({ areas: ["documents", "positions", "projects"] });
  if (stage < uploadStatusByStage.length - 1) {
    schedule([
      { kind: "upload", revisionId, stage: stage + 1, dueAt: Date.now() + UPLOAD_STAGE_MS },
    ]);
  }
}

/* ---------- Ответы поставщиков ---------- */

export function replyJobs(
  requestId: string,
  supplierIds: string[],
  firstDelayMs: number,
  stepMs: number,
): DemoJob[] {
  const base = Date.now();
  return supplierIds.map((supplierId, index) => ({
    kind: "reply",
    requestId,
    supplierId,
    dueAt: base + firstDelayMs + index * stepMs,
  }));
}

function deliverReply(requestId: string, supplierId: string) {
  const s = getState();
  const request = s.requests.find((item) => item.id === requestId);
  const profile = s.profiles.find((item) => item.supplierId === supplierId);
  const answered = s.offers.some(
    (item) => item.requestId === requestId && item.supplierId === supplierId,
  );
  if (!request || !profile || answered) return;

  const familyOf = (line: RequestLine) =>
    s.materials.find((item) => item.id === line.materialId)?.family ?? "other";
  const supplierName =
    s.counterparties.find((item) => item.id === supplierId)?.name ?? profile.contactName;
  const reply = simulateReply(request, profile, supplierName, tick(), familyOf);
  const maxLead = Math.max(...reply.lines.map((line) => line.leadTimeDays));

  update((prev) => ({
    ...prev,
    offers: [...prev.offers, reply.offer],
    offerLines: [...prev.offerLines, ...reply.lines],
    sources: [...prev.sources, reply.source],
    positions: prev.positions.map((item) =>
      item.requestIds.includes(requestId) && item.purchase === "requested"
        ? { ...item, purchase: "offers" }
        : item,
    ),
    events: [
      ...prev.events,
      projectEvent(
        {
          projectId: request.projectId,
          type: "offer_received",
          title: `Получено предложение «${supplierName}» по запросу ${request.number}`,
          details: `${reply.lines.length} поз., срок до ${maxLead} дн.`,
          sourceId: reply.source.id,
          requestId,
        },
        null,
      ),
    ],
  }));
  emitDemoEvent({
    areas: ["procurement", "positions", "projects", "timeline"],
    notice: {
      title: `Пришло предложение «${supplierName}»`,
      description: `Запрос ${request.number}: цены и сроки добавлены в сравнение.`,
    },
  });
}

/* ---------- Заказ и отгрузка после выбора поставщика ---------- */

export function orderJob(decisionId: string): DemoJob {
  return { kind: "order", decisionId, dueAt: Date.now() + ORDER_DELAY_MS };
}

function placeOrder(decisionId: string) {
  const s = getState();
  const decision = s.decisions.find((item) => item.id === decisionId);
  const request = s.requests.find((item) => item.id === decision?.requestId);
  if (!decision?.supplierId || !request || request.status === "ordered") return;

  const supplierId = decision.supplierId;
  const supplierName = s.counterparties.find((item) => item.id === supplierId)?.name ?? "—";
  const offer = s.offers.find(
    (item) => item.requestId === request.id && item.supplierId === supplierId,
  );
  const leadDays = Math.max(
    1,
    ...s.offerLines.filter((line) => line.offerId === offer?.id).map((line) => line.leadTimeDays),
  );
  const orderedAt = tick();
  const delivery: Delivery = {
    id: `dl-${request.id}`,
    requestId: request.id,
    projectId: request.projectId,
    supplierId,
    expectedAt: addDays(orderedAt, leadDays).slice(0, 10),
    receivedAt: null,
    status: "expected",
    sourceId: null,
    items: request.items.map((line) => ({
      requestLineId: line.id,
      name: line.name,
      qty: line.qty,
      unit: line.unit,
    })),
  };

  update((prev) => ({
    ...prev,
    deliveries: [delivery, ...prev.deliveries],
    requests: prev.requests.map((item) =>
      item.id === request.id ? { ...item, status: "ordered" } : item,
    ),
    positions: prev.positions.map((item) =>
      item.requestIds.includes(request.id) && item.purchase === "supplier_selected"
        ? { ...item, purchase: "ordered" }
        : item,
    ),
    events: [
      ...prev.events,
      projectEvent(
        {
          projectId: request.projectId,
          type: "material_ordered",
          title: `Заказаны материалы у «${supplierName}» по запросу ${request.number}`,
          details: `${request.items.length} поз., поставка ожидается через ${leadDays} дн.`,
          requestId: request.id,
        },
        null,
      ),
    ],
  }));
  emitDemoEvent({
    areas: ["procurement", "positions", "projects", "timeline"],
    notice: {
      title: `Заказ по запросу ${request.number} оформлен`,
      description: `«${supplierName}» подтвердил заказ, поставка ожидается через ${leadDays} дн.`,
    },
  });
  schedule([{ kind: "shipment", deliveryId: delivery.id, dueAt: Date.now() + SHIPMENT_DELAY_MS }]);
}

/** Отгрузка: поставка в пути. Приёмку на площадке симулятор не делает — это действие прораба. */
function ship(deliveryId: string) {
  const delivery = getState().deliveries.find((item) => item.id === deliveryId);
  if (!delivery || delivery.status !== "expected") return;
  update((prev) => ({
    ...prev,
    deliveries: prev.deliveries.map((item) =>
      item.id === deliveryId ? { ...item, status: "in_transit" } : item,
    ),
  }));
  const supplierName =
    getState().counterparties.find((item) => item.id === delivery.supplierId)?.name ?? "—";
  emitDemoEvent({
    areas: ["procurement", "projects"],
    notice: {
      title: `Поставка «${supplierName}» в пути`,
      description: `${delivery.items.length} поз., ожидается ${delivery.expectedAt.split("-").reverse().join(".")}.`,
    },
  });
}
