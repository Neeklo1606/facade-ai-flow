import type { ExtractionJob, ProjectDocument, RequestLine } from "@/contracts";
import { deliveryStatusLabel } from "@/contracts";
import { canMove } from "@/domain/deliveries";
import { DEMO_SHIPMENT_NOTE } from "@/lib/demo-copy";
import { simulatedPositions } from "@/adapters/fixtures";
import { tick } from "./clock";
import { liveId, projectEvent } from "./records";
import { simulateReply } from "./replies";
import { emitDemoEvent, getState, update, type DemoJob } from "./state";

/**
 * Симулятор событий демо: то, что в рабочем режиме приходит извне — стадии распознавания,
 * ответы поставщиков, отгрузка поставки. Отложенные события лежат в состоянии (`jobs`),
 * поэтому после перезагрузки вкладки они продолжаются с того же места.
 */

export const UPLOAD_STAGE_MS = 1_400;
/**
 * Поставщик «отгружает» поставку через несколько секунд после решения и отмечает «в пути»
 * ещё позже. Прибытие и приёмку отмечает человек на площадке (ADR-011)
 */
const SHIPPED_DELAY_MS = 8_000;
const IN_TRANSIT_DELAY_MS = 16_000;

const uploadStatusByStage: ProjectDocument["status"][] = [
  "uploaded",
  "recognizing",
  "recognizing",
  "extracted",
  "review",
];

/** Статус задачи извлечения после стадии: 1–2 распознавание, 3 позиции извлечены, 4 готово к проверке */
const jobStatusByStage: ExtractionJob["status"][] = [
  "queued",
  "recognizing",
  "recognizing",
  "extracted",
  "review",
];

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let running = false;
/** Без симулятора события не заводятся вовсе: режим базы и паритетный тест (ADR-005, п. 12) */
let enabled = true;

export function disableSimulator() {
  enabled = false;
  stopSimulator();
}

function jobKey(job: DemoJob) {
  switch (job.kind) {
    case "upload":
      return `upload:${job.revisionId}:${job.stage}`;
    case "reply":
      return `reply:${job.requestId}:${job.supplierId}`;
    case "shipment":
      return `shipment:${job.deliveryId}:${job.status}`;
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
  if (!jobs.length || !enabled) return;
  update((prev) => ({ ...prev, jobs: [...prev.jobs, ...jobs] }));
  jobs.forEach(arm);
}

/** Запустить симулятор и продолжить события, сохранённые до перезагрузки */
export function startSimulator() {
  if (!enabled) return;
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
    case "shipment":
      return ship(job.deliveryId, job.status);
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
    extractionJobs: prev.extractionJobs.map((job) =>
      job.revisionId === revisionId && job.status !== "review" && job.status !== "failed"
        ? {
            ...job,
            stage,
            status: jobStatusByStage[stage]!,
            startedAt: job.startedAt ?? tick(),
            finishedAt: stage === 4 ? tick() : null,
          }
        : job,
    ),
    documents: prev.documents.map((item) =>
      item.id === revisionId ? { ...item, status: uploadStatusByStage[stage]! } : item,
    ),
    positions:
      stage === 3 && !prev.positions.some((item) => item.documentId === revisionId)
        ? [...prev.positions, ...simulatedPositions(revisionId, doc.projectId, 36)]
        : prev.positions,
  }));
  emitDemoEvent({ areas: ["documents", "positions", "projects"], kind: "extraction" });
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
    kind: "offer",
    areas: ["procurement", "positions", "projects", "timeline"],
    notice: {
      title: `Пришло предложение «${supplierName}»`,
      description: `Запрос ${request.number}: цены и сроки добавлены в сравнение.`,
    },
  });
}

/* ---------- Отгрузка поставки (ADR-011) ---------- */

/** Задания поставщика после решения: «отгружено», затем «в пути» */
export function shipmentJobs(deliveryId: string): DemoJob[] {
  const now = Date.now();
  return [
    { kind: "shipment", deliveryId, status: "shipped", dueAt: now + SHIPPED_DELAY_MS },
    { kind: "shipment", deliveryId, status: "in_transit", dueAt: now + IN_TRANSIT_DELAY_MS },
  ];
}

/**
 * Движение на стороне поставщика. В демо его никто не присылал — статус ставит обработка,
 * и это сказано в строке движения, в истории и в уведомлении (правка 1).
 */
function ship(deliveryId: string, status: "shipped" | "in_transit") {
  const s = getState();
  const delivery = s.deliveries.find((item) => item.id === deliveryId);
  if (!delivery || !canMove(delivery.status, status)) return;
  const request = s.requests.find((item) => item.id === delivery.requestId);
  const supplierName =
    s.counterparties.find((item) => item.id === delivery.supplierId)?.name ?? "—";
  const at = tick();
  update((prev) => ({
    ...prev,
    deliveries: prev.deliveries.map((item) =>
      item.id === deliveryId ? { ...item, status } : item,
    ),
    deliveryChanges: [
      ...prev.deliveryChanges,
      {
        id: liveId("dsc"),
        deliveryId,
        status,
        at,
        actorKind: "system",
        actorId: null,
        note: DEMO_SHIPMENT_NOTE,
      },
    ],
    events: [
      ...prev.events,
      projectEvent(
        {
          projectId: delivery.projectId,
          type: "delivery_moved",
          title: `Поставка по запросу ${request?.number ?? "—"}: ${deliveryStatusLabel[status].toLowerCase()}`,
          details: DEMO_SHIPMENT_NOTE,
          requestId: delivery.requestId,
          deliveryId,
        },
        null,
      ),
    ],
  }));
  emitDemoEvent({
    kind: "shipment",
    areas: ["procurement", "projects", "timeline"],
    notice: {
      title: `Поставка «${supplierName}» отмечена «${deliveryStatusLabel[status].toLowerCase()}»`,
      description: `${DEMO_SHIPMENT_NOTE} ${delivery.items.length} поз., ожидается ${delivery.expectedAt.split("-").reverse().join(".")}.`,
    },
  });
}
