import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  employeeView,
  extractedPosition,
  materialCategories,
  fieldReport,
  milestoneView,
  workZoneView,
  materials as materialRow,
  projectDecision,
  projectDocument,
  projectView,
} from "@/contracts";
import {
  agentReply,
  catalogJournal,
  categoryList,
  confirmMatchInput,
  materialCard,
  saveMaterialInput,
  supplierCard,
  askAgentInput,
  correctPositionInput,
  counterpartyList,
  createProjectInput,
  setProjectStatusInput,
  completeMilestoneInput,
  saveZoneInput,
  resolveChangeInput,
  createRequestInput,
  createRequestResult,
  acceptDeliveryInput,
  chooseSupplierInput,
  decisionList,
  deliveryCardView,
  deliveryList,
  moveDeliveryInput,
  resolveRemarkInput,
  documentCard,
  documentListItem,
  clockNow,
  employeeList,
  handOverInput,
  idInput,
  idsInput,
  listChangesInput,
  listDocumentsInput,
  listPositionsInput,
  materialList,
  mergePositionsInput,
  pendingList,
  positionHistory,
  positionFacets,
  positionFilter,
  positionPage,
  positionSelection,
  projectCard,
  listProjectsInput,
  projectList,
  remindResult,
  replacementList,
  reportCard,
  requestCard,
  requestSummary,
  createReportInput,
  importMaterialsInput,
  importReport,
  saveCategoryInput,
  saveEmployeeInput,
  saveSupplierInput,
  reviewReportInput,
  revisionChangeView,
  sourceCard,
  splitPositionInput,
  undoReviewInput,
  supplierListItem,
  templateList,
  timelineList,
  uploadRevisionInput,
} from "@/ports";
import { input, respond } from "./errors";
import { DEMO_PERSONAS } from "./config";
import { grantSession } from "./session";
import { requestRepositories, requestSession, serverActor } from "./server-repositories";

/**
 * Серверные функции поверх портов (ADR-001, п. 4). Вход проверяется схемой до обработчика,
 * выход — схемой перед отправкой. Каждый вызов идёт через обёртку прав (ADR-012): сотрудник
 * и его роль — из подписанной сессии, а не из запроса; без прав — 403.
 * Адаптер сервера — фикстуры в памяти процесса; в фазе 3 его заменит адаптер PostgreSQL.
 */

const repos = requestRepositories;
const actor = serverActor;

const projectId = z.object({ projectId: z.string().min(1) });
const byId = z.object({ id: z.string().min(1) });
const ok = z.object({ ok: z.literal(true) });

/* ---------- Сессия ---------- */

const accessSession = z.object({
  actorId: z.string(),
  role: z.string(),
  projectIds: z.array(z.string()),
});

/** Кто вошёл: сотрудник, роль и его объекты; null — сессии нет */
export const sessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requestSession();
  return session ? accessSession.parse(session) : null;
});

/**
 * Вход за персону демонстрации (ADR-012, п. 4): свободный выбор одной из пяти персон за ключом
 * демонстрации. Настоящий вход заменит только эту функцию.
 */
export const signInFn = createServerFn({ method: "POST" })
  .validator(input(z.object({ personaId: z.enum(DEMO_PERSONAS) })))
  .handler(async ({ data }) => {
    await grantSession(data.personaId);
    return { ok: true as const };
  });

/* ---------- Часы ---------- */

export const nowFn = createServerFn({ method: "GET" }).handler(async () =>
  respond(clockNow, await repos().clock.now()),
);

/* ---------- Справочники ---------- */

export const employeesFn = createServerFn({ method: "GET" }).handler(async () =>
  respond(employeeList, await repos().directory.employees()),
);

export const counterpartiesFn = createServerFn({ method: "GET" }).handler(async () =>
  respond(counterpartyList, await repos().directory.counterparties()),
);

/* ---------- Объекты ---------- */

export const projectsFn = createServerFn({ method: "GET" })
  .validator(input(listProjectsInput))
  .handler(async ({ data }) => respond(projectList, await repos().projects.list(data)));

export const projectCardFn = createServerFn({ method: "GET" })
  .validator(input(byId))
  .handler(async ({ data }) =>
    respond(projectCard.nullable(), await repos().projects.card(data.id)),
  );

export const createProjectFn = createServerFn({ method: "POST" })
  .validator(input(createProjectInput))
  .handler(async ({ data }) => respond(projectView, await repos().projects.create(data, actor())));

/** Статус объекта и контрольная точка — действия ADR-015, п. 7 */
export const setProjectStatusFn = createServerFn({ method: "POST" })
  .validator(input(setProjectStatusInput))
  .handler(async ({ data }) =>
    respond(projectView, await repos().projects.setStatus(data, actor())),
  );

export const completeMilestoneFn = createServerFn({ method: "POST" })
  .validator(input(completeMilestoneInput))
  .handler(async ({ data }) =>
    respond(milestoneView, await repos().projects.completeMilestone(data, actor())),
  );

/** Захватка объекта: завести или изменить (ADR-024) */
export const saveZoneFn = createServerFn({ method: "POST" })
  .validator(input(saveZoneInput))
  .handler(async ({ data }) =>
    respond(workZoneView, await repos().projects.saveZone(data, actor())),
  );

/* ---------- Документы ---------- */

export const documentsFn = createServerFn({ method: "GET" })
  .validator(input(listDocumentsInput))
  .handler(async ({ data }) =>
    respond(z.array(documentListItem), await repos().documents.list(data)),
  );

export const revisionsFn = createServerFn({ method: "GET" })
  .validator(input(byId))
  .handler(async ({ data }) =>
    respond(z.array(documentListItem), await repos().documents.revisions(data.id)),
  );

export const documentCardFn = createServerFn({ method: "GET" })
  .validator(input(byId))
  .handler(async ({ data }) =>
    respond(documentCard.nullable(), await repos().documents.card(data.id)),
  );

export const uploadFn = createServerFn({ method: "POST" })
  .validator(input(uploadRevisionInput))
  .handler(async ({ data }) =>
    respond(projectDocument, await repos().documents.upload(data, actor())),
  );

export const revisionChangesFn = createServerFn({ method: "GET" })
  .validator(input(listChangesInput))
  .handler(async ({ data }) =>
    respond(z.array(revisionChangeView), await repos().documents.changes(data)),
  );

export const resolveChangeFn = createServerFn({ method: "POST" })
  .validator(input(resolveChangeInput))
  .handler(async ({ data }) =>
    respond(revisionChangeView, await repos().documents.resolveChange(data, actor())),
  );

/* ---------- Позиции ---------- */

export const positionsFn = createServerFn({ method: "GET" })
  .validator(input(listPositionsInput))
  .handler(async ({ data }) => respond(positionPage, await repos().positions.list(data)));

export const positionFacetsFn = createServerFn({ method: "GET" })
  .validator(input(positionFilter))
  .handler(async ({ data }) => respond(positionFacets, await repos().positions.facets(data)));

export const positionSelectionFn = createServerFn({ method: "GET" })
  .validator(input(positionFilter))
  .handler(async ({ data }) => respond(positionSelection, await repos().positions.selection(data)));

export const positionFn = createServerFn({ method: "GET" })
  .validator(input(byId))
  .handler(async ({ data }) =>
    respond(extractedPosition.nullable(), await repos().positions.item(data.id)),
  );

export const confirmAutoVerifiedFn = createServerFn({ method: "POST" })
  .validator(input(handOverInput))
  .handler(async ({ data }) =>
    respond(z.array(z.string()), await repos().positions.confirmAutoVerified(data, actor())),
  );

export const positionHistoryFn = createServerFn({ method: "GET" })
  .validator(input(byId))
  .handler(async ({ data }) => respond(positionHistory, await repos().positions.history(data.id)));

export const confirmFn = createServerFn({ method: "POST" })
  .validator(input(idsInput))
  .handler(async ({ data }) =>
    respond(z.array(z.string()), await repos().positions.confirm(data, actor())),
  );

export const correctFn = createServerFn({ method: "POST" })
  .validator(input(correctPositionInput))
  .handler(async ({ data }) => {
    await repos().positions.correct(data, actor());
    return ok.parse({ ok: true });
  });

export const excludeFn = createServerFn({ method: "POST" })
  .validator(input(idInput))
  .handler(async ({ data }) => {
    await repos().positions.exclude(data, actor());
    return ok.parse({ ok: true });
  });

export const markHeaderFn = createServerFn({ method: "POST" })
  .validator(input(idInput))
  .handler(async ({ data }) => {
    await repos().positions.markHeader(data, actor());
    return ok.parse({ ok: true });
  });

export const reopenFn = createServerFn({ method: "POST" })
  .validator(input(idInput))
  .handler(async ({ data }) => {
    await repos().positions.reopen(data, actor());
    return ok.parse({ ok: true });
  });

export const undoReviewFn = createServerFn({ method: "POST" })
  .validator(input(undoReviewInput))
  .handler(async ({ data }) =>
    respond(z.number().int().nonnegative(), await repos().positions.undoReview(data, actor())),
  );

export const mergeFn = createServerFn({ method: "POST" })
  .validator(input(mergePositionsInput))
  .handler(async ({ data }) => respond(z.boolean(), await repos().positions.merge(data, actor())));

export const splitFn = createServerFn({ method: "POST" })
  .validator(input(splitPositionInput))
  .handler(async ({ data }) => {
    await repos().positions.split(data, actor());
    return ok.parse({ ok: true });
  });

export const handOverFn = createServerFn({ method: "POST" })
  .validator(input(handOverInput))
  .handler(async ({ data }) =>
    respond(z.number().int(), await repos().positions.handOver(data, actor())),
  );

export const confirmMatchFn = createServerFn({ method: "POST" })
  .validator(input(confirmMatchInput))
  .handler(async ({ data }) =>
    respond(extractedPosition, await repos().positions.confirmMatch(data, actor())),
  );

export const materialsFn = createServerFn({ method: "GET" }).handler(async () =>
  respond(materialList, await repos().positions.materials()),
);

export const replacementsFn = createServerFn({ method: "GET" }).handler(async () =>
  respond(replacementList, await repos().positions.replacements()),
);

/* ---------- Закупка ---------- */

export const suppliersFn = createServerFn({ method: "GET" }).handler(async () =>
  respond(z.array(supplierListItem), await repos().procurement.suppliers()),
);

export const supplierFn = createServerFn({ method: "GET" })
  .validator(input(byId))
  .handler(async ({ data }) =>
    respond(supplierCard.nullable(), await repos().procurement.supplier(data.id)),
  );

/* ---------- Номенклатура (ADR-014) ---------- */

export const categoriesFn = createServerFn({ method: "GET" }).handler(async () =>
  respond(categoryList, await repos().catalog.categories()),
);

export const catalogChangesFn = createServerFn({ method: "GET" }).handler(async () =>
  respond(catalogJournal, await repos().catalog.catalogChanges()),
);

export const materialCardFn = createServerFn({ method: "GET" })
  .validator(input(byId))
  .handler(async ({ data }) =>
    respond(materialCard.nullable(), await repos().catalog.material(data.id)),
  );

export const saveMaterialFn = createServerFn({ method: "POST" })
  .validator(input(saveMaterialInput))
  .handler(async ({ data }) =>
    respond(materialRow, await repos().catalog.saveMaterial(data, actor())),
  );

export const verifyContactFn = createServerFn({ method: "POST" })
  .validator(input(z.object({ supplierId: z.string().min(1) })))
  .handler(async ({ data }) => {
    await repos().procurement.verifyContact(data, actor());
    return ok.parse({ ok: true });
  });

export const templatesFn = createServerFn({ method: "GET" }).handler(async () =>
  respond(templateList, await repos().procurement.templates()),
);

export const requestsFn = createServerFn({ method: "GET" })
  .validator(input(projectId))
  .handler(async ({ data }) =>
    respond(z.array(requestSummary), await repos().procurement.requests(data.projectId)),
  );

export const requestCardFn = createServerFn({ method: "GET" })
  .validator(input(byId))
  .handler(async ({ data }) =>
    respond(requestCard.nullable(), await repos().procurement.request(data.id)),
  );

export const createRequestFn = createServerFn({ method: "POST" })
  .validator(input(createRequestInput))
  .handler(async ({ data }) =>
    respond(createRequestResult, await repos().procurement.createRequest(data, actor())),
  );

export const remindFn = createServerFn({ method: "POST" })
  .validator(input(z.object({ requestId: z.string().min(1) })))
  .handler(async ({ data }) =>
    respond(remindResult, await repos().procurement.remind(data, actor())),
  );

export const chooseSupplierFn = createServerFn({ method: "POST" })
  .validator(input(chooseSupplierInput))
  .handler(async ({ data }) =>
    respond(projectDecision, await repos().procurement.chooseSupplier(data, actor())),
  );

export const deliveriesFn = createServerFn({ method: "GET" })
  .validator(input(projectId))
  .handler(async ({ data }) =>
    respond(deliveryList, await repos().procurement.deliveries(data.projectId)),
  );

export const deliveryFn = createServerFn({ method: "GET" })
  .validator(input(idInput))
  .handler(async ({ data }) =>
    respond(deliveryCardView.nullable(), await repos().procurement.delivery(data.id)),
  );

export const moveDeliveryFn = createServerFn({ method: "POST" })
  .validator(input(moveDeliveryInput))
  .handler(async ({ data }) =>
    respond(deliveryCardView, await repos().procurement.moveDelivery(data, actor())),
  );

export const resolveRemarkFn = createServerFn({ method: "POST" })
  .validator(input(resolveRemarkInput))
  .handler(async ({ data }) =>
    respond(deliveryCardView, await repos().procurement.resolveRemark(data, actor())),
  );

export const acceptDeliveryFn = createServerFn({ method: "POST" })
  .validator(input(acceptDeliveryInput))
  .handler(async ({ data }) =>
    respond(deliveryCardView, await repos().procurement.acceptDelivery(data, actor())),
  );

/* ---------- Площадка и история ---------- */

export const reportsFn = createServerFn({ method: "GET" })
  .validator(input(projectId))
  .handler(async ({ data }) =>
    respond(z.array(reportCard), await repos().reports.list(data.projectId)),
  );

export const saveCategoryFn = createServerFn({ method: "POST" })
  .validator(input(saveCategoryInput))
  .handler(async ({ data }) =>
    respond(materialCategories, await repos().catalog.saveCategory(data, actor())),
  );

export const saveSupplierFn = createServerFn({ method: "POST" })
  .validator(input(saveSupplierInput))
  .handler(async ({ data }) => repos().catalog.saveSupplier(data, actor()));

export const importMaterialsFn = createServerFn({ method: "POST" })
  .validator(input(importMaterialsInput))
  .handler(async ({ data }) =>
    respond(importReport, await repos().catalog.importMaterials(data, actor())),
  );

export const saveEmployeeFn = createServerFn({ method: "POST" })
  .validator(input(saveEmployeeInput))
  .handler(async ({ data }) =>
    respond(employeeView, await repos().directory.saveEmployee(data, actor())),
  );

export const createReportFn = createServerFn({ method: "POST" })
  .validator(input(createReportInput))
  .handler(async ({ data }) => respond(fieldReport, await repos().reports.create(data, actor())));

export const reviewReportFn = createServerFn({ method: "POST" })
  .validator(input(reviewReportInput))
  .handler(async ({ data }) => {
    await repos().reports.review(data, actor());
    return ok.parse({ ok: true });
  });

export const sourceFn = createServerFn({ method: "GET" })
  .validator(input(byId))
  .handler(async ({ data }) =>
    respond(sourceCard.nullable(), await repos().reports.source(data.id)),
  );

/* ---------- Ассистент ---------- */

export const askAgentFn = createServerFn({ method: "POST" })
  .validator(input(askAgentInput))
  .handler(async ({ data }) => respond(agentReply.nullable(), await repos().agent.ask(data)));

export const timelineFn = createServerFn({ method: "GET" })
  .validator(input(projectId))
  .handler(async ({ data }) => respond(timelineList, await repos().timeline.list(data.projectId)));

export const decisionsFn = createServerFn({ method: "GET" })
  .validator(input(projectId))
  .handler(async ({ data }) =>
    respond(decisionList, await repos().timeline.decisions(data.projectId)),
  );

export const pendingDecisionsFn = createServerFn({ method: "GET" })
  .validator(input(projectId))
  .handler(async ({ data }) =>
    respond(pendingList, await repos().timeline.pending(data.projectId)),
  );
