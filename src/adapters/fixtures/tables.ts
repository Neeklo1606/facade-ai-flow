import type { TableRows } from "@/adapters/state/tables";
import type { DocumentSheetRow } from "@/contracts";
import * as org from "./data/org";
import * as projectsData from "./data/projects";
import * as documentsData from "./data/documents";
import * as procurement from "./data/procurement";
import * as field from "./data/field";
import * as timeline from "./data/timeline";
import * as catalog from "./data/catalog";
import * as spec from "./spec";

/**
 * Все таблицы фикстур в форме строк PostgreSQL (src/contracts).
 * Ключ — имя таблицы; `bun run check:fixtures` проверяет строки схемами, ключами и уникальностями.
 */

const materialFamily = new Map(spec.materials.map((item) => [item.id, item.family]));

const documentSheets: DocumentSheetRow[] = documentsData.documentRevisions.flatMap((revision) => {
  const document = documentsData.documents.find((item) => item.id === revision.documentId)!;
  return spec.sheetsOf(revision, document.section);
});

export const fixtureTables: TableRows = {
  employees: org.employees,
  project_members: org.projectMembers,
  counterparties: org.counterparties,
  supplier_profiles: org.supplierProfiles,
  crews: org.crews,
  crew_members: org.crewMembers,

  projects: projectsData.projects,
  contracts: projectsData.contracts,
  milestones: projectsData.milestones,
  work_zones: projectsData.workZones,

  documents: documentsData.documents,
  document_revisions: documentsData.documentRevisions,
  extraction_jobs: documentsData.extractionJobs,
  document_sheets: documentSheets,
  revision_changes: documentsData.revisionChanges,
  material_categories: catalog.materialCategories,
  materials: spec.materials,
  material_changes: catalog.materialChanges,
  catalog_changes: catalog.catalogChanges,
  positions: spec.positions,
  position_changes: spec.positionChanges,
  replacement_suggestions: spec.replacementSuggestions,

  email_templates: procurement.emailTemplates,
  supply_requests: procurement.supplyRequests,
  supply_request_lines: procurement.supplyRequestLines,
  supply_request_positions: spec.requestPositionsOf(procurement.supplyRequestLines, (id) =>
    id ? (materialFamily.get(id) ?? null) : null,
  ),
  supply_request_recipients: procurement.supplyRequestRecipients,
  supplier_offers: procurement.supplierOffers,
  supplier_offer_lines: procurement.supplierOfferLines,
  deliveries: procurement.deliveries,
  delivery_lines: procurement.deliveryLines,
  delivery_status_changes: procurement.deliveryStatusChanges,
  delivery_acceptances: procurement.deliveryAcceptances,
  delivery_photos: procurement.deliveryPhotos,
  delivery_remarks: procurement.deliveryRemarks,
  project_decisions: procurement.projectDecisions,

  field_reports: field.fieldReports,
  field_report_issues: field.fieldReportIssues,
  evidence: field.evidence,
  sources: field.sources,
  extractions: field.extractions,
  project_events: timeline.projectEvents,
};

export type FixtureTables = TableRows;
export type { TableRows };
