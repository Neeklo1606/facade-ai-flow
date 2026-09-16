import {
  isActivePosition,
  isVerifiedPosition,
  type ExtractedPosition,
  type ProjectDocument,
} from "@/contracts";
import { currentRevisions, projectOverview, revisionStats, revisionsOf } from "@/domain/overview";
import { answeredCount, compareOffers, decisionFor, rfqStatus } from "@/domain/procurement";
import { timelineOf } from "@/domain/timeline";
import {
  ConflictError,
  NotFoundError,
  type DocumentListItem,
  type PendingDecision,
  type Repositories,
  type RequestSummary,
} from "@/ports";
import * as actions from "./actions";
import { peek, resetClock, restoreClock } from "./clock";
import { startSimulator, stopSimulator } from "./simulator";
import { getState, resetState, restoreState, type DemoState } from "./state";
import { enableStorage } from "./storage";

export { onDemoEvent, type DemoEvent, type DemoEventArea } from "./state";

/**
 * Демо-адаптер (ADR-004): порты поверх состояния демо — снимка фикстур, изменённого действиями
 * и симулятором событий. В браузере состояние и часы сохраняются во вкладке и переживают
 * перезагрузку; на сервере адаптер живёт в памяти процесса до появления PostgreSQL (фаза 3).
 */

export interface DemoOptions {
  /** Сохранять состояние во вкладке и поднимать его после перезагрузки — только в браузере */
  persist: boolean;
}

const done = <T>(value: T) => Promise.resolve(value);

function documentItem(s: DemoState, document: ProjectDocument): DocumentListItem {
  const stats = revisionStats(s.positions, document);
  return {
    document,
    extracted: stats.total,
    verified: stats.verified,
    loaded: stats.loaded,
    stage: s.uploads[document.id] ?? null,
  };
}

/** Ответ поставщика ещё в пути: симулятор пришлёт его позже */
function awaitingReply(s: DemoState, requestId: string, supplierId: string) {
  return s.jobs.some(
    (job) => job.kind === "reply" && job.requestId === requestId && job.supplierId === supplierId,
  );
}

function requestSummary(s: DemoState, requestId: string): RequestSummary | null {
  const request = s.requests.find((item) => item.id === requestId);
  if (!request) return null;
  const decision = decisionFor(s.decisions, request.id);
  const { best } = compareOffers(s, request);
  const answeredBy = request.sentTo.filter((supplierId) =>
    s.offers.some((offer) => offer.requestId === request.id && offer.supplierId === supplierId),
  );
  return {
    request,
    answered: answeredCount(s.offers, request),
    answeredBy,
    awaiting: request.sentTo.filter(
      (supplierId) => !answeredBy.includes(supplierId) && awaitingReply(s, request.id, supplierId),
    ),
    bestSupplierId: best?.supplierId ?? null,
    bestTotal: best?.total ?? null,
    status: rfqStatus(request, answeredCount(s.offers, request), Boolean(decision), peek()),
    decisionId: decision?.id ?? null,
  };
}

const levelWeight = (confidence: number) => (confidence >= 0.85 ? 2 : confidence >= 0.7 ? 1 : 0);

function byAttention(a: ExtractedPosition, b: ExtractedPosition) {
  return (
    Number(isVerifiedPosition(a)) - Number(isVerifiedPosition(b)) ||
    levelWeight(a.confidence) - levelWeight(b.confidence)
  );
}

/** Когда проверенные позиции ревизии переданы в закупку: время последней передачи */
function handedOverAt(s: DemoState, revisionId: string) {
  return s.positions
    .filter((item) => item.documentId === revisionId && item.handedOverAt)
    .reduce<string | null>(
      (acc, item) => (!acc || item.handedOverAt! > acc ? item.handedOverAt : acc),
      null,
    );
}

let started = false;

/** Один раз на среду выполнения: поднять сохранение вкладки и продолжить отложенные события */
function start(options: DemoOptions) {
  if (started) return;
  started = true;
  if (options.persist && typeof window !== "undefined") {
    enableStorage();
    restoreClock();
    restoreState();
  }
  startSimulator();
}

export function createDemoRepositories(options: DemoOptions): Repositories {
  start(options);
  const state = getState;

  return {
    clock: {
      now: () => done(peek()),
    },

    directory: {
      employees: () => done(state().employees),
      counterparties: () => done(state().counterparties),
    },

    projects: {
      list: () => {
        const s = state();
        return done(
          s.projects.map((project) => ({
            project,
            overview: projectOverview(s, project.id, peek())!,
          })),
        );
      },
      card: (projectId) => {
        const s = state();
        const project = s.projects.find((item) => item.id === projectId);
        if (!project) return done(null);
        return done({
          project,
          overview: projectOverview(s, projectId, peek())!,
          contract: s.contracts.find((item) => item.projectId === projectId) ?? null,
          milestones: s.milestones
            .filter((item) => item.projectId === projectId)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
          zones: s.zones.filter((item) => item.projectId === projectId),
          crews: s.crews.filter((item) => item.projectId === projectId),
          team: s.employees.filter((item) => item.projectIds.includes(projectId)),
        });
      },
      create: (input) => {
        if (state().projects.some((item) => item.code === input.code)) {
          return Promise.reject(new ConflictError(`Объект с кодом ${input.code} уже есть`));
        }
        return done(actions.createProject(input));
      },
    },

    documents: {
      list: ({ projectId }) => {
        const s = state();
        return done(currentRevisions(s.documents, projectId).map((doc) => documentItem(s, doc)));
      },
      revisions: (documentId) => {
        const s = state();
        return done(revisionsOf(s.documents, documentId).map((doc) => documentItem(s, doc)));
      },
      card: (revisionId) => {
        const s = state();
        const document = s.documents.find((item) => item.id === revisionId);
        if (!document) return done(null);
        return done({
          document,
          sheets: s.sheets
            .filter((sheet) => sheet.documentId === revisionId)
            .sort((a, b) => a.number - b.number),
          handedOverAt: handedOverAt(s, revisionId),
          stage: s.uploads[revisionId] ?? null,
        });
      },
      upload: (input, { actorId }) => done(actions.upload(input, actorId)),
      changes: ({ projectId, status }) => {
        const s = state();
        const documentIds = new Set(
          s.documents.filter((item) => item.projectId === projectId).map((item) => item.documentId),
        );
        return done(
          s.revisionChanges.filter(
            (item) => documentIds.has(item.documentId) && (!status || item.status === status),
          ),
        );
      },
    },

    positions: {
      list: (input) => {
        const s = state();
        let items = s.positions.filter(
          (item) =>
            (!input.projectId || item.projectId === input.projectId) &&
            (!input.revisionId || item.documentId === input.revisionId) &&
            (!input.review || input.review.includes(item.review)) &&
            (!input.purchase || input.purchase.includes(item.purchase)),
        );
        if (input.order === "attention") {
          items = items.filter(isActivePosition).sort(byAttention);
        }
        const offset = Number(input.cursor ?? 0);
        const limit = input.limit ?? 100;
        return done({
          items: items.slice(offset, offset + limit),
          nextCursor: offset + limit < items.length ? String(offset + limit) : null,
          total: items.length,
        });
      },
      history: (positionId) =>
        done(
          state()
            .changes.filter((item) => item.positionId === positionId)
            .sort((a, b) => b.at.localeCompare(a.at)),
        ),
      confirm: ({ ids }, { actorId }) => done(actions.confirm(ids, actorId)),
      correct: (input, { actorId }) => done(actions.correct(input, actorId)),
      exclude: ({ id }, { actorId }) =>
        done(actions.setReview(id, "excluded", "Исключено из спецификации", actorId)),
      markHeader: ({ id }, { actorId }) =>
        done(actions.setReview(id, "header", "Отмечено как заголовок раздела", actorId)),
      reopen: ({ id }, { actorId }) => done(actions.reopen(id, actorId)),
      undoReview: ({ items }, { actorId }) => done(actions.undoReview(items, actorId)),
      merge: ({ sourceId, targetId }, { actorId }) =>
        done(actions.merge(sourceId, targetId, actorId)),
      split: ({ id, firstQty }, { actorId }) => done(actions.split(id, firstQty, actorId)),
      handOver: ({ revisionId }, { actorId }) => done(actions.handOver(revisionId, actorId)),
      materials: () => done(state().materials),
      replacements: () => done(state().replacements),
    },

    procurement: {
      suppliers: () => {
        const s = state();
        return done(
          s.profiles.flatMap((profile) => {
            const supplier = s.counterparties.find((item) => item.id === profile.supplierId);
            return supplier ? [{ supplier, profile }] : [];
          }),
        );
      },
      verifyContact: ({ supplierId }) => done(actions.verifyContact(supplierId)),
      templates: () => done(state().templates),
      requests: (projectId) => {
        const s = state();
        return done(
          s.requests
            .filter((item) => item.projectId === projectId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((item) => requestSummary(s, item.id)!),
        );
      },
      request: (requestId) => {
        const s = state();
        const summary = requestSummary(s, requestId);
        if (!summary) return done(null);
        const offers = s.offers.filter((item) => item.requestId === requestId);
        const offerIds = new Set(offers.map((item) => item.id));
        return done({
          summary,
          recipients: summary.request.sentTo.map((supplierId) => ({
            supplierId,
            remindedAt: awaitingReply(s, requestId, supplierId) ? peek() : null,
          })),
          offers,
          lines: s.offerLines.filter((item) => offerIds.has(item.offerId)),
          decision: decisionFor(s.decisions, requestId),
        });
      },
      createRequest: (input, { actorId }) => {
        const s = state();
        if (!s.projects.some((item) => item.id === input.projectId)) {
          return Promise.reject(new NotFoundError("Объект", input.projectId));
        }
        const foreign = s.positions.some(
          (item) => input.positionIds.includes(item.id) && item.projectId !== input.projectId,
        );
        if (foreign)
          return Promise.reject(new ConflictError("Позиции относятся к другому объекту"));
        const unknownSupplier = input.supplierIds.find(
          (id) => !s.profiles.some((item) => item.supplierId === id),
        );
        if (unknownSupplier) return Promise.reject(new NotFoundError("Поставщик", unknownSupplier));
        const result = actions.createRequest(input, actorId);
        if (!result) return Promise.reject(new ConflictError("Нет позиций, готовых к запросу"));
        return done(result);
      },
      remind: ({ requestId }) => {
        if (!state().requests.some((item) => item.id === requestId)) {
          return Promise.reject(new NotFoundError("Запрос", requestId));
        }
        return done({ reminded: actions.remind(requestId) });
      },
      recordDecision: (input) => {
        const s = state();
        if (!s.projects.some((item) => item.id === input.projectId)) {
          return Promise.reject(new NotFoundError("Объект", input.projectId));
        }
        if (!s.employees.some((item) => item.id === input.approvedBy && item.status === "active")) {
          return Promise.reject(new ConflictError("Согласующий не найден среди сотрудников"));
        }
        const request = input.requestId
          ? s.requests.find((item) => item.id === input.requestId)
          : null;
        if (input.requestId && !request) {
          return Promise.reject(new NotFoundError("Запрос", input.requestId));
        }
        if (request && request.projectId !== input.projectId) {
          return Promise.reject(new ConflictError("Запрос относится к другому объекту"));
        }
        if (input.supplierId && request && !request.sentTo.includes(input.supplierId)) {
          return Promise.reject(new ConflictError("Поставщику не отправляли этот запрос"));
        }
        if (input.requestId && decisionFor(s.decisions, input.requestId)) {
          return Promise.reject(new ConflictError("Решение по запросу уже зафиксировано"));
        }
        return done(actions.recordDecision(input));
      },
      deliveries: (projectId) =>
        done(
          state()
            .deliveries.filter((item) => item.projectId === projectId)
            .sort((a, b) => b.expectedAt.localeCompare(a.expectedAt)),
        ),
    },

    reports: {
      list: (projectId) => {
        const s = state();
        return done(
          s.reports
            .filter((item) => item.projectId === projectId)
            .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
            .map((report) => ({
              report,
              source: s.sources.find((item) => item.id === report.sourceId) ?? null,
              evidence: s.evidence.filter((item) => report.evidenceIds.includes(item.id)),
              extractions: s.extractions.filter((item) => item.sourceId === report.sourceId),
            })),
        );
      },
      review: (input) => done(actions.reviewReport(input)),
      source: (sourceId) => {
        const s = state();
        const source = s.sources.find((item) => item.id === sourceId);
        if (!source) return done(null);
        return done({
          source,
          extractions: s.extractions.filter((item) => item.sourceId === sourceId),
          decisions: s.decisions.filter((item) => item.basisSourceId === sourceId),
        });
      },
    },

    timeline: {
      list: (projectId) => done(timelineOf(state(), projectId)),
      decisions: (projectId) =>
        done(
          state()
            .decisions.filter((item) => item.projectId === projectId)
            .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt)),
        ),
      pending: (projectId) => {
        const s = state();
        const requests: PendingDecision[] = s.requests
          .filter((request) => request.projectId === projectId)
          .map((request) => requestSummary(s, request.id)!)
          .filter((summary) => summary.status === "ready")
          .map(({ request }) => ({
            id: request.id,
            kind: "request",
            title: `Выбрать поставщика по запросу ${request.number}`,
            details: `Ответили все ${request.sentTo.length}: ${request.items.map((item) => item.name).join(", ")}`,
            link: `/projects/${projectId}/procurement/${request.id}`,
          }));
        const families = new Set(
          s.positions.filter((item) => item.projectId === projectId).map((item) => item.family),
        );
        const replacements: PendingDecision[] = s.replacements
          .filter((item) => item.status === "proposed" && families.has(item.family))
          .map((item) => ({
            id: item.id,
            kind: "replacement",
            title: `Замена: ${item.name}`,
            details: `${item.reason} · цена ${item.priceDeltaPct > 0 ? "+" : ""}${item.priceDeltaPct}%`,
            link: `/projects/${projectId}/materials`,
          }));
        return done([...requests, ...replacements]);
      },
    },
  };
}

/** Сброс демо: остановить симулятор, вернуть стартовые данные, часы и очистить сохранение */
export function resetDemo() {
  stopSimulator();
  resetClock();
  resetState();
}
