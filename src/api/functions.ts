import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { extractedPosition, projectDecision, projectDocument, projectView } from "@/contracts";
import {
  agentReply,
  askAgentInput,
  correctPositionInput,
  counterpartyList,
  createProjectInput,
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
import { serverActor, serverRepositories } from "./server-repositories";

/**
 * Серверные функции поверх портов (ADR-001, п. 4). Вход проверяется схемой до обработчика,
 * выход — схемой перед отправкой. Действующий сотрудник берётся на сервере, а не из запроса.
 * Адаптер сервера — фикстуры в памяти процесса; в фазе 3 его заменит адаптер PostgreSQL.
 */

const repos = serverRepositories;
const actor = serverActor;

const projectId = z.object({ projectId: z.string().min(1) });
const byId = z.object({ id: z.string().min(1) });
const ok = z.object({ ok: z.literal(true) });

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
