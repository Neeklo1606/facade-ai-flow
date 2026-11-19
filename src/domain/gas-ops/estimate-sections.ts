/**
 * Разбивка разделов сметы (ADR-077): материалы, машины, ФОТ, НР, СП, нормативные т/з и строки
 * испытаний. Отдельный проход по той же сетке, что и разбор итогов: раздел узнаётся по строке
 * закрытия («Итого по разделу N» в ресурсной, «Всего по разделу N» в ГРАНД), её номер уже есть
 * у раздела.
 *
 * Ресурсная смета: блок «Итоги по разделу N …:» → «Итого», «В том числе:» и строки состава.
 * Строки с нулём в блок не попадают: нет строки «Материалы» — материалов в разделе нет, это
 * сверяется с колонкой «Мат» строки «Итого прямые затраты по разделу».
 * ГРАНД-Смета: блок «Итоги по разделу N …:» → «Всего прямые затраты (справочно)», первая
 * «Материалы», «Эксплуатация машин», «Всего ФОТ / НР / СП (справочно)»; т/з рабочих — строкой
 * ниже «Всего по разделу». Чего в блоке нет, остаётся «нет в файле».
 */
import type {
  EstimateFormat,
  EstimateSection,
  Grid,
  PressureLine,
  SectionBreakdown,
  SectionPart,
  SectionPartKey,
} from "./estimate-labels";

const text = (cell: unknown): string =>
  typeof cell === "string" ? cell.replace(/\s+/g, " ").trim() : "";
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

function num(cell: unknown): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== "string") return null;
  const s = cell.replace(/[\s\u00a0]/g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}
const kop = (v: number) => Math.round(v * 100);

function headerCol(grid: Grid, test: (t: string) => boolean): number | null {
  for (let r = 0; r < Math.min(grid.length, 80); r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) if (test(norm(text(row[c])))) return c;
  }
  return null;
}

/** Первая подпись строки и число правее неё (или в колонке сумм) */
function labelled(row: unknown[], amountCol: number | null) {
  for (let c = 0; c < row.length; c++) {
    const t = text(row[c]);
    if (t && num(t) === null) {
      const amount =
        amountCol !== null && num(row[amountCol]) !== null
          ? num(row[amountCol])
          : (row
              .slice(c + 1)
              .map(num)
              .find((v) => v !== null) ?? null);
      return { label: t, l: norm(t), col: c, amount };
    }
  }
  return null;
}

/* ---------------------------------------------------------------- Испытания */

/**
 * Шифры испытаний газопроводов: пневматическое испытание (19-01-015), подъём давления и
 * выдержка (24-02-122…124), продувка перед испытанием (24-02-120). Монтаж узла для испытания
 * (24-02-121) — монтаж, а не испытание: в опрессовку не берётся, вопрос владельцу в ADR-077
 */
const PRESSURE_CODE = /(?:^|\D)(19-01-01[5-9]|24-02-12[02-4])(?:\D|$)/;

export function isPressureLine(code: string, name: string): boolean {
  const n = norm(name);
  if (n.startsWith("монтаж")) return false;
  return PRESSURE_CODE.test(code) || /испытани|опрессовк/.test(n);
}

export function isPressureTitle(title: string): boolean {
  return /испытан|опрессов/.test(norm(title));
}

/* ---------------------------------------------------------------- Проход */

interface Open {
  parts: Partial<Record<SectionPartKey, { kopecks: number; row: number }>>;
  labor: { value: number; row: number } | null;
  inBlock: boolean;
  /** Колонка «Мат» строки прямых затрат раздела: подтверждает, что материалов нет */
  directMaterials: { kopecks: number | null; row: number } | null;
  pressure: PressureLine[];
}

const fresh = (): Open => ({
  parts: {},
  labor: null,
  inBlock: false,
  directMaterials: null,
  pressure: [],
});

const RESOURCE_PART: Record<string, SectionPartKey> = {
  материалы: "materials",
  "машины и механизмы": "machines",
  фот: "payroll",
  "накладные расходы": "overhead",
  "сметная прибыль": "profit",
};

const GRAND_PART: [RegExp, SectionPartKey][] = [
  [/^всего прямые затраты/, "direct"],
  [/^материалы$/, "materials"],
  [/^эксплуатация машин$/, "machines"],
  [/^всего фот/, "payroll"],
  [/^всего накладные расходы/, "overhead"],
  [/^всего сметная прибыль/, "profit"],
];

/** Номер раздела из подписи: «Итого по разделу 3 Монтаж…» → «3» */
export function sectionNumber(label: string): string | null {
  const m = /по разделу\s*(\d+(?:\.\d+)*)/i.exec(label) ?? /^раздел\s*(\d+(?:\.\d+)*)/i.exec(label);
  return m ? m[1]! : null;
}

/**
 * Дополнить разделы разбивкой. Разделы приходят из разбора итогов, порядок и суммы не
 * меняются: здесь только то, что лежит рядом в файле
 */
export function withBreakdown(
  grid: Grid,
  format: EstimateFormat,
  sections: EstimateSection[],
  amountCol: number | null,
): EstimateSection[] {
  const byRow = new Map(sections.map((s) => [s.row, s]));
  const result = new Map<number, EstimateSection>();
  const laborCol =
    format === "grand"
      ? headerCol(grid, (t) => t === "всего с учетом коэффициентов")
      : headerCol(grid, (t) => t.startsWith("т/з осн"));
  const col = {
    pay: headerCol(grid, (t) => t === "осн.з/п"),
    payMech: headerCol(grid, (t) => t === "з/пмех"),
    mat: headerCol(grid, (t) => t === "мат"),
  };

  let open = fresh();
  /** ГРАНД: позиция испытаний ждёт своих строк до «Всего по позиции» */
  let position: PressureLine | null = null;
  /** ГРАНД: т/з рабочих стоят под «Всего по разделу» — ждём их у закрытого раздела */
  let awaitingLabor: number | null = null;

  grid.forEach((row, index) => {
    const rowNumber = index + 1;
    const cells = row ?? [];
    const found = labelled(cells, amountCol);
    if (!found) return;
    const { l, amount } = found;

    if (format === "grand" && awaitingLabor !== null) {
      if (l.startsWith("затраты труда рабочих")) {
        const t = laborCol !== null ? num(cells[laborCol]) : null;
        const s = result.get(awaitingLabor);
        if (t !== null && s?.breakdown) s.breakdown.laborHours = { value: t, row: rowNumber };
        awaitingLabor = null;
        return;
      }
      if (/^раздел\s/.test(l) || l.startsWith("итоги по смете")) awaitingLabor = null;
    }

    // Строки позиций: шифр во второй колонке, наименование в третьей
    const code = text(cells[1]);
    const name = text(cells[2]);
    const first = cells[0];
    const isPosition =
      code.length > 3 &&
      name.length > 3 &&
      (typeof first === "number" || /^'?\d+(\.\d+)?$/.test(text(first)));
    if (isPosition) {
      if (position) position = null;
      if (isPressureLine(code, name)) {
        if (format === "resource") {
          const direct = amountCol !== null ? num(cells[amountCol]) : null;
          const pay =
            (col.pay !== null ? (num(cells[col.pay]) ?? 0) : 0) +
            (col.payMech !== null ? (num(cells[col.payMech]) ?? 0) : 0);
          open.pressure.push({
            row: rowNumber,
            code,
            name,
            directKopecks: kop(direct ?? 0),
            payrollKopecks: kop(pay),
            materialsKopecks: kop(col.mat !== null ? (num(cells[col.mat]) ?? 0) : 0),
            totalKopecks: null,
            totalRow: null,
          });
        } else {
          position = {
            row: rowNumber,
            code,
            name,
            directKopecks: 0,
            payrollKopecks: 0,
            materialsKopecks: 0,
            totalKopecks: null,
            totalRow: null,
          };
          open.pressure.push(position);
        }
      }
      return;
    }

    if (
      format === "grand" &&
      position &&
      (l.startsWith("итоги по разделу") || byRow.has(rowNumber))
    )
      position = null;
    if (format === "grand" && position) {
      const label2 = norm(name || found.label);
      const value = amountCol !== null ? num(cells[amountCol]) : amount;
      if (label2 === "м" && value !== null) position.materialsKopecks = kop(value);
      else if (label2 === "фот" && value !== null) position.payrollKopecks = kop(value);
      else if (label2 === "итого прямые затраты" && value !== null)
        position.directKopecks = kop(value);
      else if (label2 === "всего по позиции" && value !== null) {
        position.totalKopecks = kop(value);
        position.totalRow = rowNumber;
        position = null;
      }
      return;
    }

    if (l.startsWith("итоги по разделу")) {
      open.inBlock = true;
      return;
    }

    if (format === "resource" && l.startsWith("итого прямые затраты по разделу")) {
      if (amount !== null) open.parts.direct = { kopecks: kop(amount), row: rowNumber };
      const t = laborCol !== null ? num(cells[laborCol]) : null;
      if (t !== null) open.labor = { value: t, row: rowNumber };
      const m = col.mat !== null ? num(cells[col.mat]) : null;
      open.directMaterials = { kopecks: m === null ? null : kop(m), row: rowNumber };
      return;
    }

    const closing = byRow.get(rowNumber);
    if (closing) {
      result.set(rowNumber, { ...closing, ...finish(closing, open, format) });
      if (format === "grand") awaitingLabor = rowNumber;
      open = fresh();
      return;
    }

    if (!open.inBlock || amount === null) return;
    if (format === "resource") {
      const key = RESOURCE_PART[l];
      if (key && !open.parts[key]) open.parts[key] = { kopecks: kop(amount), row: rowNumber };
      if (l === "итого") {
        const t = laborCol !== null ? num(cells[laborCol]) : null;
        if (t !== null) open.labor = { value: t, row: rowNumber };
      }
    } else {
      for (const [re, key] of GRAND_PART) {
        if (re.test(l) && !open.parts[key]) {
          open.parts[key] = { kopecks: kop(amount), row: rowNumber };
          break;
        }
      }
    }
  });

  return sections.map((s) => result.get(s.row) ?? { ...s, number: sectionNumber(s.title) });
}

function finish(
  section: EstimateSection,
  open: Open,
  format: EstimateFormat,
): Pick<EstimateSection, "number" | "breakdown" | "pressureLines"> {
  const keys: SectionPartKey[] = [
    "direct",
    "materials",
    "machines",
    "payroll",
    "overhead",
    "profit",
  ];
  const parts = {} as Record<SectionPartKey, SectionPart>;
  for (const key of keys) {
    const got = open.parts[key];
    if (got) {
      parts[key] = got;
      continue;
    }
    if (format === "resource" && open.inBlock) {
      // В блоке итогов раздела строк с нулём нет. Для материалов это сверяется с колонкой «Мат»
      if (key === "materials" && open.directMaterials && open.directMaterials.kopecks) {
        parts[key] = {
          kopecks: open.directMaterials.kopecks,
          row: open.directMaterials.row,
          note: "из колонки «Мат» прямых затрат раздела",
        };
      } else if (key === "materials" && open.directMaterials) {
        parts[key] = {
          kopecks: 0,
          row: open.directMaterials.row,
          note: "материалов в разделе нет: колонка «Мат» пустая, строки «Материалы» в итогах нет",
        };
      } else {
        parts[key] = { kopecks: 0, row: section.row, note: "строки в итогах раздела нет: ноль" };
      }
      continue;
    }
    parts[key] = { kopecks: null, row: null, note: "нет в файле" };
  }
  const pressureSection = isPressureTitle(section.title);
  const breakdown: SectionBreakdown = {
    parts,
    laborHours: open.labor,
    pressureSection,
  };
  return {
    number: sectionNumber(section.title),
    breakdown,
    // Раздел целиком испытания: его строки не выделяются отдельно, опрессовка — весь раздел
    pressureLines: pressureSection ? [] : open.pressure,
  };
}
