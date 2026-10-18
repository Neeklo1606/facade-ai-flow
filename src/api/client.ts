import type { DemoEvent } from "@/adapters/demo";
import type {
  AcceptDeliveryInput,
  AskAgentInput,
  CaptureInput,
  CreateMaterialRequestInput,
  DecideMaterialRequestInput,
  ShiftInput,
  ChooseSupplierInput,
  CorrectPositionInput,
  CreatePositionInput,
  ImportSpecInput,
  ConfirmMatchInput,
  SaveMaterialInput,
  CreateProjectInput,
  CreateRequestInput,
  CompleteMilestoneInput,
  SaveZoneInput,
  ResolveChangeInput,
  SetProjectStatusInput,
  ListChangesInput,
  ListDocumentsInput,
  ListPositionsInput,
  ListProjectsInput,
  MergePositionsInput,
  MoveDeliveryInput,
  ResolveRemarkInput,
  PositionFilterInput,
  Repositories,
  CreateReportInput,
  ImportMaterialsInput,
  SaveCategoryInput,
  SaveEmployeeInput,
  SaveSupplierInput,
  ReviewReportInput,
  SplitPositionInput,
  UndoReviewInput,
  UploadRevisionInput,
} from "@/ports";
import { guardRepositories, sessionFor } from "@/adapters/access";
import type { AccessSession } from "@/domain/access";
import { FORBIDDEN_MESSAGE } from "@/ports";
import { currentUserId, dataSource, type DEMO_PERSONAS } from "./config";
import * as fn from "./functions";
import { captureFactFn, extractFactFn } from "./ai";
import { createRequestFn, decideRequestFn, requestsFn, retractRequestFn, shiftFn } from "./supply";
import { SHIFT_EXPORT_PATH } from "./export-paths";
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
const inner = () =>
  (demo ??= demoAdapter().then((module) => module.createDemoRepositories({ persist: true })));
/** Сессия демо: персона вкладки, её роль и объекты — по тем же правилам, что на сервере */
const demoSession = () => inner().then((repos) => sessionFor(repos, currentUserId()));
// Права в демо проверяет та же обёртка, что на сервере (ADR-012): данные живут во вкладке,
// и запрет срабатывает там же, где данные
let guarded: Promise<Repositories> | null = null;
const local = () => (guarded ??= inner().then((repos) => guardRepositories(repos, demoSession)));
/** Кто выполняет действие: в демо — выбранная персона, иначе сотрудник по умолчанию */
const actor = () => ({ actorId: currentUserId() });
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
  /** Кто вошёл: сотрудник, роль, объекты. В рабочем режиме — из подписанной сессии сервера */
  session: (): Promise<AccessSession | null> =>
    server ? (fn.sessionFn() as Promise<AccessSession | null>) : demoSession(),
  /** Вход за персону демонстрации: на сервере — подписанная cookie, в демо — персона вкладки */
  /*
   * Подписанная кука персоны выдаётся в обоих контурах: в демонстрации данные живут во вкладке,
   * но серверные проверки (кабинет компании, ADR-039) должны знать роль, а не угадывать её.
   */
  signIn: async (personaId: (typeof DEMO_PERSONAS)[number]) => {
    await fn.signInFn({ data: { personaId } });
  },
  clock: {
    now: () => (server ? fn.nowFn() : local().then((r) => r.clock.now())),
  },
  directory: {
    employees: () => (server ? fn.employeesFn() : local().then((r) => r.directory.employees())),
    counterparties: () =>
      server ? fn.counterpartiesFn() : local().then((r) => r.directory.counterparties()),
    saveEmployee: (data: SaveEmployeeInput) =>
      server
        ? fn.saveEmployeeFn({ data })
        : local().then((r) => r.directory.saveEmployee(data, actor())),
  },
  projects: {
    list: (data: ListProjectsInput = {}) =>
      server ? fn.projectsFn({ data }) : local().then((r) => r.projects.list(data)),
    /** Файл Excel: в рабочем режиме строит сервер, в демо — адаптер во вкладке (ADR-004) */
    exportRegistry: async (data: ListProjectsInput) => {
      if (!server) return local().then((r) => r.projects.exportRegistry(data));
      const response = await fetch(`${REGISTRY_EXPORT_PATH}?${registryExportQuery(data)}`);
      if (response.status === 403) throw new Error(FORBIDDEN_MESSAGE);
      if (!response.ok) throw new Error(`Выгрузка не сформирована: ${response.status}`);
      return response.blob();
    },
    card: (id: string) =>
      server ? fn.projectCardFn({ data: { id } }) : local().then((r) => r.projects.card(id)),
    create: (data: CreateProjectInput) =>
      server ? fn.createProjectFn({ data }) : local().then((r) => r.projects.create(data, actor())),
    setStatus: (data: SetProjectStatusInput) =>
      server
        ? fn.setProjectStatusFn({ data })
        : local().then((r) => r.projects.setStatus(data, actor())),
    saveZone: (data: SaveZoneInput) =>
      server ? fn.saveZoneFn({ data }) : local().then((r) => r.projects.saveZone(data, actor())),
    completeMilestone: (data: CompleteMilestoneInput) =>
      server
        ? fn.completeMilestoneFn({ data })
        : local().then((r) => r.projects.completeMilestone(data, actor())),
  },
  documents: {
    list: (data: ListDocumentsInput) =>
      server ? fn.documentsFn({ data }) : local().then((r) => r.documents.list(data)),
    revisions: (id: string) =>
      server ? fn.revisionsFn({ data: { id } }) : local().then((r) => r.documents.revisions(id)),
    card: (id: string) =>
      server ? fn.documentCardFn({ data: { id } }) : local().then((r) => r.documents.card(id)),
    upload: (data: UploadRevisionInput) =>
      server ? fn.uploadFn({ data }) : local().then((r) => r.documents.upload(data, actor())),
    changes: (data: ListChangesInput) =>
      server ? fn.revisionChangesFn({ data }) : local().then((r) => r.documents.changes(data)),
    resolveChange: (data: ResolveChangeInput) =>
      server
        ? fn.resolveChangeFn({ data })
        : local().then((r) => r.documents.resolveChange(data, actor())),
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
        : local().then((r) => r.positions.confirmAutoVerified({ revisionId }, actor())),
    history: (id: string) =>
      server
        ? fn.positionHistoryFn({ data: { id } })
        : local().then((r) => r.positions.history(id)),
    confirm: (ids: string[]) =>
      server
        ? fn.confirmFn({ data: { ids } })
        : local().then((r) => r.positions.confirm({ ids }, actor())),
    create: (data: CreatePositionInput) =>
      server
        ? fn.createPositionFn({ data })
        : local().then((r) => r.positions.create(data, actor())),
    importSpec: (data: ImportSpecInput) =>
      server
        ? fn.importSpecFn({ data })
        : local().then((r) => r.positions.importSpec(data, actor())),
    correct: (data: CorrectPositionInput) =>
      server
        ? fn.correctFn({ data }).then(() => undefined)
        : local().then((r) => r.positions.correct(data, actor())),
    exclude: (id: string) =>
      server
        ? fn.excludeFn({ data: { id } }).then(() => undefined)
        : local().then((r) => r.positions.exclude({ id }, actor())),
    markHeader: (id: string) =>
      server
        ? fn.markHeaderFn({ data: { id } }).then(() => undefined)
        : local().then((r) => r.positions.markHeader({ id }, actor())),
    reopen: (id: string) =>
      server
        ? fn.reopenFn({ data: { id } }).then(() => undefined)
        : local().then((r) => r.positions.reopen({ id }, actor())),
    undoReview: (data: UndoReviewInput) =>
      server
        ? fn.undoReviewFn({ data })
        : local().then((r) => r.positions.undoReview(data, actor())),
    merge: (data: MergePositionsInput) =>
      server ? fn.mergeFn({ data }) : local().then((r) => r.positions.merge(data, actor())),
    split: (data: SplitPositionInput) =>
      server
        ? fn.splitFn({ data }).then(() => undefined)
        : local().then((r) => r.positions.split(data, actor())),
    handOver: (revisionId: string) =>
      server
        ? fn.handOverFn({ data: { revisionId } })
        : local().then((r) => r.positions.handOver({ revisionId }, actor())),
    confirmMatch: (data: ConfirmMatchInput) =>
      server
        ? fn.confirmMatchFn({ data })
        : local().then((r) => r.positions.confirmMatch(data, actor())),
    materials: () => (server ? fn.materialsFn() : local().then((r) => r.positions.materials())),
    replacements: () =>
      server ? fn.replacementsFn() : local().then((r) => r.positions.replacements()),
  },
  catalog: {
    categories: () => (server ? fn.categoriesFn() : local().then((r) => r.catalog.categories())),
    material: (id: string) =>
      server ? fn.materialCardFn({ data: { id } }) : local().then((r) => r.catalog.material(id)),
    catalogChanges: () =>
      server ? fn.catalogChangesFn() : local().then((r) => r.catalog.catalogChanges()),
    saveMaterial: (data: SaveMaterialInput) =>
      server
        ? fn.saveMaterialFn({ data })
        : local().then((r) => r.catalog.saveMaterial(data, actor())),
    saveCategory: (data: SaveCategoryInput) =>
      server
        ? fn.saveCategoryFn({ data })
        : local().then((r) => r.catalog.saveCategory(data, actor())),
    saveSupplier: (data: SaveSupplierInput) =>
      server
        ? fn.saveSupplierFn({ data })
        : local().then((r) => r.catalog.saveSupplier(data, actor())),
    importMaterials: (data: ImportMaterialsInput) =>
      server
        ? fn.importMaterialsFn({ data })
        : local().then((r) => r.catalog.importMaterials(data, actor())),
  },
  procurement: {
    suppliers: () => (server ? fn.suppliersFn() : local().then((r) => r.procurement.suppliers())),
    supplier: (id: string) =>
      server ? fn.supplierFn({ data: { id } }) : local().then((r) => r.procurement.supplier(id)),
    verifyContact: (supplierId: string) =>
      server
        ? fn.verifyContactFn({ data: { supplierId } }).then(() => undefined)
        : local().then((r) => r.procurement.verifyContact({ supplierId }, actor())),
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
        : local().then((r) => r.procurement.createRequest(data, actor())),
    remind: (requestId: string) =>
      server
        ? fn.remindFn({ data: { requestId } })
        : local().then((r) => r.procurement.remind({ requestId }, actor())),
    chooseSupplier: (data: ChooseSupplierInput) =>
      server
        ? fn.chooseSupplierFn({ data })
        : local().then((r) => r.procurement.chooseSupplier(data, actor())),
    deliveries: (projectId: string) =>
      server
        ? fn.deliveriesFn({ data: { projectId } })
        : local().then((r) => r.procurement.deliveries(projectId)),
    delivery: (deliveryId: string) =>
      server
        ? fn.deliveryFn({ data: { id: deliveryId } })
        : local().then((r) => r.procurement.delivery(deliveryId)),
    moveDelivery: (data: MoveDeliveryInput) =>
      server
        ? fn.moveDeliveryFn({ data })
        : local().then((r) => r.procurement.moveDelivery(data, actor())),
    resolveRemark: (data: ResolveRemarkInput) =>
      server
        ? fn.resolveRemarkFn({ data })
        : local().then((r) => r.procurement.resolveRemark(data, actor())),
    acceptDelivery: (data: AcceptDeliveryInput) =>
      server
        ? fn.acceptDeliveryFn({ data })
        : local().then((r) => r.procurement.acceptDelivery(data, actor())),
  },
  reports: {
    list: (projectId: string) =>
      server
        ? fn.reportsFn({ data: { projectId } })
        : local().then((r) => r.reports.list(projectId)),
    create: (data: CreateReportInput) =>
      server ? fn.createReportFn({ data }) : local().then((r) => r.reports.create(data, actor())),
    review: (data: ReviewReportInput) =>
      server
        ? fn.reviewReportFn({ data }).then(() => undefined)
        : local().then((r) => r.reports.review(data, actor())),
    retract: (data: { id: string }) =>
      server
        ? fn.retractReportFn({ data }).then(() => undefined)
        : local().then((r) => r.reports.retract(data, actor())),
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
  /**
   * Запись факта и его разбор (ADR-036). В демонстрации оба шага идут во вкладке: ключа
   * модели там нет и быть не может, поэтому разбирает заглушка — и говорит об этом словами.
   */
  capture: {
    save: (data: CaptureInput) =>
      server ? captureFactFn({ data }) : local().then((r) => r.reports.capture(data, actor())),
    extract: async (data: { projectId: string; message: string; sourceId: string | null }) => {
      if (server) return extractFactFn({ data });
      const [{ createDemoGateway }, { extractWithGateway }, repos] = await Promise.all([
        import("@/adapters/ai/demo"),
        import("./extract-flow"),
        local(),
      ]);
      const outcome = await extractWithGateway(repos, createDemoGateway(), data);
      return outcome.ok && outcome.draft
        ? { ok: true as const, draft: outcome.draft, by: outcome.by }
        : { ok: false as const, reason: outcome.reason ?? "Разбор не получен", by: outcome.by };
    },
  },

  /** Сводка смены и её файлы (ADR-037): в демонстрации считается и собирается во вкладке */
  shift: {
    summary: (data: ShiftInput) =>
      server ? shiftFn({ data }) : local().then((r) => r.reports.shift(data)),
    excel: (data: ShiftInput) =>
      server
        ? fetch(
            `${SHIFT_EXPORT_PATH}?projectId=${encodeURIComponent(data.projectId)}&date=${data.date}`,
          ).then((response) => {
            if (!response.ok) throw new Error(`Выгрузка не сформирована: ${response.status}`);
            return response.blob();
          })
        : local().then((r) => r.reports.exportShift(data)),
    statement: (data: ShiftInput) =>
      server
        ? fetch(
            `${SHIFT_EXPORT_PATH}?projectId=${encodeURIComponent(data.projectId)}&date=${data.date}&kind=statement`,
          ).then((response) => {
            if (!response.ok) throw new Error(`Документ не сформирован: ${response.status}`);
            return response.blob();
          })
        : local().then((r) => r.reports.exportStatement(data)),
  },

  /** Заявки на материал (ADR-037, сценарий 3) */
  /**
   * Расшифровка записи (ADR-040, п. 2). В демонстрации распознаёт вкладка демо-распознавателем:
   * звук никуда не уходит. В рабочем контуре запись идёт на сервер, ключ остаётся там.
   */
  speech: {
    transcribe: async (data: {
      audio: Blob | null;
      durationMs: number;
      projectId: string;
      sourceId: string | null;
      scenario: string | null;
    }) => {
      const mimeType = data.audio?.type || "audio/webm";
      if (server) {
        const audio = data.audio ? await blobToBase64(data.audio) : null;
        const { transcribeFn } = await import("./speech");
        return transcribeFn({
          data: {
            audio,
            mimeType,
            durationMs: Math.round(data.durationMs),
            projectId: data.projectId,
            sourceId: data.sourceId,
            scenario: data.scenario,
          },
        });
      }
      const [{ createDemoSpeech }, { transcribeWith }, repos] = await Promise.all([
        import("@/adapters/speech/demo"),
        import("./speech"),
        local(),
      ]);
      return transcribeWith(repos, createDemoSpeech(), {
        bytes: null,
        mimeType,
        durationMs: Math.round(data.durationMs),
        projectId: data.projectId,
        sourceId: data.sourceId,
        scenario: data.scenario,
      });
    },
  },
  supply: {
    requests: (projectId: string | null) =>
      server
        ? requestsFn({ data: { projectId } })
        : local().then((r) => r.supply.requests(projectId)),
    create: (data: CreateMaterialRequestInput) =>
      server
        ? createRequestFn({ data })
        : local().then((r) => r.supply.createRequest(data, actor())),
    decide: (data: DecideMaterialRequestInput) =>
      server
        ? decideRequestFn({ data })
        : local().then((r) => r.supply.decideRequest(data, actor())),
    retract: (data: { id: string }) =>
      server
        ? retractRequestFn({ data }).then(() => undefined)
        : local().then((r) => r.supply.retractRequest(data, actor())),
  },

  agent: {
    ask: (data: AskAgentInput) =>
      server ? fn.askAgentFn({ data }) : local().then((r) => r.agent.ask(data)),
  },
};

export type Api = typeof api;

/** Запись в base64 для серверной функции: двоичное тело она не принимает */
async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
