import { isReadyForRequest, type ProjectDocument } from "@/contracts";
import { remarkKindLabel } from "@/contracts";
import {
  byAttention,
  handOverError,
  isAutoVerified,
  matchesFilter,
  positionFacets,
} from "@/domain/positions";
import { currentRevisions, projectOverview, revisionStats, revisionsOf } from "@/domain/overview";
import {
  answeredCount,
  compareOffers,
  decisionFor,
  decisionReasonError,
  replyDue,
  rfqStatus,
  supplierDecision,
} from "@/domain/procurement";
import { latestJob, visibleStage } from "@/domain/extraction";
import { registryColumns, registryRows, type RegistryFilter } from "@/domain/registry";
import { timelineOf } from "@/domain/timeline";
import { supplierStats } from "@/domain/catalog";
import { buildXlsx } from "@/adapters/export/xlsx";
import { createAgentPort } from "@/adapters/agent";
import {
  ConflictError,
  NotFoundError,
  listPositionsInput,
  positionFilter,
  type DocumentListItem,
  type PendingDecision,
  type Repositories,
  type RequestSummary,
} from "@/ports";
import * as actions from "./actions";
import { peek, resetClock, restoreClock } from "./clock";
import { disableSimulator, startSimulator, stopSimulator } from "./simulator";
import { rfqTemplates } from "@/domain/rfq-template";
import { getState, resetState, restoreState, type DemoState } from "./state";
import { enableStorage } from "./storage";

export { onDemoEvent, type DemoEvent, type DemoEventArea, type DemoState } from "./state";
export { runWithin, type DemoContext } from "./context";
export { setClockSource, type ClockSource } from "./clock";

/**
 * Демо-адаптер (ADR-004): порты поверх состояния демо — снимка фикстур, изменённого действиями
 * и симулятором событий. В браузере состояние и часы сохраняются во вкладке и переживают
 * перезагрузку; на сервере адаптер живёт в памяти процесса до появления PostgreSQL (фаза 3).
 */

export interface DemoOptions {
  /** Сохранять состояние во вкладке и поднимать его после перезагрузки — только в браузере */
  persist: boolean;
  /** Имитировать внешние события: распознавание, ответы поставщиков, отгрузку. По умолчанию — да */
  simulate?: boolean;
}

const done = <T>(value: T) => Promise.resolve(value);
/** Действие, которое проверяет правила и бросает ошибку порта: ошибка становится отказом промиса */
const attempt = <T>(fn: () => T): Promise<T> => {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(error);
  }
};

function documentItem(s: DemoState, document: ProjectDocument): DocumentListItem {
  const job = latestJob(s.extractionJobs, document.id);
  const stats = revisionStats(s.positions, document);
  return {
    document,
    extracted: stats.total,
    verified: stats.verified,
    loaded: stats.loaded,
    stage: visibleStage(job, peek()),
    job,
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
  const { columns, bestSupplierId } = compareOffers(s, request);
  const best = columns.find((column) => column.supplierId === bestSupplierId) ?? null;
  const now = peek();
  const status = rfqStatus(request, answeredCount(s.offers, request), Boolean(decision), now);
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
    status,
    replyDue: replyDue(request, status, now),
    decisionId: decision?.id ?? null,
  };
}

function registry(s: DemoState, filter: RegistryFilter) {
  const now = peek();
  return registryRows(
    s.projects.map((project) => ({ project, overview: projectOverview(s, project.id, now)! })),
    filter,
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
  if (options.simulate === false) disableSimulator();
  else startSimulator();
}

export function createDemoRepositories(options: DemoOptions): Repositories {
  start(options);
  const state = getState;

  const repositories: Repositories = {
    clock: {
      now: () => done(peek()),
    },

    directory: {
      employees: () => done(state().employees),
      counterparties: () =>
        done(state().counterparties.map(({ id, name, role }) => ({ id, name, role }))),
      saveEmployee: (input, actor) => attempt(() => actions.saveEmployee(input, actor.actorId)),
    },

    projects: {
      list: (input) => done(registry(state(), input ?? {})),
      exportRegistry: (input) => {
        const s = state();
        const employeeName = (id: string) =>
          s.employees.find((item) => item.id === id)?.name ?? "—";
        return buildXlsx(registryColumns(employeeName), registry(s, input));
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
      setStatus: (input, { actorId }) => attempt(() => actions.setProjectStatus(input, actorId)),
      completeMilestone: (input, { actorId }) =>
        attempt(() => actions.completeMilestone(input, actorId)),
      saveZone: (input, { actorId }) => attempt(() => actions.saveZone(input, actorId)),
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
          stage: visibleStage(latestJob(s.extractionJobs, revisionId), peek()),
          job: latestJob(s.extractionJobs, revisionId),
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
      resolveChange: (input, { actorId }) => attempt(() => actions.resolveChange(input, actorId)),
    },

    positions: {
      list: (input) => {
        const filter = listPositionsInput.parse(input);
        let items = state().positions.filter((item) => matchesFilter(item, filter));
        if (filter.order === "attention") items = [...items].sort(byAttention);
        const offset = Number(filter.cursor ?? 0);
        return done({
          items: items.slice(offset, offset + filter.limit),
          nextCursor: offset + filter.limit < items.length ? String(offset + filter.limit) : null,
          total: items.length,
        });
      },
      facets: (input) => done(positionFacets(state().positions, positionFilter.parse(input))),
      selection: (input) => {
        const filter = positionFilter.parse(input);
        return done(
          state()
            .positions.filter((item) => matchesFilter(item, filter))
            .map((item) => ({ id: item.id, ready: isReadyForRequest(item) })),
        );
      },
      item: (positionId) => done(state().positions.find((item) => item.id === positionId) ?? null),
      history: (positionId) =>
        done(
          state()
            .changes.filter((item) => item.positionId === positionId)
            .sort((a, b) => b.at.localeCompare(a.at)),
        ),
      confirm: ({ ids }, { actorId }) => done(actions.confirm(ids, actorId)),
      confirmAutoVerified: ({ revisionId }, { actorId }) =>
        done(
          actions.confirm(
            state()
              .positions.filter((item) => item.documentId === revisionId && isAutoVerified(item))
              .map((item) => item.id),
            actorId,
          ),
        ),
      correct: (input, { actorId }) => done(actions.correct(input, actorId)),
      // Заведение руками и загрузка спецификации (ADR-025): разбора файла нет
      create: (input, { actorId }) => attempt(() => actions.createPosition(input, actorId)),
      importSpec: (input, { actorId }) => attempt(() => actions.importSpec(input, actorId)),
      exclude: ({ id }, { actorId }) =>
        done(actions.setReview(id, "excluded", "Исключено из спецификации", actorId)),
      markHeader: ({ id }, { actorId }) =>
        done(actions.setReview(id, "header", "Отмечено как заголовок раздела", actorId)),
      reopen: ({ id }, { actorId }) => done(actions.reopen(id, actorId)).then(() => undefined),
      undoReview: ({ items }, { actorId }) => done(actions.undoReview(items, actorId)),
      merge: ({ sourceId, targetId }, { actorId }) =>
        done(actions.merge(sourceId, targetId, actorId)),
      split: ({ id, firstQty }, { actorId }) => done(actions.split(id, firstQty, actorId)),
      handOver: ({ revisionId }, { actorId }) =>
        attempt(() => {
          const problem = handOverError(
            state().positions.filter((item) => item.documentId === revisionId),
          );
          if (problem) throw new ConflictError(problem);
          return actions.handOver(revisionId, actorId);
        }),
      confirmMatch: (input, { actorId }) => attempt(() => actions.confirmMatch(input, actorId)),
      materials: () => done(state().materials),
      replacements: () => done(state().replacements),
    },

    procurement: {
      suppliers: () => {
        const s = state();
        const now = peek();
        return done(
          s.profiles.flatMap((profile) => {
            const supplier = s.counterparties.find((item) => item.id === profile.supplierId);
            return supplier
              ? [
                  {
                    supplier,
                    profile: actions.freshProfile(profile, now),
                    stats: supplierStats(supplier.id, s),
                  },
                ]
              : [];
          }),
        );
      },
      supplier: (supplierId) => done(actions.supplierCard(supplierId, peek())),
      verifyContact: ({ supplierId }) => done(actions.verifyContact(supplierId)),
      // Без шаблонов заказчика мастер запроса получает встроенный: он не должен зависеть
      // от фикстур демонстрации (ADR-025, поправка от 26.09.2026)
      templates: () => done(rfqTemplates(state().templates)),
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
          comparison: compareOffers(s, summary.request),
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
        // Неподтверждённое сопоставление не уходит поставщикам (ADR-014, п. 3): отказ с причиной,
        // а не молчаливый пропуск позиции
        const unmatched = s.positions.filter(
          (item) =>
            input.positionIds.includes(item.id) &&
            item.purchase === "none" &&
            item.matchStatus !== "confirmed",
        ).length;
        if (unmatched) {
          return Promise.reject(
            new ConflictError(
              `Сопоставление с материалом не подтверждено: ${unmatched} поз. Подтвердите его — без этого позиция не уходит поставщикам`,
            ),
          );
        }
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
      chooseSupplier: (input) => {
        const s = state();
        const request = s.requests.find((item) => item.id === input.requestId);
        if (!request) return Promise.reject(new NotFoundError("Запрос", input.requestId));
        const reasonProblem = decisionReasonError(input.reason);
        if (reasonProblem) return Promise.reject(new ConflictError(reasonProblem));
        if (!request.sentTo.includes(input.supplierId)) {
          return Promise.reject(new ConflictError("Поставщику не отправляли этот запрос"));
        }
        if (!s.employees.some((item) => item.id === input.approvedBy && item.status === "active")) {
          return Promise.reject(new ConflictError("Согласующий не найден среди сотрудников"));
        }
        if (decisionFor(s.decisions, request.id)) {
          return Promise.reject(new ConflictError("Решение по запросу уже зафиксировано"));
        }
        const comparison = compareOffers(s, request);
        if (!comparison.columns.some((c) => c.supplierId === input.supplierId && c.offerId)) {
          return Promise.reject(new ConflictError("Поставщик не прислал предложение по запросу"));
        }
        const counterpartyName = (id: string) =>
          s.counterparties.find((item) => item.id === id)?.name ?? "—";
        return done(
          actions.recordDecision(
            supplierDecision({ ...input, request, comparison, supplierName: counterpartyName }),
          ),
        );
      },
      deliveries: (projectId) =>
        done(
          state()
            .deliveries.filter((item) => item.projectId === projectId)
            .sort((a, b) => b.expectedAt.localeCompare(a.expectedAt)),
        ),
      delivery: (deliveryId) => done(actions.deliveryCard(deliveryId)),
      moveDelivery: (input, { actorId }) => attempt(() => actions.moveDelivery(input, actorId)),
      acceptDelivery: (input, { actorId }) => attempt(() => actions.acceptDelivery(input, actorId)),
      resolveRemark: (input, { actorId }) => attempt(() => actions.resolveRemark(input, actorId)),
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
      create: (input, actor) => attempt(() => actions.createReport(input, actor.actorId)),
      review: (input) => attempt(() => actions.reviewReport(input)),
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
        // Поставка прибыла — её ждут на приёмке; открытое замечание — решение за снабжением.
        // И то и другое решается в продукте: приёмкой и закрытием замечания (ADR-011)
        const deliveries: PendingDecision[] = s.deliveries
          .filter((item) => item.projectId === projectId && item.status === "arrived")
          .map((item) => ({
            id: `delivery-${item.id}`,
            kind: "delivery",
            title: `Принять поставку: ${item.items.map((line) => line.name).join(", ")}`,
            details: `Прибыла на объект, ждёт приёмки: факт, входной контроль, фото`,
            link: `/projects/${projectId}/deliveries?delivery=${item.id}`,
          }));
        const remarks: PendingDecision[] = s.remarks
          .filter((item) => item.projectId === projectId && item.status === "open")
          .map((item) => ({
            id: `remark-${item.id}`,
            kind: "remark",
            title: `Замечание по поставке: ${remarkKindLabel[item.kind].toLowerCase()}`,
            details: item.text,
            link: `/projects/${projectId}/deliveries?delivery=${item.deliveryId}`,
          }));
        // Предложенные замены сюда не попадают: решить их в продукте пока нечем, а список
        // «ждёт решения» обещает именно решение (TASK-A2, п. 4). Замены видны в карточке
        // позиции как факт; согласование замены — блок B, тогда вернутся и сюда.
        return done([...remarks, ...deliveries, ...requests]);
      },
    },
    // Ассистент собирает ответы из портов выше, а не из состояния демо (ADR-006)
    catalog: {
      categories: () => done([...state().categories].sort((a, b) => a.sortOrder - b.sortOrder)),
      material: (materialId) => done(actions.materialCard(materialId)),
      catalogChanges: (limit = 100) =>
        done(
          // Свежие сверху. Две правки одной секунды по времени не различить, поэтому при равном
          // времени порядок обратный порядку записи: журнал append-only, и он и есть «позже»
          state()
            .catalogChanges.map((row, index) => ({ row, index }))
            .sort((a, b) => b.row.at.localeCompare(a.row.at) || b.index - a.index)
            .slice(0, Math.max(limit, 0))
            .map((item) => item.row),
        ),
      saveMaterial: (input, { actorId }) => attempt(() => actions.saveMaterial(input, actorId)),
      saveCategory: (input, { actorId }) => attempt(() => actions.saveCategory(input, actorId)),
      saveSupplier: (input, { actorId }) => attempt(() => actions.saveSupplier(input, actorId)),
      importMaterials: (input, { actorId }) =>
        attempt(() => actions.importMaterials(input, actorId)),
    },

    scope: {
      projectsOf: (employeeId) => {
        const s = state();
        const member = s.employees.find((item) => item.id === employeeId)?.projectIds ?? [];
        const foreman = s.crews
          .filter((item) => item.foremanId === employeeId)
          .map((item) => item.projectId);
        return done([...new Set([...member, ...foreman])]);
      },
      projectOf: (kind, id) => {
        const s = state();
        const of = (rows: { id: string; projectId: string | null }[]) =>
          rows.find((item) => item.id === id)?.projectId ?? null;
        switch (kind) {
          case "report":
            return done(of(s.reports));
          case "source":
            return done(of(s.sources));
          case "position":
            return done(of(s.positions));
          case "revision":
            return done(of(s.documents));
          case "document":
            return done(s.documents.find((item) => item.documentId === id)?.projectId ?? null);
          case "request":
            return done(of(s.requests));
          case "delivery":
            return done(of(s.deliveries));
          case "remark": {
            const deliveryId = s.remarks.find((item) => item.id === id)?.deliveryId;
            return done(s.deliveries.find((item) => item.id === deliveryId)?.projectId ?? null);
          }
        }
      },
    },

    agent: { ask: (input) => createAgentPort(repositories).ask(input) },
  };
  return repositories;
}

/** Сброс демо: остановить симулятор, вернуть стартовые данные, часы и очистить сохранение */
export function resetDemo() {
  stopSimulator();
  resetClock();
  resetState();
}
