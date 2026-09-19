import {
  isActivePosition,
  isVerifiedPosition,
  type Crew,
  type ExtractedPosition,
  type FieldReport,
  type Project,
  type ProjectDecision,
  type ProjectDocument,
  type ProjectOverview,
  type PurchaseStatus,
  type RevisionChange,
  type SupplierOffer,
  type SupplyRequest,
  type Delivery,
  type DeliveryRemark,
} from "@/contracts";
import { answeredCount, decisionFor, isActiveRequest, rfqStatus } from "./procurement";

/** Данные, из которых считается сводка объекта. Форма совпадает с таблицами представлений. */
export interface OverviewSource {
  projects: Project[];
  documents: ProjectDocument[];
  positions: ExtractedPosition[];
  revisionChanges: RevisionChange[];
  requests: SupplyRequest[];
  offers: SupplierOffer[];
  decisions: ProjectDecision[];
  crews: Crew[];
  reports: FieldReport[];
  deliveries: Delivery[];
  remarks: DeliveryRemark[];
}

/** Действующая ревизия каждого документа: с наибольшим номером. Без объекта — по всем объектам */
export function currentRevisions(documents: ProjectDocument[], projectId?: string) {
  const latest = new Map<string, ProjectDocument>();
  for (const item of documents) {
    if (projectId && item.projectId !== projectId) continue;
    const known = latest.get(item.documentId);
    if (!known || item.revision > known.revision) latest.set(item.documentId, item);
  }
  return [...latest.values()].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/** Ревизии одного документа, новые сверху */
export function revisionsOf(documents: ProjectDocument[], documentId: string) {
  return documents
    .filter((item) => item.documentId === documentId)
    .sort((a, b) => b.revision - a.revision);
}

/** Сколько позиций у ревизии: по загруженным позициям или по счётчику ревизии (R20) */
export function revisionStats(positions: ExtractedPosition[], revision: ProjectDocument) {
  const own = positions.filter((item) => item.documentId === revision.id && isActivePosition(item));
  if (own.length || revision.positionsTotal === null) {
    return { total: own.length, verified: own.filter(isVerifiedPosition).length, loaded: true };
  }
  return {
    total: revision.positionsTotal,
    verified: revision.positionsVerified ?? 0,
    loaded: false,
  };
}

/** Основная спецификация объекта — действующая ревизия с наибольшим числом позиций */
export function mainSpecification(
  s: Pick<OverviewSource, "documents" | "positions">,
  projectId: string,
) {
  let best: { revision: ProjectDocument; total: number } | null = null;
  for (const revision of currentRevisions(s.documents, projectId)) {
    const { total } = revisionStats(s.positions, revision);
    if (total > 0 && (!best || total > best.total)) best = { revision, total };
  }
  return best?.revision ?? null;
}

const DAY = 86_400_000;

/** Сводка объекта по формулам глоссария, §3. `now` — текущее время в формате фикстур. */
export function projectOverview(
  s: OverviewSource,
  projectId: string,
  now: string,
): ProjectOverview | null {
  const project = s.projects.find((item) => item.id === projectId);
  if (!project) return null;

  let specTotal = 0;
  let specVerified = 0;
  for (const revision of currentRevisions(s.documents, projectId)) {
    const stats = revisionStats(s.positions, revision);
    specTotal += stats.total;
    specVerified += stats.verified;
  }

  const verified = s.positions.filter(
    (item) => item.projectId === projectId && isActivePosition(item) && isVerifiedPosition(item),
  );
  const count = (statuses: PurchaseStatus[]) =>
    verified.filter((item) => statuses.includes(item.purchase)).length;

  const requests = s.requests.filter((item) => item.projectId === projectId);
  const active = requests.filter(isActiveRequest);
  const overdue = active.filter(
    (request) =>
      rfqStatus(
        request,
        answeredCount(s.offers, request),
        Boolean(decisionFor(s.decisions, request.id)),
        now,
      ) === "overdue",
  );

  const documentIds = new Set(
    s.documents.filter((item) => item.projectId === projectId).map((item) => item.documentId),
  );
  const openChanges = s.revisionChanges.filter(
    (item) => item.status === "open" && documentIds.has(item.documentId),
  ).length;

  const weekAgo = new Date(new Date(now).getTime() - 7 * DAY).toISOString().slice(0, 10);
  const missingReports = s.crews.filter(
    (crew) =>
      crew.projectId === projectId &&
      !s.reports.some((report) => report.crewId === crew.id && report.date >= weekAgo),
  ).length;

  const deliveries = s.deliveries.filter((item) => item.projectId === projectId);
  const moving = new Set(
    deliveries
      .filter((item) => item.status === "shipped" || item.status === "in_transit")
      .map((item) => item.requestId),
  );

  return {
    projectId,
    region: project.region,
    stage: project.stage,
    docVersion: mainSpecification(s, projectId)?.version ?? "—",
    specTotal,
    specUnverified: specTotal - specVerified,
    inRequests: count(["requested", "offers", "supplier_selected", "ordered", "delivered"]),
    offersReceived: count(["offers", "supplier_selected", "ordered", "delivered"]),
    ordered: count(["ordered", "delivered"]),
    // «В пути» — позиции, поставка которых отгружена или едет, а не все заказанные (ADR-011)
    inTransit: verified.filter(
      (item) => item.purchase === "ordered" && item.requestIds.some((id) => moving.has(id)),
    ).length,
    delivered: count(["delivered"]),
    deliveriesToAccept: deliveries.filter((item) => item.status === "arrived").length,
    openRemarks: s.remarks.filter((item) => item.projectId === projectId && item.status === "open")
      .length,
    activeRequests: active.length,
    overdueRequests: overdue.length,
    openChanges,
    missingReports,
  };
}
