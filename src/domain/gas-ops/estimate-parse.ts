/**
 * Разбор сметы заказчика (ADR-053, раздел 1). Чистая функция над сеткой строк: файл читает
 * адаптер `src/adapters/gas-ops/estimate-file.ts`, здесь только правила. Деньги внутри —
 * копейки целыми числами, чтобы сложение разделов не копило ошибку плавающей точки.
 *
 * Два формата определяются по содержимому:
 * - «grand» — ГРАНД-Смета, локальный сметный расчёт по приказу 421/пр;
 * - «resource» — ресурсная смета 14 граф («Осн.З/п», «Эк.Маш.», «З/пМех», «Мат»).
 *
 * У каждого значения номер строки файла: без источника значение не показывается.
 */

import type {
  Cell,
  EstimateFormat,
  Grid,
  ParseStatus,
  ParsedEstimate,
  ParsedWorkbook,
  SheetGrid,
  TotalKey,
} from "./estimate-labels";
import { TOLERANCE_KOPECKS } from "./estimate-labels";

export * from "./estimate-labels";

/** Число из ячейки: 12622.61, «12622,61», «126779.78», «1 234,5». Прочее — null */
export function cellNumber(cell: Cell): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== "string") return null;
  const s = cell.replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function toKopecks(value: number): number {
  return Math.round(value * 100);
}

function text(cell: Cell): string {
  return typeof cell === "string" ? cell.replace(/\s+/g, " ").trim() : "";
}

/** Первая текстовая ячейка строки, не похожая на число: подпись строки */
function labelOf(row: Cell[]): { label: string; col: number } | null {
  for (let col = 0; col < row.length; col++) {
    const t = text(row[col]);
    if (t && cellNumber(t) === null) return { label: t, col };
  }
  return null;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/** Найти колонку по подписи заголовка в первых строках таблицы */
function findHeaderCol(grid: Grid, test: (t: string) => boolean): number | null {
  for (const row of grid) {
    for (let col = 0; col < row.length; col++) {
      if (test(norm(text(row[col])))) return col;
    }
  }
  return null;
}

/** Определить формат по содержимому, а не по расширению файла */
export function detectFormat(grid: Grid): EstimateFormat | null {
  let resourceHeads = 0;
  let grand = false;
  let sectionTotals = false;
  for (const row of grid) {
    for (const cell of row) {
      const t = norm(text(cell));
      if (!t) continue;
      if (t === "осн.з/п" || t === "эк.маш." || t === "з/пмех" || t === "мат") resourceHeads++;
      if (t.includes("гранд-смета")) grand = true;
      if (t.startsWith("всего по разделу")) sectionTotals = true;
    }
  }
  if (resourceHeads >= 3) return "resource";
  if (grand || sectionTotals) return "grand";
  return null;
}

/**
 * Значение строки в колонке сумм. Если колонка не найдена или пуста, берётся первое число
 * правее подписи: в ресурсной смете подпись в колонке 0, сумма в «общей».
 */
function amountOf(row: Cell[], amountCol: number | null, labelCol: number): number | null {
  if (amountCol !== null) {
    const v = cellNumber(row[amountCol]);
    if (v !== null) return v;
  }
  for (let col = labelCol + 1; col < row.length; col++) {
    const v = cellNumber(row[col]);
    if (v !== null) return v;
  }
  return null;
}

/** Сопоставление подписи строки итогов с ключом. Порядок проверок важен */
function totalKeyOf(label: string, format: EstimateFormat): TotalKey | null {
  const l = norm(label);
  if (/^всего по смете$/.test(l)) return "total";
  if (/^ндс\b/.test(l) || l.startsWith("ндс ")) return "vat";
  if (format === "grand") {
    if (l === "всего") return "withoutVat";
    if (l.startsWith("всего прямые затраты")) return "direct";
    if (l === "материалы") return "materials";
    if (l.startsWith("всего фот")) return "payroll";
    if (l.startsWith("всего накладные расходы")) return "overhead";
    if (l.startsWith("всего сметная прибыль")) return "profit";
    return null;
  }
  if (l === "итого") return "withoutVat";
  if (l.startsWith("итого прямые затраты по смете")) return "direct";
  if (l === "материалы") return "materials";
  if (l === "фот") return "payroll";
  if (l === "накладные расходы") return "overhead";
  if (l === "сметная прибыль") return "profit";
  return null;
}

/**
 * Разобрать смету. Сначала формат, потом колонки сумм и трудозатрат по заголовкам,
 * потом проход по строкам: разделы, блок «Итоги по смете», строки после итога.
 */
export function parseEstimateGrid(grid: Grid): ParsedEstimate {
  const format = detectFormat(grid);
  const result: ParsedEstimate = {
    format,
    status: "unknown-format",
    totals: {},
    vatRate: null,
    sections: [],
    laborHours: null,
    issues: [],
  };
  if (!format) {
    result.issues.push({
      row: null,
      message:
        "Не нашли признаков ГРАНД-Сметы или ресурсной сметы 14 граф. Нужен локальный сметный расчёт с блоком «Итоги по смете».",
    });
    return result;
  }

  const amountCol =
    format === "grand"
      ? findHeaderCol(grid, (t) => t === "всего в текущем уровне цен")
      : findHeaderCol(grid, (t) => t === "общая");
  const laborCol =
    format === "grand"
      ? findHeaderCol(grid, (t) => t === "всего с учетом коэффициентов")
      : findHeaderCol(grid, (t) => t.startsWith("т/з осн"));

  let inTotals = false;
  let afterTotal = false;

  grid.forEach((row, index) => {
    const rowNumber = index + 1;
    const found = labelOf(row);
    if (!found) return;
    const { label, col } = found;
    const l = norm(label);
    const amount = amountOf(row, amountCol, col);

    // Трудозатраты ГРАНД-Сметы стоят справочно под строкой «ВСЕГО по смете»
    if (format === "grand" && (inTotals || afterTotal) && l.startsWith("затраты труда")) {
      if (l.startsWith("затраты труда рабочих")) {
        const t = laborCol !== null ? cellNumber(row[laborCol]) : amountOf(row, null, col);
        if (t !== null) result.laborHours = { value: t, row: rowNumber };
      }
      return;
    }

    if (afterTotal) {
      if (amount !== null && amount !== 0) {
        result.issues.push({
          row: rowNumber,
          message: `Ниже строки «ВСЕГО по смете» есть строка «${label}» с суммой. Какой итог настоящий, решает сметчик.`,
        });
      }
      return;
    }

    // Разделы: «Всего по разделу N …» (А) и «Итого по разделу N …» (Б)
    const sectionMatch =
      format === "grand"
        ? /^всего по разделу\s*(.*)$/.exec(l)
        : /^итого по разделу\s*(.*)$/.exec(l);
    if (sectionMatch && amount !== null) {
      const title = label.replace(/^(всего|итого) по разделу\s*/i, "").trim();
      result.sections.push({
        title: title ? `Раздел ${title}` : "Раздел без названия",
        kopecks: toKopecks(amount),
        row: rowNumber,
      });
      return;
    }

    if (l.startsWith("итоги по смете")) {
      inTotals = true;
      return;
    }
    // В ресурсной смете прямые затраты стоят строкой выше «Итоги по смете:», под «ИТОГИ ПО СМЕТЕ:»
    if (format === "resource" && l.startsWith("итого прямые затраты по смете")) {
      if (amount !== null) result.totals.direct = { kopecks: toKopecks(amount), row: rowNumber };
      const t = laborCol !== null ? cellNumber(row[laborCol]) : null;
      if (t !== null) result.laborHours = { value: t, row: rowNumber };
      return;
    }
    if (!inTotals) return;

    const key = totalKeyOf(label, format);
    if (!key || amount === null) return;
    // Первое вхождение побеждает: в ГРАНД-Смете «материалы» повторяются в разбивке по видам работ
    if (!result.totals[key]) result.totals[key] = { kopecks: toKopecks(amount), row: rowNumber };
    if (key === "vat") {
      const rate = /(\d+(?:[.,]\d+)?)\s*%/.exec(label);
      result.vatRate = rate ? Number(rate[1]!.replace(",", ".")) : null;
    }
    if (key === "withoutVat" && format === "resource") {
      const t = laborCol !== null ? cellNumber(row[laborCol]) : null;
      if (t !== null) result.laborHours = { value: t, row: rowNumber };
    }
    if (key === "total") afterTotal = true;
  });

  check(result);
  return result;
}

function fmt(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

/** Сверки ADR-053, раздел 1: нет итога, разделы, НДС, строки после итога */
function check(result: ParsedEstimate): void {
  const { totals, sections, issues } = result;
  if (!totals.withoutVat) {
    issues.push({ row: null, message: "Не нашли строку итога без НДС в блоке «Итоги по смете»." });
  }
  if (!totals.total) {
    issues.push({ row: null, message: "Не нашли строку «ВСЕГО по смете»." });
  }
  if (!totals.materials) {
    issues.push({ row: null, message: "Не нашли строку «Материалы» в итогах сметы." });
  }
  if (totals.withoutVat && sections.length > 0) {
    const sum = sections.reduce((a, s) => a + s.kopecks, 0);
    const diff = sum - totals.withoutVat.kopecks;
    if (Math.abs(diff) > TOLERANCE_KOPECKS) {
      issues.push({
        row: totals.withoutVat.row,
        message: `Сумма разделов ${fmt(sum)} не равна итогу без НДС ${fmt(totals.withoutVat.kopecks)}: разница ${fmt(diff)}.`,
      });
    }
  }
  if (totals.withoutVat && totals.total) {
    const vat = totals.vat?.kopecks ?? 0;
    const diff = totals.withoutVat.kopecks + vat - totals.total.kopecks;
    if (Math.abs(diff) > TOLERANCE_KOPECKS) {
      issues.push({
        row: totals.total.row,
        message: `Без НДС плюс НДС не равно «ВСЕГО по смете»: разница ${fmt(diff)}.`,
      });
    }
  }
  result.status = issues.length === 0 ? "parsed" : "needs-review";
}

/** Сумма разделов, копейки: для показа «разделы сходятся с итогом» */
export function sectionsSum(parsed: ParsedEstimate): number {
  return parsed.sections.reduce((a, s) => a + s.kopecks, 0);
}

const STATUS_RANK: Record<ParseStatus, number> = {
  parsed: 2,
  "needs-review": 1,
  "unknown-format": 0,
};

/**
 * Разобрать книгу: каждый лист отдельно, побеждает разобранный без замечаний, затем лист
 * с большим числом найденных итогов. Так пустой лист-шаблон не перебивает настоящую смету.
 */
export function parseEstimateWorkbook(sheets: SheetGrid[]): ParsedWorkbook {
  let best: ParsedWorkbook | null = null;
  for (const sheet of sheets) {
    const parsed = { ...parseEstimateGrid(sheet.grid), sheet: sheet.name };
    if (
      !best ||
      STATUS_RANK[parsed.status] > STATUS_RANK[best.status] ||
      (STATUS_RANK[parsed.status] === STATUS_RANK[best.status] &&
        Object.keys(parsed.totals).length > Object.keys(best.totals).length)
    ) {
      best = parsed;
    }
  }
  return best ?? { ...parseEstimateGrid([]), sheet: null };
}
