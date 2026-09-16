import {
  isActivePosition,
  isVerifiedPosition,
  type ExtractedPosition,
  type ProjectDocument,
} from "@/contracts";
import { currentRevisions, revisionStats, revisionsOf } from "@/domain/overview";
import { answeredCount, compareOffers, decisionFor, rfqStatus } from "@/domain/procurement";
import { timelineOf } from "@/domain/timeline";
import {
  demoNow,
  getSpecState,
  handedOverAt,
  overviewOf,
  specActions,
  type SpecState,
} from "@/lib/spec-store";
import {
  ConflictError,
  NotFoundError,
  type DocumentListItem,
  type PendingDecision,
  type Repositories,
  type RequestSummary,
} from "@/ports";

/**
 * Демо-адаптер: порты поверх состояния демо в браузере (ADR-004).
 * На этом шаге (P2-1) он читает и меняет хранилище lib/spec-store; в P2-6 состояние,
 * часы и симулятор событий переезжают внутрь адаптера, а хранилище удаляется.
 */

const done = <T>(value: T) => Promise.resolve(value);

function documentItem(s: SpecState, document: ProjectDocument): DocumentListItem {
  const stats = revisionStats(s.positions, document);
  const upload = s.uploads[document.id];
  return {
    document,
    extracted: stats.total,
    verified: stats.verified,
    loaded: stats.loaded,
    stage: upload ? upload.stage : null,
  };
}

function requestSummary(s: SpecState, requestId: string): RequestSummary | null {
  const request = s.requests.find((item) => item.id === requestId);
  if (!request) return null;
  const decision = decisionFor(s.decisions, request.id);
  const { best } = compareOffers(s, request);
  return {
    request,
    answered: answeredCount(s.offers, request),
    bestSupplierId: best?.supplierId ?? null,
    bestTotal: best?.total ?? null,
    status: rfqStatus(request, answeredCount(s.offers, request), Boolean(decision), demoNow()),
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

export function createDemoRepositories(): Repositories {
  const state = getSpecState;

  return {
    directory: {
      employees: () => done(state().employees),
      counterparties: () => done(state().counterparties),
    },

    projects: {
      list: () => {
        const s = state();
        return done(
          s.projects.map((project) => ({ project, overview: overviewOf(s, project.id)! })),
        );
      },
      card: (projectId) => {
        const s = state();
        const project = s.projects.find((item) => item.id === projectId);
        if (!project) return done(null);
        return done({
          project,
          overview: overviewOf(s, projectId)!,
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
        const id = specActions.createProject({
          name: input.name,
          code: input.code,
          region: input.region,
          customer: input.customer,
          contract: input.contractNumber,
          startDate: input.startDate,
          endDate: input.endDate,
          manager: input.managerId,
        });
        return done(state().projects.find((item) => item.id === id)!);
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
          stage: s.uploads[revisionId]?.stage ?? null,
        });
      },
      upload: (input) => {
        const id = specActions.upload(input.projectId, {
          name: input.fileName,
          size: input.sizeKb * 1024,
        });
        return done(state().documents.find((item) => item.id === id)!);
      },
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
        const page = items.slice(offset, offset + limit);
        return done({
          items: page,
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
      confirm: ({ ids }) => done(specActions.confirm(ids)),
      correct: ({ id, ...patch }) => done(specActions.correct(id, patch)),
      exclude: ({ id }) => done(specActions.exclude(id)),
      markHeader: ({ id }) => done(specActions.markHeader(id)),
      reopen: ({ id }) => done(specActions.reopen(id)),
      restoreReview: ({ items }) => {
        const current = new Map(state().positions.map((item) => [item.id, item]));
        specActions.restore(
          items.flatMap((item) => {
            const position = current.get(item.id);
            return position ? [{ ...position, ...item }] : [];
          }),
        );
        return done(undefined);
      },
      merge: ({ sourceId, targetId }) => done(specActions.merge(sourceId, targetId)),
      split: ({ id, firstQty }) => done(specActions.split(id, firstQty)),
      handOver: ({ revisionId }) => done(specActions.sendToProcurement(revisionId)),
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
      verifyContact: ({ supplierId }) => done(specActions.verifyContact(supplierId)),
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
            remindedAt: s.pendingReplies.some(
              (item) => item.requestId === requestId && item.supplierId === supplierId,
            )
              ? demoNow()
              : null,
          })),
          offers,
          lines: s.offerLines.filter((item) => offerIds.has(item.offerId)),
          decision: decisionFor(s.decisions, requestId),
        });
      },
      createRequest: (input) => {
        const result = specActions.createRequest(
          input.projectId,
          input.positionIds,
          input.supplierIds,
          {
            ...(input.templateId ? { templateId: input.templateId } : {}),
            replyDueAt: input.replyDueAt,
          },
        );
        if (!result) return Promise.reject(new ConflictError("Нет позиций, готовых к запросу"));
        return done({ request: result.request, positions: result.count });
      },
      remind: ({ requestId }) => {
        const s = state();
        const request = s.requests.find((item) => item.id === requestId);
        if (!request) return Promise.reject(new NotFoundError("Запрос", requestId));
        const silent = request.sentTo.filter(
          (supplierId) =>
            !s.offers.some((o) => o.requestId === requestId && o.supplierId === supplierId) &&
            !s.pendingReplies.some((p) => p.requestId === requestId && p.supplierId === supplierId),
        );
        specActions.remindSuppliers(requestId);
        return done({ reminded: silent });
      },
      recordDecision: (input) => {
        if (input.requestId && decisionFor(state().decisions, input.requestId)) {
          return Promise.reject(new ConflictError("Решение по запросу уже зафиксировано"));
        }
        return done(specActions.recordDecision(input));
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
              evidence: s.evidence.filter((item) => report.evidenceIds.includes(item.id)),
              extractions: s.extractions.filter((item) => item.sourceId === report.sourceId),
            })),
        );
      },
      review: ({ id, status, acceptedQty }) =>
        done(specActions.reviewReport(id, status, acceptedQty)),
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
