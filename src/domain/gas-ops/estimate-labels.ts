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
  /** Номер раздела из подписи «Раздел 3. …»; null — номера в подписи нет (ADR-077) */
  number?: string | null;
  /** Разбивка из блока «Итоги по разделу»; нет ключа — версия до ADR-077 */
  breakdown?: SectionBreakdown;
  /** Строки испытаний внутри раздела (ГЭСН19-01-015 и похожие) */
  pressureLines?: PressureLine[];
}

/** Что в разделе есть в файле. Чего нет в блоке итогов раздела — null с причиной */
export type SectionPartKey =
  "direct" | "materials" | "machines" | "payroll" | "overhead" | "profit";

export const SECTION_PART_LABEL: Record<SectionPartKey, string> = {
  direct: "Прямые затраты",
  materials: "Материалы",
  machines: "Машины и механизмы",
  payroll: "ФОТ",
  overhead: "Накладные расходы",
  profit: "Сметная прибыль",
};

export type SectionPart =
  { kopecks: number; row: number; note?: string } | { kopecks: null; row: null; note: string };

export interface SectionBreakdown {
  parts: Record<SectionPartKey, SectionPart>;
  /** Нормативные трудозатраты рабочих раздела, чел.-ч */
  laborHours: { value: number; row: number } | null;
  /** Раздел целиком — испытания: по названию «Испытания», «Опрессовка» */
  pressureSection: boolean;
}

/**
 * Строка испытаний внутри раздела. Суммы строки — прямые затраты и их состав; готовая сумма
 * с НР и СП есть только в ГРАНД-Смете («Всего по позиции»)
 */
export interface PressureLine {
  row: number;
  code: string;
  name: string;
  directKopecks: number;
  payrollKopecks: number;
  materialsKopecks: number;
  /** «Всего по позиции» из файла; null — в файле нет, считается долей раздела */
  totalKopecks: number | null;
  totalRow: number | null;
}

/** Поле шапки сметы: значение со строкой файла или пусто с причиной, без догадок */
export type HeaderField =
  | { value: string; row: number; confidence: "high" | "medium" }
  | { value: null; row: null; reason: string };

export interface EstimateAddress {
  /** «г. Славянск-на-Кубани»: как в файле, падеж файла */
  settlement: string | null;
  street: string | null;
  house: string | null;
  apartment: string | null;
}

export interface EstimateHeader {
  /** Наименование работ и затрат */
  works: HeaderField;
  /** Наименование объекта; в ресурсной смете одна строка на работы и объект */
  object: HeaderField;
  /** Адрес, выделенный из наименования: строка источника та же */
  address: { value: EstimateAddress; row: number } | { value: null; row: null; reason: string };
  /** Номер сметы, КП или договора */
  number: HeaderField;
  /** Дата документа, ISO «2026-07-10» */
  date: HeaderField;
  /** Вид работ: начало наименования до адреса */
  workKind: HeaderField;
  /** Вид документа: «Коммерческое предложение», «Локальный сметный расчёт» */
  docKind: HeaderField;
}

/**
 * Строка с суммой ниже «ВСЕГО по смете» (F4): «Технадзор», «Врезка». В итоги не входит,
 * правило состава может взять её слагаемым по подписи
 */
export interface EstimateExtra {
  label: string;
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
  /** Строки с суммой ниже «ВСЕГО по смете», по порядку файла */
  extras: EstimateExtra[];
  issues: EstimateIssue[];
  /** Шапка сметы (ADR-077); нет ключа — разбор до шапки */
  header?: EstimateHeader;
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
