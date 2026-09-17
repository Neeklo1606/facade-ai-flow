import type { DemoEvent } from "@/adapters/demo";
import type {
  AskAgentInput,
  ChooseSupplierInput,
  CorrectPositionInput,
  CreateProjectInput,
  CreateRequestInput,
  ListChangesInput,
  ListDocumentsInput,
  ListPositionsInput,
  ListProjectsInput,
  MergePositionsInput,
  PositionFilterInput,
  Repositories,
  ReviewReportInput,
  SplitPositionInput,
  UndoReviewInput,
  UploadRevisionInput,
} from "@/ports";
import { CURRENT_USER_ID, dataSource } from "./config";
import * as fn from "./functions";
import { REGISTRY_EXPORT_PATH, registryExportQuery } from "./export-paths";

/**
 * Клиент данных для экранов. Одинаковые методы при любом источнике (ADR-004):
 * в демо — адаптер в браузере, в рабочем режиме — серверные функции.
 * Действующий сотрудник подставляется здесь (демо) или на сервере (рабочий режим).
 */

// Демо-адаптер с фикстурами грузится только в демо и только по первому обращению:
// в рабочем режиме его нет в стартовом бандле вкладки
let demoModule: Promise<typeof import("@/adapters/demo")> | null = null;
// Условие прямо здесь, а не через dataSource: сборка сворачивает сравнение констант и в режиме server
// выбрасывает import() вместе с чанком фикстур
const demoAdapter = () =>
  (demoModule ??=
    import.meta.env.VITE_DATA_SOURCE === "server"
      ? Promise.reject(new Error("Демо-адаптер недоступен в рабочем режиме"))
      : import("@/adapters/demo"));
let demo: Promise<Repositories> | null = null;
const local = () =>
  (demo ??= demoAdapter().then((module) => module.createDemoRepositories({ persist: true })));
const actor = { actorId: CURRENT_USER_ID };
const server = dataSource === "server";

export const api = {
  /** Действия, которые есть только в демо */
  demo: {
    reset: async () => {
      if (server) throw new Error("Сброс доступен только в демо-режиме");
      (await demoAdapter()).resetDemo();
    },
    /** События симулятора: ответ поставщика, стадия распознавания, заказ. В рабочем режиме их нет */
    onEvent: (listener: (event: DemoEvent) => void) => {
      if (server || typeof window === "undefined") return () => {};
      let unsubscribe: (() => void) | null = null;
      let cancelled = false;
      void Promise.all([demoAdapter(), local()]).then(([module]) => {
        if (!cancelled) unsubscribe = module.onDemoEvent(listener);
      });
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    },
  },
  clock: {
    now: () => (server ? fn.nowFn() : local().then((r) => r.clock.now())),
  },
  directory: {
    employees: () => (server ? fn.employeesFn() : local().then((r) => r.directory.employees())),
    counterparties: () =>
      server ? fn.counterpartiesFn() : local().then((r) => r.directory.counterparties()),
  },
  projects: {
    list: (data: ListProjectsInput = {}) =>
      server ? fn.projectsFn({ data }) : local().then((r) => r.projects.list(data)),
    /** Файл Excel: в рабочем режиме строит сервер, в демо — адаптер во вкладке (ADR-004) */
    exportRegistry: async (data: ListProjectsInput) => {
      if (!server) return local().then((r) => r.projects.exportRegistry(data));
      const response = await fetch(`${REGISTRY_EXPORT_PATH}?${registryExportQuery(data)}`);
      if (!response.ok) throw new Error(`Выгрузка не сформирована: ${response.status}`);
      return response.blob();
    },
    card: (id: string) =>
      server ? fn.projectCardFn({ data: { id } }) : local().then((r) => r.projects.card(id)),
    create: (data: CreateProjectInput) =>
      server ? fn.createProjectFn({ data }) : local().then((r) => r.projects.create(data, actor)),
  },
  documents: {
    list: (data: ListDocumentsInput) =>
      server ? fn.documentsFn({ data }) : local().then((r) => r.documents.list(data)),
    revisions: (id: string) =>
      server ? fn.revisionsFn({ data: { id } }) : local().then((r) => r.documents.revisions(id)),
    card: (id: string) =>
      server ? fn.documentCardFn({ data: { id } }) : local().then((r) => r.documents.card(id)),
    upload: (data: UploadRevisionInput) =>
      server ? fn.uploadFn({ data }) : local().then((r) => r.documents.upload(data, actor)),
    changes: (data: ListChangesInput) =>
      server ? fn.revisionChangesFn({ data }) : local().then((r) => r.documents.changes(data)),
  },
  positions: {
    list: (data: ListPositionsInput) =>
      server ? fn.positionsFn({ data }) : local().then((r) => r.positions.list(data)),
    facets: (data: PositionFilterInput) =>
      server ? fn.positionFacetsFn({ data }) : local().then((r) => r.positions.facets(data)),
    selection: (data: PositionFilterInput) =>
      server ? fn.positionSelectionFn({ data }) : local().then((r) => r.positions.selection(data)),
    item: (id: string) =>
      server ? fn.positionFn({ data: { id } }) : local().then((r) => r.positions.item(id)),
    confirmAutoVerified: (revisionId: string) =>
      server
        ? fn.confirmAutoVerifiedFn({ data: { revisionId } })
        : local().then((r) => r.positions.confirmAutoVerified({ revisionId }, actor)),
    history: (id: string) =>
      server
        ? fn.positionHistoryFn({ data: { id } })
        : local().then((r) => r.positions.history(id)),
    confirm: (ids: string[]) =>
      server
        ? fn.confirmFn({ data: { ids } })
        : local().then((r) => r.positions.confirm({ ids }, actor)),
    correct: (data: CorrectPositionInput) =>
      server
        ? fn.correctFn({ data }).then(() => undefined)
        : local().then((r) => r.positions.correct(data, actor)),
    exclude: (id: string) =>
      server
        ? fn.excludeFn({ data: { id } }).then(() => undefined)
        : local().then((r) => r.positions.exclude({ id }, actor)),
    markHeader: (id: string) =>
      server
        ? fn.markHeaderFn({ data: { id } }).then(() => undefined)
        : local().then((r) => r.positions.markHeader({ id }, actor)),
    reopen: (id: string) =>
      server
        ? fn.reopenFn({ data: { id } }).then(() => undefined)
        : local().then((r) => r.positions.reopen({ id }, actor)),
    undoReview: (data: UndoReviewInput) =>
      server ? fn.undoReviewFn({ data }) : local().then((r) => r.positions.undoReview(data, actor)),
    merge: (data: MergePositionsInput) =>
      server ? fn.mergeFn({ data }) : local().then((r) => r.positions.merge(data, actor)),
    split: (data: SplitPositionInput) =>
      server
        ? fn.splitFn({ data }).then(() => undefined)
        : local().then((r) => r.positions.split(data, actor)),
    handOver: (revisionId: string) =>
      server
        ? fn.handOverFn({ data: { revisionId } })
        : local().then((r) => r.positions.handOver({ revisionId }, actor)),
    materials: () => (server ? fn.materialsFn() : local().then((r) => r.positions.materials())),
    replacements: () =>
      server ? fn.replacementsFn() : local().then((r) => r.positions.replacements()),
  },
  procurement: {
    suppliers: () => (server ? fn.suppliersFn() : local().then((r) => r.procurement.suppliers())),
    verifyContact: (supplierId: string) =>
      server
        ? fn.verifyContactFn({ data: { supplierId } }).then(() => undefined)
        : local().then((r) => r.procurement.verifyContact({ supplierId }, actor)),
    templates: () => (server ? fn.templatesFn() : local().then((r) => r.procurement.templates())),
    requests: (projectId: string) =>
      server
        ? fn.requestsFn({ data: { projectId } })
        : local().then((r) => r.procurement.requests(projectId)),
    request: (id: string) =>
      server ? fn.requestCardFn({ data: { id } }) : local().then((r) => r.procurement.request(id)),
    createRequest: (data: CreateRequestInput) =>
      server
        ? fn.createRequestFn({ data })
        : local().then((r) => r.procurement.createRequest(data, actor)),
    remind: (requestId: string) =>
      server
        ? fn.remindFn({ data: { requestId } })
        : local().then((r) => r.procurement.remind({ requestId }, actor)),
    chooseSupplier: (data: ChooseSupplierInput) =>
      server
        ? fn.chooseSupplierFn({ data })
        : local().then((r) => r.procurement.chooseSupplier(data, actor)),
    deliveries: (projectId: string) =>
      server
        ? fn.deliveriesFn({ data: { projectId } })
        : local().then((r) => r.procurement.deliveries(projectId)),
  },
  reports: {
    list: (projectId: string) =>
      server
        ? fn.reportsFn({ data: { projectId } })
        : local().then((r) => r.reports.list(projectId)),
    review: (data: ReviewReportInput) =>
      server
        ? fn.reviewReportFn({ data }).then(() => undefined)
        : local().then((r) => r.reports.review(data, actor)),
    source: (id: string) =>
      server ? fn.sourceFn({ data: { id } }) : local().then((r) => r.reports.source(id)),
  },
  timeline: {
    list: (projectId: string) =>
      server
        ? fn.timelineFn({ data: { projectId } })
        : local().then((r) => r.timeline.list(projectId)),
    decisions: (projectId: string) =>
      server
        ? fn.decisionsFn({ data: { projectId } })
        : local().then((r) => r.timeline.decisions(projectId)),
    pending: (projectId: string) =>
      server
        ? fn.pendingDecisionsFn({ data: { projectId } })
        : local().then((r) => r.timeline.pending(projectId)),
  },
  agent: {
    ask: (data: AskAgentInput) =>
      server ? fn.askAgentFn({ data }) : local().then((r) => r.agent.ask(data)),
  },
};

export type Api = typeof api;
