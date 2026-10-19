/**
 * Читает фактический недельный отчёт заказчика (газовое направление) и пишет
 * анонимизированный JSON для прототипа: `src/data/mock/fact-report.anonymized.json`.
 *
 * Запуск: `bun run scripts/parse-fact-report.ts [путь-к-xlsx]`
 * По умолчанию берётся `docs/source/fact-report.xlsx` — он в .gitignore, потому что
 * содержит реальные ФИО и адреса. В git попадает только результат анонимизации.
 *
 * Что здесь важно знать про исходный файл:
 *
 * 1. Иерархия задана уровнями группировки строк (outline level), а не отступами.
 *    Уровень не равен смыслу строки: в группе «3. ДОПОЛНИТЕЛЬНЫЕ БРИГАДЫ» адреса
 *    стоят на уровне 2, а в группе «1. СТАЛЬНЫЕ» — на уровне 3. Поэтому тип строки
 *    определяется по месту в дереве (есть ли дочерние) и по виду подписи, а не по уровню.
 * 2. Строка рамки смены («8.20-16.40») стоит на том же уровне, что и сотрудник,
 *    и по правилам outline забирает его дочерние строки себе. Она возвращается
 *    предыдущей подписанной строке как `frames`.
 * 3. Формул в файле нет, только значения. Правила расчёта восстановлены по значениям
 *    и проверены в `tests/domain/gas-ops-*.test.ts`.
 */
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SOURCE = process.argv[2] ?? "docs/source/fact-report.xlsx";
/** Полный набор с деревом строк исходного файла: им пользуются скрипты сверки и тесты */
const OUT = "src/data/mock/fact-report.anonymized.json";
/**
 * Набор для вкладки: то же самое без дерева строк. Дерево нужно только сверке с файлом,
 * а в клиентский набор оно добавляло четверть веса — отчёт всё равно собирается из записей.
 */
const OUT_CLIENT = "src/data/mock/fact-report.lite.json";

/** Первый столбец каждого дня; в следующих двух — часы и доходность */
const DAY_COLS = [5, 8, 11, 14, 17, 20];
/** Колонка «Итого» (тоже три показателя) */
const TOTAL_COL = 23;
const FIRST_DATA_ROW = 3;

const INTERVAL = /^\d{1,2}[.:]\d{2}\s*-\s*\d{1,2}[.:]\d{2}$/;
const FIO = /^(?:\d+(?:\.\d+)*\.\s*)?[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+$/;
const SETTLEMENT = /^(г\.|ст\.|х\.|п\.|с\.|СТ)\s*[^,]*/;
/**
 * Маркер улицы. Нужен, потому что запятая после населённого пункта стоит не всегда:
 * «г. Славянск н/К ул. Дзержинского, 367» — без него настоящая улица уедет
 * в название населённого пункта и останется в выгрузке.
 */
const STREET_MARK = /\s(?:ул\.|пер\.|пр\.|пр-т|пл\.|проезд|б-р|мкр|тер\.|ш\.)\s*/;
const CODE = /^(\d+(?:\.\d+)*)\.\s*/;
/**
 * Похоже на фамилию. Границу слова писать нельзя: `\b` в JavaScript считает кириллицу
 * не-словом, поэтому `/ин\b/.test("Вырвин 1 бригада")` даёт false и фамилия уходит
 * в выгрузку как есть. Проверено скриптом, поэтому здесь явный просмотр вперёд.
 */
const SURNAME = /[А-ЯЁ][а-яё]+(?:ов|ев|ёв|ин|ын|ко|ук|юк|ян|ий|ый|ец|ук)(?=[\s,.]|$)/;

type Kind = "group" | "brigade" | "employee" | "crew" | "address";

interface DayValue {
  /** Индекс дня недели в `days` */
  day: number;
  amount: number | null;
  hours: number | null;
  revenue: number | null;
}

interface Node {
  row: number;
  level: number;
  label: string;
  kind: Kind;
  values: DayValue[];
  total: DayValue;
  /** Рамка смены по дням: «8.20-16.40» */
  frames: Record<number, string>;
  /** Текст «36 час 50 мин» из колонки «Итого» строки рамки */
  framesTotal: string | null;
  children: Node[];
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SOURCE);
const sheet = wb.worksheets[0];
if (!sheet) throw new Error(`В файле ${SOURCE} нет листов`);
const ws = sheet;

function raw(row: number, col: number): unknown {
  return ws.getRow(row).getCell(col).value;
}

function text(row: number, col: number): string {
  const v = raw(row, col);
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o["richText"]))
      return (o["richText"] as { text: string }[]).map((t) => t.text).join("");
    if (typeof o["text"] === "string") return o["text"];
    if ("result" in o) return String(o["result"] ?? "");
    return "";
  }
  return String(v).trim();
}

function num(row: number, col: number): number | null {
  const v = raw(row, col);
  return typeof v === "number" ? v : null;
}

function dayValues(row: number): DayValue[] {
  return DAY_COLS.map((col, day) => ({
    day,
    amount: num(row, col),
    hours: num(row, col + 1),
    revenue: num(row, col + 2),
  }));
}

function totalValue(row: number): DayValue {
  return {
    day: -1,
    amount: num(row, TOTAL_COL),
    hours: num(row, TOTAL_COL + 1),
    revenue: num(row, TOTAL_COL + 2),
  };
}

function isIntervalRow(row: number): boolean {
  if (text(row, 1) !== "") return false;
  return DAY_COLS.some((col) => INTERVAL.test(text(row, col)));
}

// --- дни недели из строки 1 --------------------------------------------------

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value ?? "").trim());
  if (!m) throw new Error(`Не разобрана дата дня: ${String(value)}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const days = DAY_COLS.map((col) => isoDate(raw(1, col)));

// --- дерево по outline level -------------------------------------------------

const lastRow = (() => {
  for (let r = ws.rowCount; r >= FIRST_DATA_ROW; r--) {
    if (text(r, 1) === "Итого") return r - 1;
  }
  return ws.rowCount;
})();
const totalRow = lastRow + 1;

const roots: Node[] = [];
const stack: Node[] = [];
/** Последняя подписанная строка каждого уровня: ей возвращаются дети строки рамки */
const lastLabeled = new Map<number, Node>();

for (let r = FIRST_DATA_ROW; r <= lastRow; r++) {
  const level = ws.getRow(r).outlineLevel ?? 0;
  const label = text(r, 1);

  if (isIntervalRow(r)) {
    const owner = lastLabeled.get(level);
    if (!owner) throw new Error(`Строка рамки ${r} без владельца`);
    for (const [day, col] of DAY_COLS.entries()) {
      const frame = text(r, col!);
      if (INTERVAL.test(frame)) owner.frames[day] = frame;
    }
    owner.framesTotal = text(r, TOTAL_COL) || null;
    // дочерние строки продолжают принадлежать владельцу рамки
    while (stack.length > level) stack.pop();
    stack.push(owner);
    continue;
  }
  if (label === "") continue;

  const node: Node = {
    row: r,
    level,
    label,
    kind: "address",
    values: dayValues(r),
    total: totalValue(r),
    frames: {},
    framesTotal: null,
    children: [],
  };

  while (stack.length > level) stack.pop();
  const parent = stack[stack.length - 1];
  if (parent && parent !== node) parent.children.push(node);
  else roots.push(node);
  stack[level] = node;
  stack.length = level + 1;
  lastLabeled.set(level, node);
}

// --- типы строк --------------------------------------------------------------

function classify(node: Node, depth: number): void {
  if (node.children.length === 0) node.kind = "address";
  else if (depth === 0) node.kind = "group";
  // Уровень 1 — всегда бригада, даже если подписана ФИО: в группе «3. ДОПОЛНИТЕЛЬНЫЕ
  // БРИГАДЫ» бригада из одного человека подписана его ФИО с кодом («3.10. …»).
  else if (depth === 1) node.kind = "brigade";
  else node.kind = FIO.test(node.label) ? "employee" : "crew";
  for (const child of node.children) classify(child, depth + 1);
}
for (const root of roots) classify(root, 0);

// --- анонимизация ------------------------------------------------------------

const realNames = new Set<string>();
const realStreets = new Set<string>();

/** «Бригада 7» → 7; «3.10. Липка …» → «3.10» */
function codeOf(label: string): string | null {
  const byCode = CODE.exec(label);
  if (byCode?.[1]) return byCode[1];
  const byNumber = /^Бригада\s+(\d+)/.exec(label);
  return byNumber?.[1] ?? null;
}

const brigadeNumber = new Map<Node, string>();

function anonBrigade(node: Node, index: number, groupCode: string | null): string {
  const code = codeOf(node.label) ?? (groupCode ? `${groupCode}.${index + 1}` : null);
  const key = code ?? String(index + 1);
  brigadeNumber.set(node, key);
  if (/^Бригада\s+\d+$/.test(node.label)) return node.label; // уже безлично
  if (FIO.test(node.label)) {
    realNames.add(node.label.replace(CODE, "").trim());
    return `Бригада ${key}`;
  }
  // «3.1. СЭГ» — обезличенное название направления, остаётся как есть
  if (!SURNAME.test(node.label)) return node.label;
  realNames.add(node.label);
  return `Бригада ${key}`;
}

function anonEmployee(label: string, brigadeKey: string, index: number): string {
  realNames.add(label.replace(CODE, "").trim());
  return index === 0 ? `Бригадир ${brigadeKey}` : `Сотрудник ${brigadeKey}.${index + 1}`;
}

function anonCrew(label: string, brigadeKey: string): string {
  if (SURNAME.test(label)) realNames.add(label);
  return `Состав бригады ${brigadeKey}`;
}

const addressIndex = new Map<string, number>();

interface AnonAddress {
  /** Анонимная подпись строки: населённый пункт, демо-улица, вид работ */
  label: string;
  settlement: string | null;
  workType: string | null;
  /** Номер демо-адреса: стабилен между запусками, пока файл не менялся */
  demoNumber: number;
}

function anonAddress(label: string): AnonAddress {
  const seen = addressIndex.get(label);
  const demoNumber = seen ?? addressIndex.size + 1;
  if (seen === undefined) addressIndex.set(label, demoNumber);

  const dash = label.search(/\s[-–]\s|\s[-–]$/);
  // Фамилию в скобках («с. Ачуево (Должиков)») убираем до разбора: иначе она уедет
  // в населённый пункт, где регулярка адреса её не заметит.
  const inBrackets = label.match(/\(([^)]*)\)/g) ?? [];
  for (const chunk of inBrackets) if (SURNAME.test(chunk)) realNames.add(chunk.slice(1, -1));
  const head = (dash === -1 ? label : label.slice(0, dash)).replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const tail =
    dash === -1
      ? ""
      : label
          .slice(dash)
          .replace(/^\s*[-–]\s*/, "")
          .trim();

  const settlementMatch = SETTLEMENT.exec(head);
  let settlement: string | null = null;
  let street = head;
  if (settlementMatch) {
    const whole = settlementMatch[0];
    const cut = whole.search(STREET_MARK);
    settlement = (cut === -1 ? whole : whole.slice(0, cut)).trim().replace(/[.,]$/, "");
    street = head.slice(settlement.length).replace(/^[\s,]+/, "");
  }
  if (street) realStreets.add(street);

  // вид работ: после тире, иначе по ключевым словам в самой подписи
  let workType: string | null =
    tail
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/[.\s]+$/, "")
      .trim() || null;
  if (!workType) {
    if (/КНС/i.test(label)) workType = "КНС";
    else if (/ввод/i.test(label)) workType = "ввод";
  }
  if (workType) workType = workType.replace(/\s{2,}/g, " ");

  const head2 = settlement ? `${settlement}, ул. Демо, ${demoNumber}` : `ул. Демо, ${demoNumber}`;
  const text = workType ? `${head2} - ${workType}` : head2;
  return { label: text, settlement, workType, demoNumber };
}

// --- сборка анонимизированного дерева и плоских записей ----------------------

interface OutNode {
  id: string;
  kind: Kind;
  label: string;
  excelRow: number;
  level: number;
  settlement?: string | null;
  workType?: string | null;
  values: DayValue[];
  total: DayValue;
  frames?: Record<number, string>;
  framesTotal?: string | null;
  children: OutNode[];
}

interface OutEntry {
  id: string;
  day: string;
  dayIndex: number;
  groupId: string;
  brigadeId: string;
  /** Сотрудник или состав бригады; у групп без этого уровня — null */
  employeeId: string | null;
  objectId: string;
  amount: number | null;
  hours: number | null;
  minutes: number | null;
  /** Доходность часа из файла — для сверки с расчётом */
  revenueInFile: number | null;
  excelRow: number;
  source: "fact-report";
}

const objects = new Map<
  string,
  {
    id: string;
    label: string;
    settlement: string | null;
    workType: string | null;
    demoNumber: number;
  }
>();
const entries: OutEntry[] = [];
const employees: {
  id: string;
  brigadeId: string;
  name: string;
  isLead: boolean;
  excelRow: number;
}[] = [];
const brigades: { id: string; groupId: string; name: string; code: string; excelRow: number }[] =
  [];
const groups: { id: string; name: string; code: string | null; excelRow: number }[] = [];

function objectIdOf(a: AnonAddress): string {
  const id = `obj-${a.demoNumber}`;
  if (!objects.has(id))
    objects.set(id, {
      id,
      label: a.label,
      settlement: a.settlement,
      workType: a.workType,
      demoNumber: a.demoNumber,
    });
  return id;
}

function pushEntries(
  node: Node,
  ids: { groupId: string; brigadeId: string; employeeId: string | null },
  objectId: string,
): void {
  for (const v of node.values) {
    if (v.amount === null && v.hours === null) continue;
    entries.push({
      id: `fr-${node.row}-${v.day}`,
      day: days[v.day]!,
      dayIndex: v.day,
      groupId: ids.groupId,
      brigadeId: ids.brigadeId,
      employeeId: ids.employeeId,
      objectId,
      amount: v.amount,
      hours: v.hours,
      minutes: v.hours === null ? null : Math.round(v.hours * 60),
      revenueInFile: v.revenue,
      excelRow: node.row,
      source: "fact-report",
    });
  }
}

function walk(
  node: Node,
  depth: number,
  ctx: { groupId: string; brigadeId: string; brigadeKey: string; employeeId: string | null },
  employeeSeq: { n: number },
): OutNode {
  let label = node.label;
  const next = { ...ctx };

  if (node.kind === "group") {
    const code = codeOf(node.label);
    const id = `grp-${code ?? groups.length + 1}`;
    next.groupId = id;
    groups.push({ id, name: node.label, code, excelRow: node.row });
  } else if (node.kind === "brigade") {
    const wasFio = FIO.test(node.label);
    const groupCode = groups.find((g) => g.id === next.groupId)?.code ?? null;
    label = anonBrigade(node, brigades.filter((b) => b.groupId === next.groupId).length, groupCode);
    const key = brigadeNumber.get(node) ?? String(brigades.length + 1);
    const id = `brg-${key}`;
    next.brigadeId = id;
    next.brigadeKey = key;
    brigades.push({ id, groupId: next.groupId, name: label, code: key, excelRow: node.row });
    // Бригада из одного человека подписана его ФИО: сотрудник в файле отдельной строкой
    // не стоит, но в прототипе он нужен — иначе у записи нет исполнителя.
    if (wasFio) {
      const empId = `emp-${key}-1`;
      next.employeeId = empId;
      employees.push({
        id: empId,
        brigadeId: id,
        name: `Бригадир ${key}`,
        isLead: true,
        excelRow: node.row,
      });
    }
  } else if (node.kind === "employee") {
    const index = employeeSeq.n++;
    label = anonEmployee(node.label, ctx.brigadeKey, index);
    const id = `emp-${ctx.brigadeKey}-${index + 1}`;
    next.employeeId = id;
    employees.push({
      id,
      brigadeId: ctx.brigadeId,
      name: label,
      isLead: index === 0,
      excelRow: node.row,
    });
  } else if (node.kind === "crew") {
    label = anonCrew(node.label, ctx.brigadeKey);
    const id = `crew-${ctx.brigadeKey}`;
    next.employeeId = id;
    employees.push({ id, brigadeId: ctx.brigadeId, name: label, isLead: true, excelRow: node.row });
  }

  const out: OutNode = {
    id: `row-${node.row}`,
    kind: node.kind,
    label,
    excelRow: node.row,
    level: depth,
    values: node.values,
    total: node.total,
    children: [],
  };
  if (Object.keys(node.frames).length > 0) {
    out.frames = node.frames;
    out.framesTotal = node.framesTotal;
  }

  if (node.kind === "address") {
    const anon = anonAddress(node.label);
    out.label = anon.label;
    out.settlement = anon.settlement;
    out.workType = anon.workType;
    const objectId = objectIdOf(anon);
    pushEntries(
      node,
      { groupId: ctx.groupId, brigadeId: ctx.brigadeId, employeeId: ctx.employeeId },
      objectId,
    );
    return out;
  }

  // нумерация сотрудников своя внутри каждой бригады
  const seq = node.kind === "brigade" ? { n: 0 } : employeeSeq;
  out.children = node.children.map((child) => walk(child, depth + 1, next, seq));
  return out;
}

const tree = roots.map((root) =>
  walk(
    root,
    0,
    {
      groupId: "grp-?",
      brigadeId: "brg-?",
      brigadeKey: "?",
      employeeId: null,
    },
    { n: 0 },
  ),
);

const grandTotal = {
  label: text(totalRow, 1),
  excelRow: totalRow,
  values: dayValues(totalRow),
  total: totalValue(totalRow),
};

// --- защита от утечки персональных данных -----------------------------------

const payload = {
  meta: {
    source: "fact-report" as const,
    sheet: ws.name,
    rows: ws.rowCount,
    columns: ws.columnCount,
    week: { from: days[0], to: days[days.length - 1] },
    days,
    generatedBy: "scripts/parse-fact-report.ts",
    note:
      "Анонимизировано: ФИО заменены на роли, улица и дом — на «ул. Демо, N». " +
      "Населённый пункт, вид работ, суммы, часы и интервалы перенесены как есть.",
  },
  groups,
  brigades,
  employees,
  objects: [...objects.values()],
  entries,
  tree,
  grandTotal,
};

const json = JSON.stringify(payload, null, 2);
const leaked: string[] = [];

/**
 * Форма анонимной подписи объекта. Проверка структурная, а не по словарю фамилий:
 * всё, что не укладывается в «населённый пункт, ул. Демо, N - вид работ», считается утечкой.
 */
const SAFE_LABEL = /^(?:(?:г\.|ст\.|х\.|п\.|с\.|СТ)\s[^,]+,\s)?ул\. Демо, \d+(?: - .+)?$/;
for (const object of objects.values()) {
  const settlementPart = object.label.split(", ул. Демо")[0] ?? "";
  if (!SAFE_LABEL.test(object.label) || STREET_MARK.test(settlementPart)) {
    leaked.push(object.label);
  }
}
for (const name of realNames) {
  for (const part of name.split(/\s+/)) {
    if (part.length > 4 && json.includes(part)) leaked.push(part);
  }
}
for (const street of realStreets) {
  const head = street.replace(/^(ул|пер|ст|пр|пл)\.?\s*/i, "").split(/[,\s]/)[0] ?? "";
  if (head.length > 4 && json.includes(head)) leaked.push(head);
}
if (leaked.length > 0) {
  console.error("Персональные данные остались в выгрузке:", [...new Set(leaked)].join(", "));
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${json}\n`);

// Рамки смен вынимаются здесь: вкладке они нужны готовым списком, дерево ей ни к чему
interface FrameRow {
  brigadeId: string;
  employeeId: string | null;
  day: string;
  frame: string;
  excelRow: number;
}
const frameRows: FrameRow[] = [];
const collectFrames = (node: OutNode, brigadeId: string | null, employeeId: string | null) => {
  const brigade =
    node.kind === "brigade"
      ? (brigades.find((b) => b.excelRow === node.excelRow)?.id ?? brigadeId)
      : brigadeId;
  const employee =
    node.kind === "employee" || node.kind === "crew"
      ? (employees.find((e) => e.excelRow === node.excelRow)?.id ?? employeeId)
      : employeeId;
  if (node.frames && brigade) {
    for (const [dayIndex, frame] of Object.entries(node.frames)) {
      frameRows.push({
        brigadeId: brigade,
        employeeId: employee,
        day: days[Number(dayIndex)]!,
        frame,
        excelRow: node.excelRow,
      });
    }
  }
  for (const child of node.children) collectFrames(child, brigade, employee);
};
for (const root of tree) collectFrames(root, null, null);

const { tree: _tree, ...withoutTree } = payload;
writeFileSync(OUT_CLIENT, `${JSON.stringify({ ...withoutTree, frames: frameRows }, null, 2)}\n`);

console.log(`Лист «${ws.name}», строк ${ws.rowCount}, колонок ${ws.columnCount}`);
console.log(`Дни: ${days.join(", ")}`);
console.log(
  `Группы ${groups.length}, бригады ${brigades.length}, сотрудники и составы ${employees.length}, ` +
    `объекты ${objects.size}, записи ${entries.length}`,
);
console.log(`ФИО заменено: ${realNames.size}, улиц заменено: ${realStreets.size}`);
console.log(`Записано: ${OUT} и ${OUT_CLIENT} (рамок смен: ${frameRows.length})`);
