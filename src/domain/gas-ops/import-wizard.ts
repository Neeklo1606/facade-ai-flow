/**
 * Мастер импорта Excel (ADR-061, 12; раздел 4.7, образец ПТО Онлайн): правила, общие для
 * сметы и недельного графика. Лист, строка начала, «что в каких колонках» с примером
 * значения, файл как есть, шаблон и плашка проверки. Чтение файла — адаптер, здесь сетка.
 */
import type { Cell, Grid, ParsedEstimate, SheetGrid } from "./estimate-labels";
import { TOLERANCE_KOPECKS } from "./estimate-labels";
import type { ScheduleParse } from "./schedule";

export function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") return String(cell).replace(".", ",");
  return String(cell).replace(/\s+/g, " ").trim();
}

/** Первый лист, где есть хоть одна заполненная ячейка; нет такого — 0 */
export function firstFilledSheet(sheets: readonly SheetGrid[]): number {
  const index = sheets.findIndex((s) => s.grid.some((row) => row.some((c) => cellText(c) !== "")));
  return index < 0 ? 0 : index;
}

export interface ColumnOption {
  index: number;
  /** Подпись из строки заголовка или «Колонка N» */
  label: string;
  /** Пример значения: первая непустая ячейка колонки ниже заголовка */
  sample: string | null;
}

/** Колонки листа для «что в каких колонках»: подпись заголовка и пример значения */
export function columnsOf(grid: Grid, headerRow: number): ColumnOption[] {
  const width = grid.reduce((a, row) => Math.max(a, row.length), 0);
  const columns: ColumnOption[] = [];
  for (let index = 0; index < width; index++) {
    const head = cellText(grid[headerRow]?.[index]);
    let sample: string | null = null;
    for (let r = headerRow + 1; r < Math.min(grid.length, headerRow + 200); r++) {
      const value = cellText(grid[r]?.[index]);
      if (value) {
        sample = value.length > 40 ? `${value.slice(0, 39)}…` : value;
        break;
      }
    }
    if (!head && sample === null) continue;
    columns.push({ index, label: head || `Колонка ${index + 1}`, sample });
  }
  return columns;
}

/** «Показать файл как есть»: первые строки и колонки листа текстом, номер строки файла слева */
export function rawPreview(grid: Grid, rows = 20, cols = 10): { row: number; cells: string[] }[] {
  return grid.slice(0, rows).map((line, i) => ({
    row: i + 1,
    cells: Array.from({ length: cols }, (_, c) => cellText(line?.[c])),
  }));
}

/** Плашка проверки: зелёная — сходится, жёлтая — есть что посмотреть, красная — применить нельзя */
export interface ImportCheck {
  level: "ok" | "warn" | "error";
  title: string;
  details: string[];
}

/* ---------------------------------------------------------------- График */

export function scheduleCheck(parse: ScheduleParse): ImportCheck {
  if (parse.rows.length === 0) {
    return {
      level: "error",
      title: "Строк графика не нашли",
      details: parse.skipped.slice(0, 5).map((s) => `Строка ${s.row}: ${s.reason}`),
    };
  }
  if (parse.skipped.length > 0) {
    return {
      level: "warn",
      title: `Прочитано строк: ${parse.rows.length}. Пропущено: ${parse.skipped.length}`,
      details: parse.skipped.slice(0, 5).map((s) => `Строка ${s.row}: ${s.reason}`),
    };
  }
  return { level: "ok", title: `Все строки прочитаны: ${parse.rows.length}`, details: [] };
}

/** Шаблон графика: колонки, которые мастер узнаёт сам, и пример строки */
export const SCHEDULE_TEMPLATE: (string | number)[][] = [
  ["Объект", "Номер", "Бригада", "Дата"],
  ["ст. Демо-Северная, ул. Демо, 200 - котел", "ОБ-200", "Бригада 1", "03.10.2026"],
  ["г. Демо-Приречный, ул. Демо, 102 - котел, насос", "ОБ-102", "Бригада 4", "03.10.2026"],
];

/* ---------------------------------------------------------------- Смета */

const rub = (kopecks: number) =>
  `${(kopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;

/** Цены с НДС или без: с каким итогом сходится сумма разделов. Без разделов — по итогу без НДС */
export function guessVatIncluded(parsed: ParsedEstimate): boolean {
  const sum = parsed.sections.reduce((a, s) => a + s.kopecks, 0);
  const { withoutVat, total } = parsed.totals;
  if (!parsed.sections.length || !withoutVat || !total) return false;
  return Math.abs(sum - total.kopecks) < Math.abs(sum - withoutVat.kopecks);
}

/**
 * Сверка суммы позиций (разделов) с итогом (4.7): с НДС — с «ВСЕГО по смете», без НДС —
 * с итогом без НДС. Расхождение больше рубля — жёлтая плашка с суммами и строками файла
 */
export function estimateCheck(parsed: ParsedEstimate, vatIncluded: boolean): ImportCheck {
  if (!parsed.format) {
    return {
      level: "error",
      title: "Форма сметы не распознана",
      details: parsed.issues.map((i) => i.message),
    };
  }
  const target = vatIncluded ? parsed.totals.total : parsed.totals.withoutVat;
  const label = vatIncluded ? "«ВСЕГО по смете»" : "итог без НДС";
  const other = parsed.issues
    .filter((i) => !i.message.startsWith("Сумма разделов"))
    .map((i) => (i.row ? `Строка ${i.row}: ${i.message}` : i.message));
  if (!target) {
    return { level: "warn", title: `Не нашли ${label}`, details: other };
  }
  if (!parsed.sections.length) {
    return {
      level: other.length ? "warn" : "ok",
      title: `Итог ${rub(target.kopecks)} (строка ${target.row}); разделов в смете нет`,
      details: other,
    };
  }
  const sum = parsed.sections.reduce((a, s) => a + s.kopecks, 0);
  const diff = sum - target.kopecks;
  if (Math.abs(diff) > TOLERANCE_KOPECKS) {
    return {
      level: "warn",
      title: `Проверьте колонки: сумма разделов ${rub(sum)} не сходится с ${label} ${rub(target.kopecks)}`,
      details: [
        `Разница ${rub(diff)}. Итог в строке ${target.row}, разделов ${parsed.sections.length}.`,
        ...other,
      ],
    };
  }
  return {
    level: other.length ? "warn" : "ok",
    title: `Разделы сходятся с ${label}: ${rub(target.kopecks)} (строка ${target.row})`,
    details: other,
  };
}

/**
 * Шаблон сметы: минимальный локальный сметный расчёт в форме ГРАНД-Сметы, который мастер
 * разбирает без замечаний. Суммы условные, для проверки колонок
 */
export const ESTIMATE_TEMPLATE: (string | number | null)[][] = [
  ["ГРАНД-Смета", null, null],
  ["ЛОКАЛЬНЫЙ СМЕТНЫЙ РАСЧЕТ (СМЕТА)", null, null],
  ["№ п/п", "Наименование работ и затрат", "Всего в текущем уровне цен"],
  ["1", "Монтаж котла", 80000],
  [null, "Всего по разделу 1 Монтаж", 80000],
  ["2", "Пусконаладка", 20000],
  [null, "Всего по разделу 2 Пусконаладка", 20000],
  [null, "Итоги по смете", null],
  [null, "Всего прямые затраты", 70000],
  [null, "Материалы", 30000],
  [null, "Всего ФОТ", 25000],
  [null, "Всего накладные расходы", 10000],
  [null, "Всего сметная прибыль", 5000],
  [null, "Всего", 100000],
  [null, "НДС 22%", 22000],
  [null, "ВСЕГО по смете", 122000],
];
