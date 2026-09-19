import type { z } from "zod";
import type * as c from "@/contracts";

/** Строки всех таблиц схемы — тип из контрактов, общий для фикстур и адаптера PostgreSQL */
type Rows<S extends z.ZodTypeAny> = z.infer<S>[];
export interface TableRows {
  documents: Rows<typeof c.documents>;
  document_revisions: Rows<typeof c.documentRevisions>;
  extraction_jobs: Rows<typeof c.extractionJobs>;
  document_sheets: Rows<typeof c.documentSheets>;
  revision_changes: Rows<typeof c.revisionChanges>;
  sources: Rows<typeof c.sources>;
  extractions: Rows<typeof c.extractions>;
  field_reports: Rows<typeof c.fieldReports>;
  field_report_issues: Rows<typeof c.fieldReportIssues>;
  evidence: Rows<typeof c.evidence>;
  employees: Rows<typeof c.employees>;
  project_members: Rows<typeof c.projectMembers>;
  counterparties: Rows<typeof c.counterparties>;
  supplier_profiles: Rows<typeof c.supplierProfiles>;
  crews: Rows<typeof c.crews>;
  crew_members: Rows<typeof c.crewMembers>;
  material_categories: Rows<typeof c.materialCategories>;
  materials: Rows<typeof c.materials>;
  material_changes: Rows<typeof c.materialChanges>;
  positions: Rows<typeof c.positions>;
  position_changes: Rows<typeof c.positionChanges>;
  replacement_suggestions: Rows<typeof c.replacementSuggestions>;
  email_templates: Rows<typeof c.emailTemplates>;
  supply_requests: Rows<typeof c.supplyRequests>;
  supply_request_lines: Rows<typeof c.supplyRequestLines>;
  supply_request_positions: Rows<typeof c.supplyRequestPositions>;
  supply_request_recipients: Rows<typeof c.supplyRequestRecipients>;
  supplier_offers: Rows<typeof c.supplierOffers>;
  supplier_offer_lines: Rows<typeof c.supplierOfferLines>;
  deliveries: Rows<typeof c.deliveries>;
  delivery_lines: Rows<typeof c.deliveryLines>;
  delivery_status_changes: Rows<typeof c.deliveryStatusChanges>;
  delivery_acceptances: Rows<typeof c.deliveryAcceptances>;
  delivery_photos: Rows<typeof c.deliveryPhotos>;
  delivery_remarks: Rows<typeof c.deliveryRemarks>;
  project_decisions: Rows<typeof c.projectDecisions>;
  projects: Rows<typeof c.projects>;
  contracts: Rows<typeof c.contracts>;
  milestones: Rows<typeof c.milestones>;
  work_zones: Rows<typeof c.workZones>;
  project_events: Rows<typeof c.projectEvents>;
}
