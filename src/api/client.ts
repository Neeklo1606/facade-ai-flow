import { createDemoRepositories, onDemoEvent, resetDemo, type DemoEvent } from "@/adapters/demo";
import type {
  CorrectPositionInput,
  CreateProjectInput,
  CreateRequestInput,
  ListChangesInput,
  ListDocumentsInput,
  ListPositionsInput,
  MergePositionsInput,
  RecordDecisionInput,
  Repositories,
  RestoreReviewInput,
  ReviewReportInput,
  SplitPositionInput,
  UploadRevisionInput,
} from "@/ports";
import { CURRENT_USER_ID, dataSource } from "./config";
import * as fn from "./functions";

/**
 * Клиент данных для экранов. Одинаковые методы при любом источнике (ADR-004):
 * в демо — адаптер в браузере, в рабочем режиме — серверные функции.
 * Действующий сотрудник подставляется здесь (демо) или на сервере (рабочий режим).
 */

let demo: Repositories | null = null;
const local = () => (demo ??= createDemoRepositories({ persist: true }));
const actor = { actorId: CURRENT_USER_ID };
const server = dataSource === "server";

export const api = {
  /** Действия, которые есть только в демо */
  demo: {
    reset: () => {
      if (server) throw new Error("Сброс доступен только в демо-режиме");
      resetDemo();
    },
    /** События симулятора: ответ поставщика, стадия распознавания, заказ. В рабочем режиме их нет */
    onEvent: (listener: (event: DemoEvent) => void) => {
      if (server || typeof window === "undefined") return () => {};
      local();
      return onDemoEvent(listener);
    },
  },
  clock: {
    now: () => (server ? fn.nowFn() : local().clock.now()),
  },
  directory: {
    employees: () => (server ? fn.employeesFn() : local().directory.employees()),
    counterparties: () => (server ? fn.counterpartiesFn() : local().directory.counterparties()),
  },
  projects: {
    list: () => (server ? fn.projectsFn() : local().projects.list()),
    card: (id: string) => (server ? fn.projectCardFn({ data: { id } }) : local().projects.card(id)),
    create: (data: CreateProjectInput) =>
      server ? fn.createProjectFn({ data }) : local().projects.create(data, actor),
  },
  documents: {
    list: (data: ListDocumentsInput) =>
      server ? fn.documentsFn({ data }) : local().documents.list(data),
    revisions: (id: string) =>
      server ? fn.revisionsFn({ data: { id } }) : local().documents.revisions(id),
    card: (id: string) =>
      server ? fn.documentCardFn({ data: { id } }) : local().documents.card(id),
    upload: (data: UploadRevisionInput) =>
      server ? fn.uploadFn({ data }) : local().documents.upload(data, actor),
    changes: (data: ListChangesInput) =>
      server ? fn.revisionChangesFn({ data }) : local().documents.changes(data),
  },
  positions: {
    list: (data: ListPositionsInput) =>
      server ? fn.positionsFn({ data }) : local().positions.list(data),
    history: (id: string) =>
      server ? fn.positionHistoryFn({ data: { id } }) : local().positions.history(id),
    confirm: (ids: string[]) =>
      server ? fn.confirmFn({ data: { ids } }) : local().positions.confirm({ ids }, actor),
    correct: (data: CorrectPositionInput) =>
      server
        ? fn.correctFn({ data }).then(() => undefined)
        : local().positions.correct(data, actor),
    exclude: (id: string) =>
      server
        ? fn.excludeFn({ data: { id } }).then(() => undefined)
        : local().positions.exclude({ id }, actor),
    markHeader: (id: string) =>
      server
        ? fn.markHeaderFn({ data: { id } }).then(() => undefined)
        : local().positions.markHeader({ id }, actor),
    reopen: (id: string) =>
      server
        ? fn.reopenFn({ data: { id } }).then(() => undefined)
        : local().positions.reopen({ id }, actor),
    restoreReview: (data: RestoreReviewInput) =>
      server
        ? fn.restoreReviewFn({ data }).then(() => undefined)
        : local().positions.restoreReview(data, actor),
    merge: (data: MergePositionsInput) =>
      server ? fn.mergeFn({ data }) : local().positions.merge(data, actor),
    split: (data: SplitPositionInput) =>
      server ? fn.splitFn({ data }).then(() => undefined) : local().positions.split(data, actor),
    handOver: (revisionId: string) =>
      server
        ? fn.handOverFn({ data: { revisionId } })
        : local().positions.handOver({ revisionId }, actor),
    materials: () => (server ? fn.materialsFn() : local().positions.materials()),
    replacements: () => (server ? fn.replacementsFn() : local().positions.replacements()),
  },
  procurement: {
    suppliers: () => (server ? fn.suppliersFn() : local().procurement.suppliers()),
    verifyContact: (supplierId: string) =>
      server
        ? fn.verifyContactFn({ data: { supplierId } }).then(() => undefined)
        : local().procurement.verifyContact({ supplierId }, actor),
    templates: () => (server ? fn.templatesFn() : local().procurement.templates()),
    requests: (projectId: string) =>
      server ? fn.requestsFn({ data: { projectId } }) : local().procurement.requests(projectId),
    request: (id: string) =>
      server ? fn.requestCardFn({ data: { id } }) : local().procurement.request(id),
    createRequest: (data: CreateRequestInput) =>
      server ? fn.createRequestFn({ data }) : local().procurement.createRequest(data, actor),
    remind: (requestId: string) =>
      server
        ? fn.remindFn({ data: { requestId } })
        : local().procurement.remind({ requestId }, actor),
    recordDecision: (data: RecordDecisionInput) =>
      server ? fn.recordDecisionFn({ data }) : local().procurement.recordDecision(data, actor),
    deliveries: (projectId: string) =>
      server ? fn.deliveriesFn({ data: { projectId } }) : local().procurement.deliveries(projectId),
  },
  reports: {
    list: (projectId: string) =>
      server ? fn.reportsFn({ data: { projectId } }) : local().reports.list(projectId),
    review: (data: ReviewReportInput) =>
      server
        ? fn.reviewReportFn({ data }).then(() => undefined)
        : local().reports.review(data, actor),
    source: (id: string) => (server ? fn.sourceFn({ data: { id } }) : local().reports.source(id)),
  },
  timeline: {
    list: (projectId: string) =>
      server ? fn.timelineFn({ data: { projectId } }) : local().timeline.list(projectId),
    decisions: (projectId: string) =>
      server ? fn.decisionsFn({ data: { projectId } }) : local().timeline.decisions(projectId),
    pending: (projectId: string) =>
      server ? fn.pendingDecisionsFn({ data: { projectId } }) : local().timeline.pending(projectId),
  },
};

export type Api = typeof api;
