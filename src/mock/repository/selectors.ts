import { counterparties, crews, employees } from "./org";
import { contracts, milestones, projects } from "./projects";
import { deliveries, materials, supplierOffers, supplyRequests } from "./supply";
import { approvals, auditLog, extractions, fieldReports, incomingEvents, sources } from "./field";
import { documents, risks, tasks } from "./operations";
import { scheduleItems, volumeEntries, workItems, workZones } from "./work";
import type { ConfidenceBand } from "./types";

function sum(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0);
}

/* ---------- Фильтры по объекту ---------- */

export const byProject = {
  zones: (projectId: string) => workZones.filter((item) => item.projectId === projectId),
  workItems: (projectId: string) => workItems.filter((item) => item.projectId === projectId),
  volumes: (projectId: string) => volumeEntries.filter((item) => item.projectId === projectId),
  schedule: (projectId: string) => scheduleItems.filter((item) => item.projectId === projectId),
  milestones: (projectId: string) => milestones.filter((item) => item.projectId === projectId),
  tasks: (projectId: string) => tasks.filter((item) => item.projectId === projectId),
  risks: (projectId: string) => risks.filter((item) => item.projectId === projectId),
  documents: (projectId: string) => documents.filter((item) => item.projectId === projectId),
  reports: (projectId: string) => fieldReports.filter((item) => item.projectId === projectId),
  events: (projectId: string) => incomingEvents.filter((item) => item.projectId === projectId),
  requests: (projectId: string) => supplyRequests.filter((item) => item.projectId === projectId),
  deliveries: (projectId: string) => deliveries.filter((item) => item.projectId === projectId),
  crews: (projectId: string) => crews.filter((item) => item.projectId === projectId),
  contract: (projectId: string) => contracts.find((item) => item.projectId === projectId) ?? null,
};

/* ---------- Денежные и объёмные агрегаты ---------- */

/** Единственная функция, из которой берутся деньги объекта на всех экранах. */
export function projectFinance(projectId: string) {
  const entries = byProject.volumes(projectId);
  const contract = byProject.contract(projectId);
  const contractAmount = contract?.amount ?? 0;
  const performedAmount = sum(entries.map((item) => item.amount));
  const approvedAmount = sum(entries.filter((item) => item.approved).map((item) => item.amount));
  const closedAmount = sum(entries.filter((item) => item.closed).map((item) => item.amount));
  const open = entries.filter((item) => !item.closed);
  const project = projects.find((item) => item.id === projectId);
  return {
    contractAmount,
    performedAmount,
    approvedAmount,
    closedAmount,
    paidAmount: project?.paidAmount ?? 0,
    unclosedAmount: sum(open.map((item) => item.qty)),
    unclosedValue: sum(open.map((item) => item.amount)),
    remainingAmount: contractAmount - performedAmount,
    actualProgress: contractAmount ? Math.round((performedAmount / contractAmount) * 1000) / 10 : 0,
  };
}

export function projectVolumes(projectId: string) {
  const zones = byProject.zones(projectId);
  const planQty = sum(zones.map((zone) => zone.planQty));
  const factQty = sum(zones.map((zone) => zone.factQty));
  return { planQty, factQty, remainingQty: planQty - factQty, unit: zones[0]?.unit ?? "м²" };
}

export function zoneVolumes(zoneId: string) {
  const zone = workZones.find((item) => item.id === zoneId);
  const entries = volumeEntries.filter((item) => item.zoneId === zoneId);
  const open = entries.filter((item) => !item.closed);
  return {
    zone,
    planQty: zone?.planQty ?? 0,
    factQty: zone?.factQty ?? 0,
    closedQty: sum(entries.filter((item) => item.closed).map((item) => item.qty)),
    unclosedQty: sum(open.map((item) => item.qty)),
    unclosedValue: sum(open.map((item) => item.amount)),
    entries,
  };
}

/** Портфель: те же цифры, что на дашборде. */
export function portfolioTotals() {
  const finances = projects.map((project) => projectFinance(project.id));
  return {
    projectsCount: projects.length,
    contractAmount: sum(finances.map((item) => item.contractAmount)),
    performedAmount: sum(finances.map((item) => item.performedAmount)),
    closedAmount: sum(finances.map((item) => item.closedAmount)),
    paidAmount: sum(finances.map((item) => item.paidAmount)),
    unclosedAmount: sum(finances.map((item) => item.unclosedAmount)),
    unclosedValue: sum(finances.map((item) => item.unclosedValue)),
    criticalRisks: risks.filter((item) => item.severity === "critical").length,
    overdueTasks: tasks.filter((item) => item.status === "overdue").length,
    eventsToReview: incomingEvents.filter((item) => item.status === "review" || item.status === "extracted").length,
  };
}

/** Ряд «план / факт» по месяцам — для графика, без выдуманных значений. */
export function monthlyVolumeSeries(projectId: string) {
  const entries = [...byProject.volumes(projectId)].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map<string, { month: string; qty: number; amount: number }>();
  for (const item of entries) {
    const month = item.date.slice(0, 7);
    const row = map.get(month) ?? { month, qty: 0, amount: 0 };
    row.qty += item.qty;
    row.amount += item.amount;
    map.set(month, row);
  }
  return [...map.values()];
}

/* ---------- Прослеживаемость ---------- */

export function confidenceBand(value: number): ConfidenceBand {
  if (value >= 0.85) return "verified";
  if (value >= 0.7) return "clarify";
  return "check";
}

export const confidenceLabel: Record<ConfidenceBand, string> = {
  verified: "Проверено",
  clarify: "Требует внимания",
  check: "Не удалось определить",
};

export function sourceById(id: string | null) {
  return id ? (sources.find((item) => item.id === id) ?? null) : null;
}

/** Цепочка происхождения: источник → извлечения → подтверждения → записи журнала. */
export function provenanceOf(entity: string, entityId: string) {
  const entityApprovals = approvals.filter((item) => item.entity === entity && item.entityId === entityId);
  const entityExtractions = extractions.filter((item) => item.appliedTo?.entity === entity && item.appliedTo.id === entityId);
  const sourceIds = new Set<string>([
    ...entityExtractions.map((item) => item.sourceId),
    ...entityApprovals
      .map((item) => extractions.find((ex) => ex.id === item.extractionId)?.sourceId)
      .filter((value): value is string => Boolean(value)),
  ]);
  return {
    sources: sources.filter((item) => sourceIds.has(item.id)),
    extractions: entityExtractions,
    approvals: entityApprovals,
    audit: auditLog.filter((item) => item.entity === entity && item.entityId === entityId),
  };
}

export function employeeById(id: string) {
  return employees.find((item) => item.id === id) ?? null;
}

export function counterpartyById(id: string) {
  return counterparties.find((item) => item.id === id) ?? null;
}

export function materialById(id: string) {
  return materials.find((item) => item.id === id) ?? null;
}

export function offersFor(requestId: string) {
  return supplierOffers.filter((item) => item.requestId === requestId).sort((a, b) => a.total - b.total);
}
