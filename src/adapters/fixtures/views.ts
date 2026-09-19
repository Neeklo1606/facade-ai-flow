import type {
  DeliveryAcceptance,
  DeliveryPhoto,
  DeliveryRemark,
  DeliveryStatusChange,
  ExtractionJob,
  Contract,
  Counterparty,
  Crew,
  Delivery,
  DocumentSheet,
  EmailTemplate,
  Employee,
  Evidence,
  ExtractedPosition,
  Extraction,
  FieldReport,
  Material,
  Milestone,
  OfferLine,
  PositionChange,
  Project,
  ProjectDecision,
  ProjectDocument,
  ProjectEvent,
  ReplacementSuggestion,
  RevisionChange,
  Source,
  SupplierOffer,
  SupplierProfile,
  SupplyRequest,
  WorkZone,
} from "@/contracts";
import { decisionLink } from "@/domain/timeline";
import { withDeliveries, type RequestPositionLink } from "@/domain/deliveries";
import { fixtureTables as t } from "./tables";

/**
 * Представления для экранов, собранные из таблиц фикстур — так же, как их соберут
 * запросы с join в адаптере БД. Результат — стартовое состояние демо.
 */
export interface FixtureSnapshot {
  employees: Employee[];
  counterparties: Counterparty[];
  profiles: SupplierProfile[];
  crews: Crew[];
  templates: EmailTemplate[];
  materials: Material[];
  replacements: ReplacementSuggestion[];
  projects: Project[];
  contracts: Contract[];
  milestones: Milestone[];
  zones: WorkZone[];
  documents: ProjectDocument[];
  extractionJobs: ExtractionJob[];
  sheets: DocumentSheet[];
  revisionChanges: RevisionChange[];
  positions: ExtractedPosition[];
  changes: PositionChange[];
  requests: SupplyRequest[];
  offers: SupplierOffer[];
  offerLines: OfferLine[];
  deliveries: Delivery[];
  deliveryChanges: DeliveryStatusChange[];
  acceptances: DeliveryAcceptance[];
  deliveryPhotos: DeliveryPhoto[];
  remarks: DeliveryRemark[];
  /** Из каких позиций собрана строка запроса: по ним раскладывается принятое */
  requestPositions: RequestPositionLink[];
  decisions: ProjectDecision[];
  reports: FieldReport[];
  evidence: Evidence[];
  sources: Source[];
  extractions: Extraction[];
  events: ProjectEvent[];
}

function groupBy<T, K>(rows: T[], key: (row: T) => K) {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const list = map.get(key(row));
    if (list) list.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

export function buildSnapshot(): FixtureSnapshot {
  const counterpartyById = new Map(t.counterparties.map((row) => [row.id, row]));
  const contractByProject = new Map(t.contracts.map((row) => [row.projectId, row]));
  const contractById = new Map(t.contracts.map((row) => [row.id, row]));
  const documentById = new Map(t.documents.map((row) => [row.id, row]));
  const sheetById = new Map(t.document_sheets.map((row) => [row.id, row]));
  const materialById = new Map(t.materials.map((row) => [row.id, row]));
  const lineById = new Map(t.supply_request_lines.map((row) => [row.id, row]));
  const membersByEmployee = groupBy(t.project_members, (row) => row.employeeId);
  const membersByCrew = groupBy(t.crew_members, (row) => row.crewId);
  const linesByRequest = groupBy(t.supply_request_lines, (row) => row.requestId);
  const recipientsByRequest = groupBy(t.supply_request_recipients, (row) => row.requestId);
  const requestsByPosition = groupBy(t.supply_request_positions, (row) => row.positionId);
  const issuesByReport = groupBy(t.field_report_issues, (row) => row.reportId);
  const evidenceByReport = groupBy(t.evidence, (row) => row.reportId);
  const deliveryLines = groupBy(t.delivery_lines, (row) => row.deliveryId);

  const requests: SupplyRequest[] = t.supply_requests.map((row) => ({
    ...row,
    items: (linesByRequest.get(row.id) ?? []).map((line) => ({
      id: line.id,
      materialId: line.materialId,
      name: line.name,
      qty: line.qty,
      unit: line.unit,
    })),
    sentTo: (recipientsByRequest.get(row.id) ?? []).map((item) => item.supplierId),
  }));

  const deliveryViews: Delivery[] = t.deliveries.map((row) => ({
    ...row,
    items: (deliveryLines.get(row.id) ?? []).map((line) => {
      const requestLine = lineById.get(line.requestLineId)!;
      return {
        id: line.id,
        requestLineId: line.requestLineId,
        materialId: requestLine.materialId,
        name: requestLine.name,
        qty: line.qty,
        unit: requestLine.unit,
        price: line.price,
        acceptedQty: line.acceptedQty,
        remark: line.remark,
      };
    }),
  }));

  const positionViews: ExtractedPosition[] = t.positions.map(({ revisionId, ...row }) => {
    const sheet = sheetById.get(row.sheetId)!;
    return {
      ...row,
      documentId: revisionId,
      sheetNumber: sheet.number,
      group: sheet.groupName,
      normalizedName: row.materialId ? (materialById.get(row.materialId)?.name ?? null) : null,
      requestIds: [
        ...new Set(
          (requestsByPosition.get(row.id) ?? []).map(
            (link) => lineById.get(link.requestLineId)!.requestId,
          ),
        ),
      ],
    };
  });

  return {
    employees: t.employees.map((row) => ({
      ...row,
      projectIds: (membersByEmployee.get(row.id) ?? []).map((item) => item.projectId),
    })),
    counterparties: t.counterparties,
    profiles: t.supplier_profiles,
    crews: t.crews.map((row) => ({
      ...row,
      memberIds: (membersByCrew.get(row.id) ?? []).map((item) => item.employeeId),
    })),
    templates: t.email_templates,
    materials: t.materials,
    replacements: t.replacement_suggestions,

    projects: t.projects.map(({ customerId, managerId, ...row }) => {
      const contract = contractByProject.get(row.id) ?? null;
      return {
        ...row,
        customerId,
        customer: counterpartyById.get(customerId)?.name ?? "—",
        contractId: contract?.id ?? null,
        contract: contract?.number ?? "—",
        manager: managerId,
      };
    }),
    contracts: t.contracts,
    milestones: t.milestones.map((row) => ({
      ...row,
      projectId: contractById.get(row.contractId)!.projectId,
    })),
    zones: t.work_zones.map(({ baselineFactQty, ...row }) => ({
      ...row,
      factQty: baselineFactQty,
    })),

    documents: t.document_revisions.map((row) => {
      const document = documentById.get(row.documentId)!;
      return {
        id: row.id,
        documentId: row.documentId,
        revision: row.revision,
        projectId: document.projectId,
        title: document.title,
        section: document.section,
        version: row.label,
        fileName: row.fileName,
        fileType: row.fileType,
        sizeKb: row.sizeKb,
        uploadedAt: row.uploadedAt,
        uploadedBy: row.uploadedBy,
        sheetCount: row.sheetCount,
        status: row.status,
        sourceId: row.sourceId,
        positionsTotal: row.positionsTotal,
        positionsVerified: row.positionsVerified,
      };
    }),
    sheets: t.document_sheets.map((row) => ({
      id: row.id,
      documentId: row.revisionId,
      number: row.number,
      title: row.title,
      group: row.groupName,
    })),
    revisionChanges: t.revision_changes,

    positions: withDeliveries(positionViews, deliveryViews, t.supply_request_positions),
    changes: t.position_changes,

    requests,
    offers: t.supplier_offers,
    offerLines: t.supplier_offer_lines,
    deliveries: deliveryViews,
    deliveryChanges: t.delivery_status_changes,
    acceptances: t.delivery_acceptances,
    deliveryPhotos: t.delivery_photos,
    remarks: t.delivery_remarks,
    requestPositions: t.supply_request_positions,
    decisions: t.project_decisions.map((row) => ({ ...row, link: decisionLink(row, requests) })),

    reports: t.field_reports.map(({ reportDate, ...row }) => ({
      ...row,
      date: reportDate,
      issues: (issuesByReport.get(row.id) ?? []).map(({ reportId: _reportId, ...issue }) => issue),
      evidenceIds: (evidenceByReport.get(row.id) ?? []).map((item) => item.id),
    })),
    evidence: t.evidence,
    sources: t.sources,
    extractions: t.extractions,
    extractionJobs: t.extraction_jobs,
    events: t.project_events,
  };
}
