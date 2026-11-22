/**
 * Сверка Excel недели, который строит сервис, с контрольным файлом заказчика (П7 плана
 * критического тестирования). Сервис собирает файл тем же кодом, что и кнопка «Excel»
 * (`buildCustomerWorkbook`), из записей утверждённого отчёта; файл читается обратно exceljs и
 * сравнивается ячейка в ячейку с «ФАКТИЧЕСКИЙ ОТЧЁТ» по номеру строки исходного файла:
 * группы, бригады, сотрудники, рамки смен, адресные строки и «Итого». Сумма, часы и доходность
 * за каждый день и за неделю.
 *
 * Допуски: сумма до рубля точно; часы адресной строки 0,005 ч (в файле два знака); часы
 * агрегатов 0,1 ч (в файле сумма уже округлённых часов дней, ADR-043); доходность точно, а
 * отличия на полрубля называются отдельно (вопрос 7 владельцу).
 *
 * Контрольный файл лежит вне git (`.local/`). Вывод без подписей строк и без сумм: номер
 * строки, вид строки, показатель и разница. `--show` печатает значения (только свой терминал).
 *
 * Запуск: `bun scripts/check-week-vs-fact.ts [путь-к-xlsx] [--show]`. Код выхода 1 —
 * расхождение сверх допуска.
 */
import ExcelJS from "exceljs";
import { existsSync } from "node:fs";
import { buildCustomerWorkbook } from "@/adapters/gas-ops/xlsx";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { analyticRows, customerFormatRows, type ReportRow } from "@/domain/gas-ops/report";

const args = process.argv.slice(2);
const show = args.includes("--show");
const source =
  args.find((a) => !a.startsWith("--")) ?? ".local/ФАКТИЧЕСКИЙ ОТЧЕТ 28.09-03.10.26г..xlsx";
if (!existsSync(source)) {
  console.log("Контрольного файла нет: положите «ФАКТИЧЕСКИЙ ОТЧЁТ» в .local/.");
  process.exit(0);
}

const DAY_COLS = [5, 8, 11, 14, 17, 20];
const TOTAL_COL = 23;

type Triple = { amount: number | null; hours: number | null; revenue: number | null };
type Values = { days: Triple[]; total: Triple; frames: string[] };

function valueOf(v: ExcelJS.CellValue): number | string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result?: unknown }).result;
    return typeof r === "number" || typeof r === "string" ? r : null;
  }
  if (typeof v === "object" && "richText" in v)
    return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
  return null;
}
const numOf = (v: ExcelJS.CellValue): number | null => {
  const x = valueOf(v);
  return typeof x === "number" ? x : null;
};

function rowValues(ws: ExcelJS.Worksheet, row: number): Values {
  const r = ws.getRow(row);
  const triple = (col: number): Triple => ({
    amount: numOf(r.getCell(col).value),
    hours: numOf(r.getCell(col + 1).value),
    revenue: numOf(r.getCell(col + 2).value),
  });
  return {
    days: DAY_COLS.map(triple),
    total: triple(TOTAL_COL),
    frames: DAY_COLS.map((c) => String(valueOf(r.getCell(c).value) ?? "").trim()),
  };
}

/* ------------------------------------------------------- файл заказчика */

const factWb = new ExcelJS.Workbook();
await factWb.xlsx.readFile(source);
const fact = factWb.worksheets[0]!;

/* ------------------------------------------------- файл сервиса (кнопка Excel) */

const seed = buildSeed();
const base = {
  groups: seed.groups,
  brigades: seed.brigades,
  employees: seed.employees,
  objects: seed.objects,
  days: seed.week.days,
  mode: "confirmed" as const,
};

async function serviceSheet(entries: typeof seed.entries) {
  const rows = customerFormatRows({ ...base, entries, frames: seed.frames });
  const bytes = await buildCustomerWorkbook({
    rows,
    analytic: analyticRows({ ...base, entries }),
    days: seed.week.days,
    week: { from: seed.week.from, to: seed.week.to },
    mode: "confirmed",
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return { rows, ws: wb.getWorksheet("Отчёт")! };
}

/**
 * Строки исходного файла для строки отчёта сервиса; пусто — у строки нет пары в файле. Адрес
 * в файле заказчика иногда повторяется строкой на каждый день, у сервиса это одна строка
 * адреса с днями: тогда сверяется сумма тех строк файла
 */
function factRowsOf(row: ReportRow): number[] {
  if (row.kind === "address") {
    const excelRows = new Set(
      seed.entries
        .filter((e) => row.entryIds.includes(e.id))
        .map((e) => e.excelRow)
        .filter((r): r is number => typeof r === "number"),
    );
    return [...excelRows].sort((a, b) => a - b);
  }
  const one = factRowOf(row);
  return one === null ? [] : [one];
}

function factRowOf(row: ReportRow): number | null {
  const id = row.id;
  if (row.kind === "group") return seed.groups.find((g) => `g-${g.id}` === id)?.excelRow ?? null;
  if (row.kind === "brigade")
    return seed.brigades.find((b) => `b-${b.id}` === id)?.excelRow ?? null;
  if (row.kind === "employee")
    return seed.employees.find((e) => `e-${e.id}` === id)?.excelRow ?? null;
  if (row.kind === "frame") {
    // Рамка смены в файле стоит строкой сразу под сотрудником
    const emp = seed.employees.find((e) => `f-${e.id}` === id);
    return emp?.excelRow ? emp.excelRow + 1 : null;
  }
  if (row.kind === "total") return totalRow();
  return null;
}

function sumValues(list: Values[]): Values {
  const add = (a: number | null, b: number | null) =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  const sumTriple = (ts: Triple[]): Triple => {
    const amount = ts.reduce<number | null>((a, t) => add(a, t.amount), null);
    const hours = ts.reduce<number | null>((a, t) => add(a, t.hours), null);
    // Доходность суммы: как у сервиса, сумма на часы; одна строка — как в файле
    const revenue =
      ts.filter((t) => t.amount !== null || t.hours !== null).length === 1
        ? (ts.find((t) => t.amount !== null || t.hours !== null)!.revenue ?? null)
        : amount !== null && hours
          ? Math.round(amount / hours)
          : null;
    return { amount, hours, revenue };
  };
  return {
    days: DAY_COLS.map((_, d) => sumTriple(list.map((v) => v.days[d]!))),
    total: sumTriple(list.map((v) => v.total)),
    frames: list[0]?.frames ?? [],
  };
}

function totalRow(): number {
  for (let r = fact.rowCount; r > 0; r--) {
    if (/^итого/i.test(String(valueOf(fact.getRow(r).getCell(1).value) ?? "").trim())) return r;
  }
  return -1;
}

/** Сумма строк групп файла (уровень 0, кроме «Итого»): с ней сверяется «Итого» сервиса */
function groupsSum(): Values {
  const rows = seed.groups.map((g) => g.excelRow).filter((r): r is number => typeof r === "number");
  return sumValues(rows.map((r) => rowValues(fact, r)));
}

let failures = 0;
const notes: string[] = [];
const halfRuble: string[] = [];

function compareTriple(where: string, kind: string, f: Triple, s: Triple): void {
  const aggregate = kind !== "address";
  const amountOk = (f.amount ?? 0) === (s.amount ?? 0);
  const hoursDiff = Math.abs((f.hours ?? 0) - (s.hours ?? 0));
  const hoursOk = hoursDiff <= (aggregate ? 0.1 : 0.005);
  const revDiff = Math.abs((f.revenue ?? 0) - (s.revenue ?? 0));
  const val = (t: Triple) => (show ? ` [${t.amount} / ${t.hours} / ${t.revenue}]` : "");
  if (!amountOk) {
    failures++;
    notes.push(
      `${where} ${kind}: сумма расходится на ${(s.amount ?? 0) - (f.amount ?? 0)} ₽${val(f)}${val(s)}`,
    );
  }
  if (!hoursOk) {
    failures++;
    notes.push(`${where} ${kind}: часы расходятся на ${hoursDiff.toFixed(3)} ч${val(f)}${val(s)}`);
  }
  // Доходность агрегата в файле считается от округлённых часов: сверяется только адресная
  if (!aggregate && revDiff > 0) {
    if (revDiff <= 1)
      halfRuble.push(`${where}: доходность ${f.revenue} в файле, ${s.revenue} в сервисе`);
    else {
      failures++;
      notes.push(`${where} ${kind}: доходность расходится на ${revDiff}`);
    }
  }
}

async function run(title: string, entries: typeof seed.entries): Promise<void> {
  console.log(`\n## ${title}`);
  failures = 0;
  notes.length = 0;
  halfRuble.length = 0;
  const { rows, ws } = await serviceSheet(entries);
  const used = new Set<number>();
  let compared = 0;
  let unmapped = 0;
  let merged = 0;
  let demoRows = 0;
  rows.forEach((row, i) => {
    const sheetRow = i + 3; // шапка занимает две строки
    const frs = factRowsOf(row);
    if (frs.length === 0) {
      if (row.kind !== "frame") unmapped++;
      return;
    }
    for (const r of frs) used.add(r);
    // Полный набор: строки с демо-записями сверяются отдельной проверкой ниже
    if (row.entryIds.some((id) => demoIds.has(id))) {
      demoRows++;
      return;
    }
    const fr = frs[0]!;
    const f = row.kind === "total" ? groupsSum() : sumValues(frs.map((r) => rowValues(fact, r)));
    if (frs.length > 1) merged++;
    const s = rowValues(ws, sheetRow);
    compared++;
    if (row.kind === "frame") {
      f.frames.forEach((ft, d) => {
        const st = s.frames[d] ?? "";
        if (ft.replace(/\s/g, "") !== st.replace(/\s/g, "")) {
          failures++;
          notes.push(`строка ${fr} рамка, день ${d + 1}: в файле «${ft}», в сервисе «${st}»`);
        }
      });
      return;
    }
    f.days.forEach((ft, d) =>
      compareTriple(`строка ${fr}, день ${d + 1}`, row.kind, ft, s.days[d]!),
    );
    compareTriple(`строка ${fr}, неделя`, row.kind, f.total, s.total);
  });
  // Строки файла с цифрами, которых в выгрузке сервиса нет
  const orphan: number[] = [];
  for (let r = 3; r <= fact.rowCount; r++) {
    if (used.has(r)) continue;
    const v = rowValues(fact, r);
    if ([...v.days, v.total].some((t) => t.amount !== null || t.hours !== null)) orphan.push(r);
  }
  console.log(
    `строк сервиса ${rows.length}, сверено с файлом ${compared}, без пары в файле ${unmapped}, адресов из нескольких строк файла ${merged}, строк с демо-записями ${demoRows}`,
  );
  const fileTotal = rowValues(fact, totalRow()).total;
  const groups = groupsSum().total;
  const gap = (fileTotal.amount ?? 0) - (groups.amount ?? 0);
  console.log(
    `«Итого» файла ${gap === 0 ? "равно сумме строк групп" : "больше суммы строк групп файла"}${show ? ` на ${gap} ₽` : ""} (вопрос 8 владельцу: групп 2 и 4 в файле нет; сервис итог не подгоняет)`,
  );
  console.log(
    `строки файла с цифрами без пары в выгрузке: ${orphan.length ? orphan.join(", ") : "нет"}`,
  );
  for (const n of notes.slice(0, 60)) console.log(`  НЕТ ${n}`);
  if (notes.length > 60) console.log(`  … ещё ${notes.length - 60}`);
  if (halfRuble.length)
    console.log(`  доходность на полрубля (округление, вопрос 7): ${halfRuble.length}`);
  console.log(failures === 0 ? "  всё сошлось" : `  расхождений: ${failures}`);
  total += failures;
}

let total = 0;
const factEntries = seed.entries.filter((e) => e.source === "fact-report");
let demoIds = new Set<string>();
await run("Только записи из фактического отчёта", factEntries);

/*
 * Полный набор, как его выгружает кнопка «Excel» в демо: к записям отчёта добавлены
 * демо-сценарии. Строки только из записей отчёта обязаны совпасть с файлом, а «Итого»
 * сервиса вырасти ровно на сумму утверждённых демо-записей: больше ничего не подмешано.
 */
demoIds = new Set(seed.entries.filter((e) => e.source !== "fact-report").map((e) => e.id));
await run("Все записи утверждённого отчёта (с демо-сценариями)", seed.entries);
{
  const totalOf = async (entries: typeof seed.entries) => {
    const { rows } = await serviceSheet(entries);
    return rows.find((r) => r.kind === "total")!.total;
  };
  const full = await totalOf(seed.entries);
  const only = await totalOf(factEntries);
  const demo = seed.entries.filter((e) => e.source !== "fact-report" && e.status === "confirmed");
  const demoAmount = demo.reduce((a, e) => a + (e.amountRub ?? 0), 0);
  const demoMinutes = demo.reduce((a, e) => a + e.minutes, 0);
  const ok =
    (full.amountRub ?? 0) - (only.amountRub ?? 0) === demoAmount &&
    (full.minutes ?? 0) - (only.minutes ?? 0) === demoMinutes;
  if (!ok) total++;
  console.log(
    `  ${ok ? "ок " : "НЕТ"} «Итого» с демо больше «Итого» отчёта ровно на утверждённые демо-записи (${demo.length})`,
  );
}
process.exit(total === 0 ? 0 : 1);
