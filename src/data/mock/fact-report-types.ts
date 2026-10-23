/**
 * Форма недельного отчёта (ADR-043, ADR-047): одна и та же у набора заказчика
 * (`fact-report.ts`, только сервер и тесты) и у публичного набора «Демо-подрядчик»
 * (`public/fact-report.public.json`). Модуль без данных: его можно импортировать откуда угодно.
 */
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
  /** Рамки смен из строк интервалов: вынуты скриптом, дерева строк в наборе вкладки нет */
  frames: ShiftFrame[];
  grandTotal: { label: string; excelRow: number; values: FactDayValue[]; total: FactDayValue };
}

/** Рамка смены: кому принадлежит, за какой день, какая рамка */
export interface ShiftFrame {
  brigadeId: string;
  employeeId: string | null;
  day: string;
  /** «8.20-16.40» как в файле */
  frame: string;
  excelRow: number;
}
