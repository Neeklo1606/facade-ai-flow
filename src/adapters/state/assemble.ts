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
  MaterialCategory,
  CatalogChange,
  MaterialChange,
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
import type { TableRows as FixtureTables } from "@/adapters/state/tables";

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
  /** Дерево категорий и история номенклатуры (ADR-014) */
  categories: MaterialCategory[];
  materialChanges: MaterialChange[];
  catalogChanges: CatalogChange[];
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

/** Объект для экранов: заказчик и договор по имени, ответственный. Им же пользуется SQL реестра */
export function projectView(
  { customerId, managerId, ...row }: FixtureTables["projects"][number],
  customerName: string | null,
  contract: { id: string; number: string } | null,
): Project {
  return {
    ...row,
    customerId,
    customer: customerName ?? "—",
    contractId: contract?.id ?? null,
    contract: contract?.number ?? "—",
    manager: managerId,
  };
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

/**
 * Состояние для адаптеров из таблиц. По умолчанию — фикстуры демо; адаптер PostgreSQL
 * передаёт таблицы из базы и получает то же состояние (ADR-005, п. 5).
 */
export function buildSnapshot(t: FixtureTables): FixtureSnapshot {
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
    categories: t.material_categories,
    materialChanges: t.material_changes,
    catalogChanges: t.catalog_changes,
    replacements: t.replacement_suggestions,

    projects: t.projects.map((row) =>
      projectView(
        row,
        counterpartyById.get(row.customerId)?.name ?? null,
        contractByProject.get(row.id) ?? null,
      ),
    ),
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

/**
 * Обратное к `buildSnapshot`: таблицы из состояния. Им адаптер PostgreSQL пишет результат
 * действия. Производные поля видов (имена, ссылки, счётчики) не пишутся — при загрузке
 * они считаются заново. Тест «туда и обратно» держит обе функции согласованными.
 */
export function snapshotTables(s: FixtureSnapshot): FixtureTables {
  const unique = <T>(rows: T[], key: (row: T) => string) => [
    ...new Map(rows.map((row) => [key(row), row])).values(),
  ];
  return {
    employees: s.employees.map(({ projectIds: _projectIds, ...row }) => row),
    project_members: s.employees.flatMap((employee) =>
      employee.projectIds.map((projectId) => ({ projectId, employeeId: employee.id })),
    ),
    counterparties: s.counterparties,
    supplier_profiles: s.profiles,
    crews: s.crews.map(({ memberIds: _memberIds, ...row }) => row),
    crew_members: s.crews.flatMap((crew) =>
      crew.memberIds.map((employeeId) => ({ crewId: crew.id, employeeId })),
    ),
    projects: s.projects.map(
      ({ customer: _customer, contractId: _contractId, contract: _contract, manager, ...row }) => ({
        ...row,
        managerId: manager,
      }),
    ),
    contracts: s.contracts,
    milestones: s.milestones.map(({ projectId: _projectId, ...row }) => row),
    work_zones: s.zones.map(({ factQty, ...row }) => ({ ...row, baselineFactQty: factQty })),
    documents: unique(
      s.documents.map((revision) => ({
        id: revision.documentId,
        projectId: revision.projectId,
        section: revision.section,
        title: revision.title,
      })),
      (row) => row.id,
    ),
    document_revisions: s.documents.map((revision) => ({
      id: revision.id,
      documentId: revision.documentId,
      revision: revision.revision,
      label: revision.version,
      fileName: revision.fileName,
      fileType: revision.fileType,
      sizeKb: revision.sizeKb,
      uploadedAt: revision.uploadedAt,
      uploadedBy: revision.uploadedBy,
      sheetCount: revision.sheetCount,
      status: revision.status,
      sourceId: revision.sourceId,
      positionsTotal: revision.positionsTotal,
      positionsVerified: revision.positionsVerified,
    })),
    extraction_jobs: s.extractionJobs,
    document_sheets: s.sheets.map((sheet) => ({
      id: sheet.id,
      revisionId: sheet.documentId,
      number: sheet.number,
      title: sheet.title,
      groupName: sheet.group,
    })),
    revision_changes: s.revisionChanges,
    material_categories: s.categories,
    materials: s.materials,
    material_changes: s.materialChanges,
    catalog_changes: s.catalogChanges,
    positions: s.positions.map(
      ({
        documentId,
        sheetNumber: _sheetNumber,
        group: _group,
        normalizedName: _normalizedName,
        requestIds: _requestIds,
        ...row
      }) => ({ ...row, revisionId: documentId }),
    ),
    position_changes: s.changes,
    replacement_suggestions: s.replacements,
    email_templates: s.templates,
    supply_requests: s.requests.map(({ items: _items, sentTo: _sentTo, ...row }) => row),
    supply_request_lines: s.requests.flatMap((request) =>
      request.items.map((line) => ({ ...line, requestId: request.id })),
    ),
    supply_request_positions: s.requestPositions,
    // Когда напомнили — считается при чтении (ADR-011), в строке получателя не хранится
    supply_request_recipients: s.requests.flatMap((request) =>
      request.sentTo.map((supplierId) => ({ requestId: request.id, supplierId, remindedAt: null })),
    ),
    supplier_offers: s.offers,
    supplier_offer_lines: s.offerLines,
    deliveries: s.deliveries.map(({ items: _items, ...row }) => row),
    delivery_lines: s.deliveries.flatMap((delivery) =>
      delivery.items.map((line) => ({
        id: line.id,
        deliveryId: delivery.id,
        requestLineId: line.requestLineId,
        qty: line.qty,
        price: line.price,
        acceptedQty: line.acceptedQty,
        remark: line.remark,
      })),
    ),
    delivery_status_changes: s.deliveryChanges,
    delivery_acceptances: s.acceptances,
    delivery_photos: s.deliveryPhotos,
    delivery_remarks: s.remarks,
    project_decisions: s.decisions.map(({ link: _link, ...row }) => row),
    sources: s.sources,
    extractions: s.extractions,
    field_reports: s.reports.map(
      ({ date, issues: _issues, evidenceIds: _evidenceIds, ...row }) => ({
        ...row,
        reportDate: date,
      }),
    ),
    field_report_issues: s.reports.flatMap((report) =>
      report.issues.map((issue) => ({ ...issue, reportId: report.id })),
    ),
    evidence: s.evidence,
    project_events: s.events,
  } satisfies FixtureTables;
}
