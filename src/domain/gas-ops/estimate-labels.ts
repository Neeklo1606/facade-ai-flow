/**
 * Подписи и типы разбора смет (ADR-053): маленький модуль, который экраны грузят сразу.
 * Сам разбор (`estimate-parse.ts`) грузится только после выбора файла.
 */
export type Cell = string | number | null | undefined;
export type Grid = Cell[][];

export type EstimateFormat = "grand" | "resource";

export const ESTIMATE_FORMAT_LABEL: Record<EstimateFormat, string> = {
  grand: "ГРАНД-Смета, локальный сметный расчёт",
  resource: "Ресурсная смета 14 граф",
};

/** Строки итогов, которые достаёт разбор */
export type TotalKey =
  "direct" | "materials" | "payroll" | "overhead" | "profit" | "withoutVat" | "vat" | "total";

export const TOTAL_LABEL: Record<TotalKey, string> = {
  direct: "Всего прямые затраты",
  materials: "Материалы",
  payroll: "ФОТ",
  overhead: "Накладные расходы",
  profit: "Сметная прибыль",
  withoutVat: "Всего без НДС",
  vat: "НДС",
  total: "ВСЕГО по смете",
};

export const TOTAL_ORDER: TotalKey[] = [
  "direct",
  "materials",
  "payroll",
  "overhead",
  "profit",
  "withoutVat",
  "vat",
  "total",
];

/** Значение с источником: копейки и строка файла, считая с 1 */
export interface Sourced {
  kopecks: number;
  row: number;
}

export interface EstimateSection {
  title: string;
  kopecks: number;
  row: number;
}

export interface EstimateIssue {
  /** Строка файла, к которой относится замечание; null — замечание ко всему файлу */
  row: number | null;
  message: string;
}

export type ParseStatus = "parsed" | "needs-review" | "unknown-format";

export const PARSE_STATUS_LABEL: Record<ParseStatus, string> = {
  parsed: "Разобрана",
  "needs-review": "Требует проверки сметчиком",
  "unknown-format": "Формат не распознан",
};

export interface ParsedEstimate {
  format: EstimateFormat | null;
  status: ParseStatus;
  totals: Partial<Record<TotalKey, Sourced>>;
  /** Ставка НДС в процентах из подписи строки: «НДС 22%» */
  vatRate: number | null;
  sections: EstimateSection[];
  /** Нормативные трудозатраты рабочих, чел.-ч */
  laborHours: { value: number; row: number } | null;
  issues: EstimateIssue[];
}

/** Допуск сверки: 1 ₽ (ADR-053, 1). Округления разделов в сметах дают копейки */
export const TOLERANCE_KOPECKS = 100;

export interface SheetGrid {
  name: string;
  grid: Grid;
}

export interface ParsedWorkbook extends ParsedEstimate {
  /** Лист, с которого взяты итоги: в ресурсной смете рядом лежит пустой лист «12 граф» */
  sheet: string | null;
}
