/**
 * Анонимизированная выгрузка фактического отчёта заказчика и типы над ней.
 * JSON собирает `scripts/parse-fact-report.ts` из `docs/source/fact-report.xlsx`
 * (реальный файл в git не попадает). Руками JSON не правим: его перезапишет скрипт.
 */
import raw from "./fact-report.anonymized.json";

export interface FactDayValue {
  day: number;
  amount: number | null;
  hours: number | null;
  revenue: number | null;
}

export type FactNodeKind = "group" | "brigade" | "employee" | "crew" | "address";

export interface FactNode {
  id: string;
  kind: FactNodeKind;
  label: string;
  excelRow: number;
  level: number;
  settlement?: string | null;
  workType?: string | null;
  values: FactDayValue[];
  total: FactDayValue;
  /** Рамка смены по дням: индекс дня → «8.20-16.40» */
  frames?: Record<string, string>;
  framesTotal?: string | null;
  children: FactNode[];
}

export interface FactEntry {
  id: string;
  day: string;
  dayIndex: number;
  groupId: string;
  brigadeId: string;
  employeeId: string | null;
  objectId: string;
  amount: number | null;
  hours: number | null;
  minutes: number | null;
  revenueInFile: number | null;
  excelRow: number;
  source: "fact-report";
}

export interface FactReport {
  meta: {
    source: "fact-report";
    sheet: string;
    rows: number;
    columns: number;
    week: { from: string; to: string };
    days: string[];
    generatedBy: string;
    note: string;
  };
  groups: { id: string; name: string; code: string | null; excelRow: number }[];
  brigades: { id: string; groupId: string; name: string; code: string; excelRow: number }[];
  employees: {
    id: string;
    brigadeId: string;
    name: string;
    isLead: boolean;
    excelRow: number;
  }[];
  objects: {
    id: string;
    label: string;
    settlement: string | null;
    workType: string | null;
    demoNumber: number;
  }[];
  entries: FactEntry[];
  tree: FactNode[];
  grandTotal: { label: string; excelRow: number; values: FactDayValue[]; total: FactDayValue };
}

export const factReport = raw as unknown as FactReport;

/** Дни недели отчёта: 28.09 — 03.10.2026 */
export const factDays = factReport.meta.days;

/** Рамки смен из строк интервалов: кому принадлежит, за какой день, какая рамка */
export interface ShiftFrame {
  brigadeId: string;
  employeeId: string | null;
  day: string;
  /** «8.20-16.40» как в файле */
  frame: string;
  excelRow: number;
}

export function shiftFrames(): ShiftFrame[] {
  const out: ShiftFrame[] = [];
  const walk = (node: FactNode, brigadeId: string | null, employeeId: string | null) => {
    const brigade =
      node.kind === "brigade"
        ? (factReport.brigades.find((b) => b.excelRow === node.excelRow)?.id ?? brigadeId)
        : brigadeId;
    const employee =
      node.kind === "employee" || node.kind === "crew"
        ? (factReport.employees.find((e) => e.excelRow === node.excelRow)?.id ?? employeeId)
        : employeeId;
    if (node.frames && brigade) {
      for (const [dayIndex, frame] of Object.entries(node.frames)) {
        out.push({
          brigadeId: brigade,
          employeeId: employee,
          day: factDays[Number(dayIndex)]!,
          frame,
          excelRow: node.excelRow,
        });
      }
    }
    for (const child of node.children) walk(child, brigade, employee);
  };
  for (const root of factReport.tree) walk(root, null, null);
  return out;
}
