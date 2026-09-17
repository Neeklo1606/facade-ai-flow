import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { projectDecision, projectDocument, projectView } from "@/contracts";
import { createDemoRepositories } from "@/adapters/demo";
import {
  correctPositionInput,
  counterpartyList,
  createProjectInput,
  createRequestInput,
  createRequestResult,
  chooseSupplierInput,
  decisionList,
  deliveryList,
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
  positionPage,
  projectCard,
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
  type Repositories,
} from "@/ports";
import { CURRENT_USER_ID } from "./config";

/**
 * Серверные функции поверх портов (ADR-001, п. 4). Вход проверяется схемой до обработчика,
 * выход — схемой перед отправкой. Действующий сотрудник берётся на сервере, а не из запроса.
 * Адаптер сервера — фикстуры в памяти процесса; в фазе 3 его заменит адаптер PostgreSQL.
 */

let repositories: Repositories | null = null;
const repos = () => (repositories ??= createDemoRepositories({ persist: false }));
const actor = () => ({ actorId: CURRENT_USER_ID });

const projectId = z.object({ projectId: z.string().min(1) });
const byId = z.object({ id: z.string().min(1) });
const ok = z.object({ ok: z.literal(true) });

/* ---------- Часы ---------- */

export const nowFn = createServerFn({ method: "GET" }).handler(async () =>
  clockNow.parse(await repos().clock.now()),
);

/* ---------- Справочники ---------- */

export const employeesFn = createServerFn({ method: "GET" }).handler(async () =>
  employeeList.parse(await repos().directory.employees()),
);

export const counterpartiesFn = createServerFn({ method: "GET" }).handler(async () =>
  counterpartyList.parse(await repos().directory.counterparties()),
);

/* ---------- Объекты ---------- */

export const projectsFn = createServerFn({ method: "GET" }).handler(async () =>
  projectList.parse(await repos().projects.list()),
);

export const projectCardFn = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(async ({ data }) => projectCard.nullable().parse(await repos().projects.card(data.id)));

export const createProjectFn = createServerFn({ method: "POST" })
  .validator(createProjectInput)
  .handler(async ({ data }) => projectView.parse(await repos().projects.create(data, actor())));

/* ---------- Документы ---------- */

export const documentsFn = createServerFn({ method: "GET" })
  .validator(listDocumentsInput)
  .handler(async ({ data }) => z.array(documentListItem).parse(await repos().documents.list(data)));

export const revisionsFn = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(async ({ data }) =>
    z.array(documentListItem).parse(await repos().documents.revisions(data.id)),
  );

export const documentCardFn = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(async ({ data }) =>
    documentCard.nullable().parse(await repos().documents.card(data.id)),
  );

export const uploadFn = createServerFn({ method: "POST" })
  .validator(uploadRevisionInput)
  .handler(async ({ data }) =>
    projectDocument.parse(await repos().documents.upload(data, actor())),
  );

export const revisionChangesFn = createServerFn({ method: "GET" })
  .validator(listChangesInput)
  .handler(async ({ data }) =>
    z.array(revisionChangeView).parse(await repos().documents.changes(data)),
  );

/* ---------- Позиции ---------- */

export const positionsFn = createServerFn({ method: "GET" })
  .validator(listPositionsInput)
  .handler(async ({ data }) => positionPage.parse(await repos().positions.list(data)));

export const positionHistoryFn = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(async ({ data }) => positionHistory.parse(await repos().positions.history(data.id)));

export const confirmFn = createServerFn({ method: "POST" })
  .validator(idsInput)
  .handler(async ({ data }) =>
    z.array(z.string()).parse(await repos().positions.confirm(data, actor())),
  );

export const correctFn = createServerFn({ method: "POST" })
  .validator(correctPositionInput)
  .handler(async ({ data }) => {
    await repos().positions.correct(data, actor());
    return ok.parse({ ok: true });
  });

export const excludeFn = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    await repos().positions.exclude(data, actor());
    return ok.parse({ ok: true });
  });

export const markHeaderFn = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    await repos().positions.markHeader(data, actor());
    return ok.parse({ ok: true });
  });

export const reopenFn = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    await repos().positions.reopen(data, actor());
    return ok.parse({ ok: true });
  });

export const undoReviewFn = createServerFn({ method: "POST" })
  .validator(undoReviewInput)
  .handler(async ({ data }) =>
    z
      .number()
      .int()
      .nonnegative()
      .parse(await repos().positions.undoReview(data, actor())),
  );

export const mergeFn = createServerFn({ method: "POST" })
  .validator(mergePositionsInput)
  .handler(async ({ data }) => z.boolean().parse(await repos().positions.merge(data, actor())));

export const splitFn = createServerFn({ method: "POST" })
  .validator(splitPositionInput)
  .handler(async ({ data }) => {
    await repos().positions.split(data, actor());
    return ok.parse({ ok: true });
  });

export const handOverFn = createServerFn({ method: "POST" })
  .validator(handOverInput)
  .handler(async ({ data }) =>
    z
      .number()
      .int()
      .parse(await repos().positions.handOver(data, actor())),
  );

export const materialsFn = createServerFn({ method: "GET" }).handler(async () =>
  materialList.parse(await repos().positions.materials()),
);

export const replacementsFn = createServerFn({ method: "GET" }).handler(async () =>
  replacementList.parse(await repos().positions.replacements()),
);

/* ---------- Закупка ---------- */

export const suppliersFn = createServerFn({ method: "GET" }).handler(async () =>
  z.array(supplierListItem).parse(await repos().procurement.suppliers()),
);

export const verifyContactFn = createServerFn({ method: "POST" })
  .validator(z.object({ supplierId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await repos().procurement.verifyContact(data, actor());
    return ok.parse({ ok: true });
  });

export const templatesFn = createServerFn({ method: "GET" }).handler(async () =>
  templateList.parse(await repos().procurement.templates()),
);

export const requestsFn = createServerFn({ method: "GET" })
  .validator(projectId)
  .handler(async ({ data }) =>
    z.array(requestSummary).parse(await repos().procurement.requests(data.projectId)),
  );

export const requestCardFn = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(async ({ data }) =>
    requestCard.nullable().parse(await repos().procurement.request(data.id)),
  );

export const createRequestFn = createServerFn({ method: "POST" })
  .validator(createRequestInput)
  .handler(async ({ data }) =>
    createRequestResult.parse(await repos().procurement.createRequest(data, actor())),
  );

export const remindFn = createServerFn({ method: "POST" })
  .validator(z.object({ requestId: z.string().min(1) }))
  .handler(async ({ data }) => remindResult.parse(await repos().procurement.remind(data, actor())));

export const chooseSupplierFn = createServerFn({ method: "POST" })
  .validator(chooseSupplierInput)
  .handler(async ({ data }) =>
    projectDecision.parse(await repos().procurement.chooseSupplier(data, actor())),
  );

export const deliveriesFn = createServerFn({ method: "GET" })
  .validator(projectId)
  .handler(async ({ data }) =>
    deliveryList.parse(await repos().procurement.deliveries(data.projectId)),
  );

/* ---------- Площадка и история ---------- */

export const reportsFn = createServerFn({ method: "GET" })
  .validator(projectId)
  .handler(async ({ data }) =>
    z.array(reportCard).parse(await repos().reports.list(data.projectId)),
  );

export const reviewReportFn = createServerFn({ method: "POST" })
  .validator(reviewReportInput)
  .handler(async ({ data }) => {
    await repos().reports.review(data, actor());
    return ok.parse({ ok: true });
  });

export const sourceFn = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(async ({ data }) => sourceCard.nullable().parse(await repos().reports.source(data.id)));

export const timelineFn = createServerFn({ method: "GET" })
  .validator(projectId)
  .handler(async ({ data }) => timelineList.parse(await repos().timeline.list(data.projectId)));

export const decisionsFn = createServerFn({ method: "GET" })
  .validator(projectId)
  .handler(async ({ data }) =>
    decisionList.parse(await repos().timeline.decisions(data.projectId)),
  );

export const pendingDecisionsFn = createServerFn({ method: "GET" })
  .validator(projectId)
  .handler(async ({ data }) => pendingList.parse(await repos().timeline.pending(data.projectId)));
