import type { Contract, Milestone, Project, ProjectStatus } from "./types";
import { volumeEntries, workZones } from "./work";

export const contracts: Contract[] = [
  { id: "ct-korona", number: "ДСК-2026/008", projectId: "p-korona", customerId: "c-dsk", signedAt: "2026-04-18", startDate: "2026-05-12", endDate: "2027-03-31", amount: 95_400_000, advance: 19_080_000, retentionPct: 5, paymentTermDays: 30, status: "active", sourceId: "src-contract-korona" },
  { id: "ct-meridian", number: "ПС-2026/117", projectId: "p-meridian", customerId: "c-proekt", signedAt: "2026-05-06", startDate: "2026-06-01", endDate: "2026-12-20", amount: 31_800_000, advance: 6_360_000, retentionPct: 5, paymentTermDays: 45, status: "active", sourceId: null },
  { id: "ct-primorsky", number: "СИ-2026/041", projectId: "p-primorsky", customerId: "c-stroyinvest", signedAt: "2026-04-29", startDate: "2026-05-20", endDate: "2027-01-30", amount: 47_200_000, advance: 9_440_000, retentionPct: 5, paymentTermDays: 30, status: "active", sourceId: null },
  { id: "ct-school", number: "СИ-2026/052", projectId: "p-school", customerId: "c-stroyinvest", signedAt: "2026-03-21", startDate: "2026-04-10", endDate: "2026-10-10", amount: 18_300_000, advance: 3_660_000, retentionPct: 3, paymentTermDays: 20, status: "active", sourceId: null },
  { id: "ct-galaxy", number: "ГЛ-2026/013", projectId: "p-galaxy", customerId: "c-galaxy", signedAt: "2026-05-30", startDate: "2026-06-15", endDate: "2026-12-15", amount: 26_500_000, advance: 5_300_000, retentionPct: 5, paymentTermDays: 30, status: "active", sourceId: null },
];

export const milestones: Milestone[] = [
  { id: "ms-k-1", contractId: "ct-korona", projectId: "p-korona", name: "Этап 1: захватки 1–2", dueDate: "2026-09-10", requirement: "Сдать 8800 м² облицовки", status: "at_risk", sourceId: "src-contract-korona", location: "стр. 4, п. 3.2" },
  { id: "ms-k-2", contractId: "ct-korona", projectId: "p-korona", name: "Этап 2: захватка 3", dueDate: "2026-11-30", requirement: "Сдать 5200 м² облицовки", status: "planned", sourceId: "src-contract-korona", location: "стр. 4, п. 3.3" },
  { id: "ms-k-3", contractId: "ct-korona", projectId: "p-korona", name: "Этап 3: стилобат и сдача", dueDate: "2027-03-31", requirement: "Полная сдача фасада", status: "planned", sourceId: "src-contract-korona", location: "стр. 5, п. 3.4" },
  { id: "ms-m-1", contractId: "ct-meridian", projectId: "p-meridian", name: "Этап 1: северный фасад", dueDate: "2026-09-30", requirement: "Сдать 4200 м²", status: "at_risk", sourceId: null, location: "стр. 3, п. 2.4" },
  { id: "ms-p-1", contractId: "ct-primorsky", projectId: "p-primorsky", name: "Контрольная точка 2", dueDate: "2026-10-15", requirement: "Закрыть 40% объёмов", status: "planned", sourceId: null, location: "стр. 4" },
  { id: "ms-s-1", contractId: "ct-school", projectId: "p-school", name: "Сдача к учебному году", dueDate: "2026-10-10", requirement: "Полная сдача фасада", status: "overdue", sourceId: null, location: "стр. 2, п. 1.6" },
  { id: "ms-g-1", contractId: "ct-galaxy", projectId: "p-galaxy", name: "Этап 1: входная группа", dueDate: "2026-09-30", requirement: "Сдать 1400 м² витражей", status: "at_risk", sourceId: null, location: "стр. 3" },
];

interface ProjectSeed {
  id: string;
  name: string;
  code: string;
  customer: string;
  plannedProgress: number;
  paidAmount: number;
  status: ProjectStatus;
  manager: string;
  teams: string[];
}

const seeds: ProjectSeed[] = [
  { id: "p-korona", name: "ЖК «Северная Корона», корпус 3", code: "СК-3", customer: "ДСК-Регион", plannedProgress: 52, paidAmount: 32_000_000, status: "at_risk", manager: "e-sokolov", teams: ["cr-korona-1", "cr-korona-2"] },
  { id: "p-meridian", name: "БЦ «Меридиан»", code: "МР-1", customer: "«Проектстрой»", plannedProgress: 58, paidAmount: 11_400_000, status: "active", manager: "e-sokolov", teams: ["cr-meridian-1"] },
  { id: "p-primorsky", name: "ЖК «Приморский квартал», дом 7", code: "ПК-7", customer: "ГК «Стройинвест»", plannedProgress: 61, paidAmount: 16_900_000, status: "active", manager: "e-sokolov", teams: ["cr-primorsky-1"] },
  { id: "p-school", name: "Школа № 1547, реконструкция фасада", code: "Ш-1547", customer: "ГК «Стройинвест»", plannedProgress: 88, paidAmount: 9_800_000, status: "at_risk", manager: "e-sokolov", teams: ["cr-school-1"] },
  { id: "p-galaxy", name: "ТРК «Галактика», витражи", code: "ГЛ-2", customer: "УК «Галактика»", plannedProgress: 44, paidAmount: 5_900_000, status: "active", manager: "e-sokolov", teams: ["cr-galaxy-1"] },
];

function sum(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0);
}

/** Денежные и объёмные показатели объекта считаются из записей объёмов. */
export const projects: Project[] = seeds.map((seed) => {
  const contract = contracts.find((item) => item.projectId === seed.id)!;
  const entries = volumeEntries.filter((item) => item.projectId === seed.id);
  const zones = workZones.filter((item) => item.projectId === seed.id);
  const performedAmount = sum(entries.map((item) => item.amount));
  const approvedAmount = sum(entries.filter((item) => item.approved).map((item) => item.amount));
  const closedAmount = sum(entries.filter((item) => item.closed).map((item) => item.amount));
  const open = entries.filter((item) => !item.closed);
  return {
    id: seed.id,
    name: seed.name,
    code: seed.code,
    customer: seed.customer,
    contract: contract.number,
    startDate: contract.startDate,
    endDate: contract.endDate,
    plannedProgress: seed.plannedProgress,
    actualProgress: Math.round((performedAmount / contract.amount) * 1000) / 10,
    contractAmount: contract.amount,
    performedAmount,
    approvedAmount,
    closedAmount,
    paidAmount: seed.paidAmount,
    unclosedAmount: sum(open.map((item) => item.qty)),
    unclosedValue: sum(open.map((item) => item.amount)),
    status: seed.status,
    manager: seed.manager,
    teams: seed.teams,
    workZones: zones.map((zone) => zone.id),
  } satisfies Project;
});

export function projectById(id: string) {
  return projects.find((item) => item.id === id) ?? null;
}

export function projectName(id: string) {
  return projectById(id)?.name ?? "—";
}
