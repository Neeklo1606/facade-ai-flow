/**
 * Обезличенные копии смет заказчика для golden-тестов (ADR-077). Берёт файлы из
 * `.local/estimates` (вне git), пишет `tests/fixtures/estimates/`:
 * - адреса, населённые пункты, номера КП и договоров, фамилии заменены выдуманными;
 * - каждое число в файле умножено на один коэффициент и округлено до копеек: структура,
 *   строки и пропорции те же, настоящих сумм нет;
 * - листы называются нейтрально, формат файла (.xls или .xlsx) сохранён.
 * Запуск: `bun scripts/make-estimate-fixtures.ts`. Ожидания пишет тот же скрипт рядом с
 * файлом (`*.expected.json`), после него их проверяет человек.
 */
import * as XLSX from "xlsx";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sheetsOfXls, sheetsOfXlsx } from "@/adapters/gas-ops/estimate-file";
import { parseEstimateWorkbook } from "@/domain/gas-ops/estimate-parse";
import { sectionView } from "@/domain/gas-ops/estimate-intake";

const SRC = process.argv[2] ?? ".local/estimates";
const OUT = "tests/fixtures/estimates";
const K = 1.37;

/** Порядок файлов задаёт имя копии: настоящие имена с адресами в репозиторий не идут */
const NAMES = [
  "grand-a.xlsx",
  "resource-a.xls",
  "resource-b.xls",
  "resource-c.xls",
  "grand-b.xlsx",
];

const REPLACE: [RegExp, string][] = [
  [/Прытков/g, "Иванов"],
  [/П\.М\./g, "И.И."],
  [/Победы/g, "Садовая"],
  [/Курская/g, "Лесная"],
  [/Раздольная/g, "Полевая"],
  [/Вишнев(ая|ой)/g, "Ореховая"],
  [/Нещадимов(ский|ском)/g, "Примерн$1"],
  [/Погорелово/g, "Учебное"],
  [/Славянск(е|ого|ий)?/g, "Тестовск$1"],
  [/Краснодарск(ого|ий) кра(я|й)/g, "Условн$1 кра$2"],
  [/Д-\d+-\d{4}(-К)?-\d{2}-СМР/g, "Д-900-2026-26-СМР"],
  [/\d+-ТП-\d{4}-\d{2}-СМР/g, "900-ТП-2026-26-СМР"],
  [/\d+-д-ТУ-\d{2}-СМР/g, "90-д-ТУ-26-СМР"],
  [/\d{3,6}-[А-ЯЁA-Z]-\d{2}-СМР/g, "900001-Т-26-СМР"],
];

const scale = (v: number) => Math.round(v * K * 100) / 100;

function numeric(s: string): number | null {
  const t = s.replace(/[\s\u00a0]/g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

function text(s: string): string {
  let out = s;
  for (const [re, to] of REPLACE) out = out.replace(re, to);
  // Суммы в шапке КП записаны строкой с подчёркиваниями: «_____12345,67»
  out = out.replace(/(_{3,})(\d+(?:[.,]\d+)?)$/, (_m, line: string, n: string) => {
    const v = scale(Number(n.replace(",", ".")));
    return `${line}${String(v).replace(".", ",")}`;
  });
  return out;
}

mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC)
  .filter((f) => /\.xlsx?$/i.test(f))
  .sort();
files.forEach(async (f, i) => {
  const name = NAMES[i] ?? `estimate-${i}.xlsx`;
  const wb = XLSX.read(readFileSync(join(SRC, f)), { type: "buffer" });
  const out = XLSX.utils.book_new();
  wb.SheetNames.forEach((sheetName, n) => {
    const ws = wb.Sheets[sheetName]!;
    for (const addr of Object.keys(ws)) {
      if (addr.startsWith("!")) continue;
      const cell = ws[addr] as XLSX.CellObject;
      if (cell.t === "n" && typeof cell.v === "number") {
        cell.v = scale(cell.v);
        delete cell.w;
        delete cell.f;
      } else if (cell.t === "s" && typeof cell.v === "string") {
        const num = numeric(cell.v);
        cell.v =
          num !== null && /[.,]/.test(cell.v) ? String(scale(num)).replace(".", ",") : text(cell.v);
        delete cell.w;
        delete cell.h;
        delete cell.r;
      }
    }
    const neutral = /12 граф/.test(sheetName)
      ? "Ресурсная смета 12 граф"
      : /14 граф/.test(sheetName)
        ? "Ресурсная смета 14 граф"
        : `Смета ${n + 1}`;
    XLSX.utils.book_append_sheet(out, ws, neutral);
  });
  const xls = /\.xls$/.test(name);
  const bytes = XLSX.write(out, { type: "buffer", bookType: xls ? "biff8" : "xlsx" }) as Buffer;
  writeFileSync(join(OUT, name), bytes);
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const parsed = parseEstimateWorkbook(xls ? await sheetsOfXls(buf) : await sheetsOfXlsx(buf));
  const h = parsed.header!;
  const expected = {
    status: parsed.status,
    sheet: parsed.sheet,
    format: parsed.format,
    totals: Object.fromEntries(Object.entries(parsed.totals).map(([k, v]) => [k, v!.kopecks])),
    header: {
      object: h.object.value,
      number: h.number.value,
      date: h.date.value,
      address: h.address.value,
      rows: { object: h.object.row, number: h.number.row },
    },
    sections: parsed.sections.map((s) => {
      const v = sectionView(s);
      return {
        number: v.number,
        total: v.totalKopecks,
        materials: v.materialsKopecks,
        work: v.workKopecks,
        laborHours: v.laborHours,
        pressure: v.pressure
          ? { kind: v.pressure.kind, work: v.pressure.workKopecks, rows: v.pressure.rows }
          : null,
      };
    }),
  };
  writeFileSync(
    join(OUT, name.replace(/\.xlsx?$/, ".expected.json")),
    `${JSON.stringify(expected, null, 2)}\n`,
  );
  console.log(name, parsed.status, parsed.sections.length);
});
