/**
 * Независимая сверка разбора смет (П1 плана критического тестирования). Каждый файл каталога
 * читается второй раз своим путём и считается «вручную»: .xlsx через exceljs (разбор сервиса
 * читает SheetJS), .xls через SheetJS (exceljs старый формат не читает). Ручной счёт ищет
 * строки по подписи, а не через правила `src/domain/gas-ops`, и сравнивает:
 *
 * - итог без НДС, НДС, ВСЕГО по смете; арифметику «без НДС + НДС = ВСЕГО» и ставку НДС;
 * - итог каждого раздела, сумму разделов против итога без НДС;
 * - материалы и трудозатраты раздела, трудозатраты сметы;
 * - опрессовку: раздел испытаний целиком или строки испытаний внутри раздела
 *   (прямые затраты строки плюс НР и СП по доле её ФОТ, как в ADR-077);
 * - перевозку в итогах раздела (ГРАНД): она не материалы, разбор показывает её отдельно;
 * - шапку: номер КП, дату, строку и текст объекта, дом и квартиру адреса; сметную стоимость
 *   шапки против «ВСЕГО по смете».
 *
 * Файлы заказчика лежат вне git (`.local/estimates`). Вывод не содержит сумм, адресов и имён
 * файлов: только номер файла, проверка и разница в копейках. Суммы печатает флаг `--show`
 * (только для своего терминала, не в логи).
 *
 * Запуск: `bun scripts/estimate-crosscheck.ts [каталог] [--show]`. Код выхода 1 — расхождение.
 */
import ExcelJS from "exceljs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sheetsOfXls, sheetsOfXlsx } from "@/adapters/gas-ops/estimate-file";
import { parseEstimateWorkbook } from "@/domain/gas-ops/estimate-parse";
import { sectionView } from "@/domain/gas-ops/estimate-intake";
import type { Cell, SheetGrid } from "@/domain/gas-ops/estimate-labels";

const args = process.argv.slice(2);
const show = args.includes("--show");
const dir = args.find((a) => !a.startsWith("--")) ?? ".local/estimates";

/* ------------------------------------------------------------ чтение exceljs */

function plain(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return null;
  if (v instanceof Date) return v.toISOString();
  const o = v as unknown as Record<string, unknown>;
  if (Array.isArray(o["richText"]))
    return (o["richText"] as { text: string }[]).map((t) => t.text).join("");
  if ("result" in o) return (o["result"] as Cell) ?? null;
  if (typeof o["text"] === "string") return o["text"];
  return null;
}

async function sheetsByExcelJs(path: string): Promise<SheetGrid[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return wb.worksheets.map((ws) => {
    const grid: Cell[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells: Cell[] = [];
      for (let c = 1; c <= Math.max(ws.columnCount, row.cellCount); c++) {
        const cell = row.getCell(c);
        // Объединённая ячейка: значение только у главной, как в SheetJS
        cells.push(cell.isMerged && cell.master !== cell ? null : plain(cell.value));
      }
      grid.push(cells);
    }
    return { name: ws.name, grid };
  });
}

/* ------------------------------------------------------------- ручной счёт */

const num = (c: Cell): number | null => {
  if (typeof c === "number") return c;
  if (typeof c !== "string") return null;
  const s = c.replace(/\s/g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};
const kop = (x: number) => Math.round(x * 100);
const txt = (c: Cell) => (typeof c === "string" ? c.replace(/\s+/g, " ").trim() : "");
const label = (row: Cell[]) => {
  for (const c of row) {
    const t = txt(c);
    if (t && num(t) === null) return t;
  }
  return "";
};
/** Первое число строки правее подписи: колонка сумм (в ресурсной правее идут т/з) */
function firstNumber(row: Cell[], from = 0): { value: number; col: number } | null {
  for (let c = from; c < row.length; c++) {
    const v = num(row[c] ?? null);
    if (v !== null && !(typeof row[c] === "string" && /^\d+$/.test(txt(row[c])) && c < 3))
      return { value: v, col: c };
  }
  return null;
}

interface ManualSection {
  number: string | null;
  isPressure: boolean;
  totalKop: number;
  totalRow: number;
  materialsKop: number | null;
  laborHours: number | null;
  pressureLinesKop: number | null;
  transportKop: number | null;
}
interface Manual {
  sheet: string;
  withoutVat: number | null;
  vat: number | null;
  vatRate: number | null;
  total: number | null;
  totalRow: number | null;
  laborHours: number | null;
  sections: ManualSection[];
  number: string | null;
  date: string | null;
  object: string | null;
  objectRow: number | null;
  house: string | null;
  apartment: string | null;
  /** «Сметная стоимость» шапки в копейках (ГРАНД пишет в тыс. руб., точность 10 ₽) */
  headerCostKop: number | null;
  headerCostTolerance: number;
}

/** Лист сметы: тот, где есть «ВСЕГО по смете» с числом (пустой «12 граф» отпадает) */
function pickSheet(sheets: SheetGrid[]): SheetGrid | null {
  return (
    sheets.find((s) =>
      s.grid.some((r) => /^всего по смете/i.test(label(r)) && firstNumber(r) !== null),
    ) ?? null
  );
}

function manualCount(sheets: SheetGrid[]): Manual | null {
  const sheet = pickSheet(sheets);
  if (!sheet) return null;
  const g = sheet.grid;
  const lbl = g.map(label);
  const m: Manual = {
    sheet: sheet.name,
    withoutVat: null,
    vat: null,
    vatRate: null,
    total: null,
    totalRow: null,
    laborHours: null,
    sections: [],
    number: null,
    date: null,
    object: null,
    objectRow: null,
    house: null,
    apartment: null,
    headerCostKop: null,
    headerCostTolerance: 0,
  };
  const totalIdx = lbl.findIndex((l) => /^всего по смете/i.test(l));
  m.total = kop(firstNumber(g[totalIdx]!)!.value);
  m.totalRow = totalIdx + 1;
  const vatIdx = lbl.findIndex((l, i) => i < totalIdx && /^ндс\s*\d+/i.test(l));
  if (vatIdx >= 0) {
    m.vat = kop(firstNumber(g[vatIdx]!)!.value);
    m.vatRate = Number(/(\d+)/.exec(lbl[vatIdx]!)![1]);
  }
  // Итог без НДС: «Всего» (ГРАНД) или «Итого» (ресурсная) после «Итоги по смете»
  const sumsIdx = lbl.findIndex((l) => /^итоги по смете/i.test(l));
  for (let i = sumsIdx + 1; i < totalIdx; i++) {
    if (/^(всего|итого)$/i.test(lbl[i]!)) {
      m.withoutVat = kop(firstNumber(g[i]!)!.value);
      // Ресурсная смета: т/з в той же строке правее суммы
      const rest = g[i]!.slice(firstNumber(g[i]!)!.col + 1)
        .map(num)
        .filter((x) => x !== null);
      if (rest.length) m.laborHours = rest[0]!;
      break;
    }
  }
  for (let i = totalIdx + 1; i < Math.min(g.length, totalIdx + 4); i++) {
    if (/^затраты труда рабочих/i.test(lbl[i]!)) m.laborHours = firstNumber(g[i]!)!.value;
  }

  // Разделы: заголовок «Раздел N. …», итог «Всего/Итого по разделу N …»
  let start = 0;
  let title = "";
  for (let i = 0; i < g.length; i++) {
    const l = lbl[i]!;
    if (/^раздел\s*\d*/i.test(l)) {
      start = i;
      title = l;
      continue;
    }
    const close = /^(всего|итого) по разделу\s*(\d+)?/i.exec(l);
    if (!close) continue;
    const amount = firstNumber(g[i]!)!;
    const sec: ManualSection = {
      number: close[2] ?? null,
      isPressure: /испытан|опрессов/i.test(title),
      totalKop: kop(amount.value),
      totalRow: i + 1,
      materialsKop: null,
      laborHours: null,
      pressureLinesKop: null,
      transportKop: null,
    };
    const restHours = g[i]!.slice(amount.col + 1)
      .map(num)
      .filter((x) => x !== null);
    if (restHours.length) sec.laborHours = restHours[0]!;
    // Материалы — строка «Материалы» с заглавной в блоке итогов раздела
    for (let j = i - 1; j > start; j--) {
      if (/^итоги по разделу/i.test(lbl[j]!)) break;
      if (txt(g[j]!.find((c) => txt(c)) ?? null) === "Материалы")
        sec.materialsKop = kop(firstNumber(g[j]!)!.value);
      // Перевозка: в ГРАНД строка повторяется в «Строительные работы, в том числе» — та же сумма
      if (/^перевозка$/i.test(lbl[j]!)) sec.transportKop = kop(firstNumber(g[j]!)!.value);
    }
    if (sec.materialsKop === null) sec.materialsKop = 0;
    for (let j = i + 1; j < Math.min(g.length, i + 3); j++) {
      if (/^затраты труда рабочих/i.test(lbl[j]!)) sec.laborHours = firstNumber(g[j]!)!.value;
    }
    if (!sec.isPressure) sec.pressureLinesKop = pressureLines(g, lbl, start, i);
    m.sections.push(sec);
  }

  // Шапка: номер после «Договору №» или одинокая ячейка вида «…-СМР»; дата «От dd mm yyyy»
  for (let i = 0; i < Math.min(g.length, 40); i++) {
    for (const c of g[i]!) {
      const t = txt(c);
      const n = /(?:договору\s*№\s*)?([0-9А-Яа-я][0-9А-Яа-я-]*-СМР)(?![0-9А-Яа-яЁё])/iu.exec(t);
      if (n && !m.number) m.number = n[1]!;
      const d = /^от\s*_*(\d{1,2})_*\s+_*(\d{1,2})_*\s+(\d{4})/i.exec(t);
      if (d && !m.date) m.date = `${d[3]}-${d[2]!.padStart(2, "0")}-${d[1]!.padStart(2, "0")}`;
    }
  }
  // Объект: строка над подписью «(наименование … объекта …)»
  for (let i = 1; i < Math.min(g.length, 60); i++) {
    if (!/^\(наименование[^)]*объекта/i.test(lbl[i]!)) continue;
    for (let j = i - 1; j >= 0; j--) {
      if (lbl[j]) {
        m.object = lbl[j]!;
        m.objectRow = j + 1;
        break;
      }
    }
    break;
  }
  if (m.object) {
    const h = /ул\.\s*[А-Яа-яЁё-]+,?\s*(?:д\.\s*)?(\d+(?:\s?[А-Я](?![А-Яа-я]))?)/u.exec(m.object);
    m.house = h ? h[1]!.replace(/\s+/g, " ") : null;
    const a = /кв\.\s*(\d+)/.exec(m.object);
    m.apartment = a ? a[1]! : null;
  }
  // Сметная стоимость шапки. ГРАНД: «Сметная стоимость | 123.45 | тыс.руб.». Ресурсная: подпись
  // на скрытом листе, на листе 14 граф первая строка «______ | ____12345,67 | руб.» до таблицы
  for (let i = 0; i < Math.min(g.length, 60); i++) {
    const row = g[i]!;
    const cells = row.map(txt);
    if (cells.some((c) => /^№\s*п/i.test(c))) break;
    if (/^сметная стоимость/i.test(lbl[i]!) && cells.some((c) => /тыс\.?\s*руб/i.test(c))) {
      const n = firstNumber(row);
      if (n) {
        m.headerCostKop = kop(n.value * 1000);
        m.headerCostTolerance = 1000; // тыс. руб. с двумя знаками: точность 10 ₽
      }
      break;
    }
    if (!cells.some((c) => /^руб\.?$/i.test(c))) continue;
    const amount = cells
      .map((c) => /^_+\s*(\d[\d\s]*(?:[.,]\d{1,2})?)$/.exec(c))
      .find((x) => x !== null);
    if (amount) {
      m.headerCostKop = kop(num(amount[1]!)!);
      break;
    }
  }
  return m;
}

/**
 * Строки испытаний в ресурсной смете: позиция с шифром испытаний или словом «испытание»
 * (не «Монтаж …»). Стоимость = прямые затраты позиции + (НР + СП раздела) × ФОТ позиции / ФОТ
 * раздела. Колонки ресурсной сметы: 8 — общая, 9 — Осн.З/п (с 1)
 */
function pressureLines(g: Cell[][], lbl: string[], from: number, to: number): number | null {
  let directPay = { amount: 0, pay: 0, found: false };
  let sectionPay: number | null = null;
  let overhead = 0;
  let profit = 0;
  for (let i = from; i < to; i++) {
    const row = g[i]!;
    const code = txt(row[1] ?? null);
    const name = txt(row[2] ?? null).toLowerCase();
    const isPos = /^'?\d+$/.test(txt(row[0] ?? null));
    if (
      isPos &&
      !name.startsWith("монтаж") &&
      (/(19-01-01[5-9]|24-02-12[02-4])/.test(code) || /испытани|опрессовк/.test(name))
    ) {
      directPay = {
        amount: directPay.amount + (num(row[7] ?? null) ?? 0),
        pay: directPay.pay + (num(row[8] ?? null) ?? 0),
        found: true,
      };
    }
    if (/^итого прямые затраты по разделу/i.test(lbl[i]!)) sectionPay = num(row[8] ?? null);
    if (/^накладные расходы$/i.test(lbl[i]!) && !overhead) overhead = num(row[7] ?? null) ?? 0;
    if (/^сметная прибыль$/i.test(lbl[i]!) && !profit) profit = num(row[7] ?? null) ?? 0;
  }
  if (!directPay.found || !sectionPay) return null;
  return kop(directPay.amount + ((overhead + profit) * directPay.pay) / sectionPay);
}

/* ------------------------------------------------------------------ сверка */

let failed = 0;
let fileNo = 0;
const money = (k: number | null) => (k === null ? "нет" : (k / 100).toFixed(2));
function check(what: string, service: unknown, manual: unknown, tolerance = 0): void {
  const ok =
    typeof service === "number" && typeof manual === "number"
      ? Math.abs(service - manual) <= tolerance
      : service === manual;
  if (!ok) failed++;
  const diff =
    typeof service === "number" && typeof manual === "number"
      ? ` (разница ${service - manual})`
      : "";
  const values = show ? `  сервис ${String(service)}, вручную ${String(manual)}` : "";
  console.log(`  ${ok ? "ок " : "НЕТ"} ${what}${ok ? "" : diff}${values}`);
}

const files = readdirSync(dir)
  .filter((f) => /\.xlsx?$/i.test(f))
  .sort();
for (const f of files) {
  fileNo++;
  const path = join(dir, f);
  const isXls = /\.xls$/i.test(f);
  const b = readFileSync(path);
  const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const serviceSheets = isXls ? await sheetsOfXls(buf) : await sheetsOfXlsx(buf);
  const parsed = parseEstimateWorkbook(serviceSheets);
  const manualSheets = isXls ? serviceSheets : await sheetsByExcelJs(path);
  console.log(
    `\nФайл ${fileNo} (.${isXls ? "xls" : "xlsx"}, листов ${serviceSheets.length}, ручной счёт ${isXls ? "SheetJS" : "exceljs"}), статус ${parsed.status}`,
  );
  const m = manualCount(manualSheets);
  if (!m) {
    check("лист со строкой «ВСЕГО по смете» найден", parsed.format !== null, false);
    continue;
  }
  check("выбран лист с итогами", parsed.sheet, m.sheet);
  check("ВСЕГО по смете", parsed.totals.total?.kopecks ?? null, m.total);
  check("строка ВСЕГО по смете", parsed.totals.total?.row ?? null, m.totalRow);
  check("итог без НДС", parsed.totals.withoutVat?.kopecks ?? null, m.withoutVat);
  check("НДС", parsed.totals.vat?.kopecks ?? null, m.vat);
  check("ставка НДС", parsed.vatRate, m.vatRate);
  if (m.withoutVat !== null && m.vat !== null && m.total !== null) {
    check("без НДС + НДС = ВСЕГО (вручную)", m.withoutVat + m.vat, m.total, 1);
    if (m.vatRate !== null)
      check(
        "НДС = ставка × без НДС (вручную)",
        m.vat,
        Math.round((m.withoutVat * m.vatRate) / 100),
        1,
      );
  }
  const sectionsSum = m.sections.reduce((a, s) => a + s.totalKop, 0);
  check("сумма разделов = без НДС (вручную, допуск 1 ₽)", sectionsSum, m.withoutVat, 100);
  check("трудозатраты сметы", parsed.laborHours?.value ?? null, m.laborHours);
  const sectionHours = m.sections.reduce((a, s) => a + (s.laborHours ?? 0), 0);
  if (m.laborHours !== null)
    check(
      "т/з разделов = т/з сметы (вручную, допуск 0,01 ч)",
      Math.round(sectionHours * 1e4),
      Math.round(m.laborHours * 1e4),
      110,
    );
  check("число разделов", parsed.sections.length, m.sections.length);
  m.sections.forEach((ms, i) => {
    const s = parsed.sections[i];
    if (!s) return;
    const v = sectionView(s);
    const n = `раздел ${ms.number ?? i + 1}`;
    check(`${n}: номер`, v.number, ms.number);
    check(`${n}: итог`, v.totalKopecks, ms.totalKop);
    check(`${n}: материалы`, v.materialsKopecks, ms.materialsKop);
    check(`${n}: работы = итог − материалы`, v.workKopecks, ms.totalKop - (ms.materialsKop ?? 0));
    check(`${n}: трудозатраты`, v.laborHours, ms.laborHours);
    if (ms.isPressure) {
      check(`${n}: опрессовка разделом целиком`, v.pressure?.kind ?? null, "section");
      check(`${n}: опрессовка = итог раздела`, v.pressure?.totalKopecks ?? null, ms.totalKop);
    } else {
      check(`${n}: опрессовка строками`, v.pressure?.totalKopecks ?? null, ms.pressureLinesKop, 1);
    }
    check(`${n}: перевозка`, v.transportKopecks, ms.transportKop);
  });
  check("шапка: номер КП", parsed.header?.number.value ?? null, m.number);
  check("шапка: дата", parsed.header?.date.value ?? null, m.date);
  const sp = (x: string | null | undefined) => (x ?? "").replace(/\s+/g, " ").trim() || null;
  check("шапка: строка объекта", parsed.header?.object.row ?? null, m.objectRow);
  check("шапка: текст объекта", sp(parsed.header?.object.value), sp(m.object));
  const addr = parsed.header?.address.value ?? null;
  check("шапка: дом", sp(addr?.house), sp(m.house));
  check("шапка: квартира", addr?.apartment ?? null, m.apartment);
  if (m.headerCostKop !== null && m.total !== null)
    check(
      "шапка: сметная стоимость = ВСЕГО (вручную)",
      m.headerCostKop,
      m.total,
      m.headerCostTolerance,
    );
  if (show) {
    console.log(
      `  итоги: без НДС ${money(m.withoutVat)}, НДС ${money(m.vat)}, всего ${money(m.total)}`,
    );
  }
}

console.log(
  failed === 0 ? `\nВсе проверки сошлись, файлов ${fileNo}.` : `\nРасхождений: ${failed}.`,
);
process.exit(failed === 0 ? 0 : 1);
