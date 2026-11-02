import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { factReportFull as factReport } from "@/data/mock/fact-report.full";
import { effectiveMinutes, parseClock } from "@/domain/gas-ops/calc";
import type { TimeEntry } from "@/domain/gas-ops/model";
import { customerFormatRows } from "@/domain/gas-ops/report";
import {
  metricOrder,
  metricValue,
  moveSelection,
  peopleRows,
  peopleTotals,
  rectOf,
  selectionStats,
  tabelRows,
  toTsv,
  tsvNumber,
  versionChecksum,
  visibleTabelRows,
  wholeColumn,
  wholeRow,
  type TabelInput,
} from "@/domain/gas-ops/tabel";

/**
 * «Табель» (ADR-061, 11; раздел 4.5): контрольная сверка иерархии и итогов, статус ячеек,
 * выделение, TSV, вид «По людям», контрольная сумма версии.
 */

const seed = buildSeed();
const base = (entries: TimeEntry[], expected: TabelInput["expected"] = []): TabelInput => ({
  groups: seed.groups,
  brigades: seed.brigades,
  employees: seed.employees,
  objects: seed.objects,
  days: seed.week.days,
  entries,
  estimates: seed.estimates,
  expected,
});
const fact = seed.entries.filter((e) => e.source === "fact-report");

describe("контрольная сверка", () => {
  const rows = tabelRows(base(fact));

  test("итог недели и группы совпадают с «Форматом заказчика» и файлом", () => {
    const report = customerFormatRows({ ...base(fact), frames: [], mode: "confirmed" });
    const total = rows.find((r) => r.id === "total")!;
    expect(total.total.amountRub).toBe(1_524_132);
    expect(total.total.amountRub).toBe(report.find((r) => r.id === "total")!.total.amountRub);
    for (const group of seed.groups) {
      const node = factReport.tree.find((g) => g.excelRow === group.excelRow)!;
      const row = rows.find((r) => r.id === `g-${group.id}`)!;
      expect(row.total.amountRub ?? 0, group.name).toBe(node.total.amount ?? 0);
    }
    // Строка «Итого» файла — контрольная цифра снимка (D14), в ней не хватает групп 2 и 4
    expect(factReport.grandTotal.total.amount).toBe(5_165_357);
  });

  test("иерархия: подразделение → бригада → бригадир → объект, рамок смены нет", () => {
    expect(rows.some((r) => r.kind === "frame")).toBe(false);
    const kinds = new Set(rows.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(["address", "brigade", "employee", "group", "total"]);
    for (const row of rows.filter((r) => r.parentId)) {
      const parent = rows.find((r) => r.id === row.parentId)!;
      expect(parent.level, row.label).toBeLessThan(row.level);
      expect(parent.hasChildren).toBe(true);
    }
  });

  test("родительские строки не суммируют дочерние повторно", () => {
    for (const parent of rows.filter((r) => r.hasChildren)) {
      const children = rows.filter((r) => r.parentId === parent.id);
      const sum = children.reduce((a, r) => a + (r.total.amountRub ?? 0), 0);
      const minutes = children.reduce((a, r) => a + (r.total.minutes ?? 0), 0);
      expect(parent.total.amountRub ?? 0, parent.label).toBe(sum);
      expect(parent.total.minutes ?? 0, parent.label).toBe(minutes);
    }
    // Каждая запись лежит ровно в одной адресной строке
    const addressIds = rows.filter((r) => r.kind === "address").flatMap((r) => r.total.entryIds);
    expect(new Set(addressIds).size).toBe(addressIds.length);
    expect(addressIds.length).toBe(fact.length);
  });

  test("08:30–11:40 без перерыва — 190 минут", () => {
    const result = effectiveMinutes({
      start: parseClock("08:30")!,
      end: parseClock("11:40")!,
      breakMinutes: 0,
    });
    expect(result.ok && result.minutes).toBe(190);
  });
});

describe("статус ячейки", () => {
  const day = seed.week.days[5]!;
  const pending = seed.entries.find((e) => e.status === "pending" && e.day === day)!;

  test("непроверенная запись — «draft», все принятые — «ok»", () => {
    const rows = tabelRows(base([...fact, pending]));
    const cell = rows
      .filter((r) => r.kind === "address")
      .flatMap((r) => r.days)
      .find((c) => c.entryIds.includes(pending.id))!;
    expect(cell.status).toBe("draft");
    const ok = tabelRows(base(fact))
      .filter((r) => r.kind === "address")
      .flatMap((r) => r.days)
      .find((c) => c.entryIds.length > 0)!;
    expect(ok.status).toBe("ok");
  });

  test("ожидали по графику, записи нет — «missing»; без ожидания — «off»", () => {
    const entry = fact[0]!;
    const other = seed.week.days.find((d) => d !== entry.day)!;
    const rows = tabelRows(
      base([entry], [{ brigadeId: entry.brigadeId, day: other, objectId: entry.objectId }]),
    );
    const address = rows.find((r) => r.kind === "address")!;
    const index = seed.week.days.indexOf(other);
    expect(address.days[index]!.status).toBe("missing");
    const free = seed.week.days.findIndex((d) => d !== other && d !== entry.day);
    expect(address.days[free]!.status).toBe("off");
  });

  test("нет сметы — ⚠, человеко-часы без состава — null, а не ноль", () => {
    const own = seed.entries.find((e) => e.number === "ГЗ-00098")!;
    const rows = tabelRows(base([own]));
    const cell = rows.find((r) => r.kind === "address")!.total;
    expect(cell.noEstimate).toBe(true);
    const factCell = tabelRows(base(fact)).find((r) => r.id === "total")!.total;
    expect(factCell.manMinutes).toBeNull();
    expect(metricValue(factCell, "man")).toBeNull();
  });

  test("свёрнутая группа прячет всех потомков", () => {
    const rows = tabelRows(base(fact));
    const group = rows.find((r) => r.kind === "group")!;
    const visible = visibleTabelRows(rows, new Set([group.id]));
    expect(visible.some((r) => r.parentId === group.id)).toBe(false);
    expect(visible).toContain(group);
  });
});

describe("выделение и буфер", () => {
  const size = { rows: 5, cols: 4 };

  test("Shift+стрелки расширяют от якоря, без Shift — переносят ячейку", () => {
    const start = { anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 } };
    const wide = moveSelection(
      moveSelection(start, { row: 1, col: 0 }, true, size),
      { row: 0, col: 2 },
      true,
      size,
    );
    expect(rectOf(wide)).toEqual({ top: 1, left: 1, bottom: 2, right: 3 });
    expect(moveSelection(wide, { row: 0, col: 1 }, false, size)).toEqual({
      anchor: { row: 2, col: 3 },
      focus: { row: 2, col: 3 },
    });
    expect(rectOf(wholeRow(2, 4))).toEqual({ top: 2, left: 0, bottom: 2, right: 3 });
    expect(rectOf(wholeColumn(3, 5))).toEqual({ top: 0, left: 3, bottom: 4, right: 3 });
  });

  test("итоги выделенного: пустые не считаются нулём", () => {
    expect(selectionStats([19950, null, 14700, 0])).toEqual({ sum: 34650, avg: 11550, count: 3 });
    expect(selectionStats([null, null])).toEqual({ sum: 0, avg: null, count: 0 });
  });

  test("TSV: табуляция и переводы строк, числа с запятой без пробелов", () => {
    expect(tsvNumber(2.5)).toBe("2,5");
    expect(tsvNumber(19950)).toBe("19950");
    expect(tsvNumber(null)).toBe("");
    expect(
      toTsv([
        ["Объект", "Сб 03.10"],
        ["ул. Демо, 102", "2,5"],
        ['кавычка "x"', "a\tb"],
      ]),
    ).toBe('Объект\tСб 03.10\nул. Демо, 102\t2,5\n"кавычка ""x"""\t"a b"');
  });

  test("порядок показателей из «Колонок»", () => {
    expect(metricOrder(["amount", "hours", "rate"], "money")).toEqual(["amount", "hours", "rate"]);
    expect(metricOrder(["amount", "hours", "rate", "man"], "time")).toEqual([
      "hours",
      "man",
      "amount",
      "rate",
    ]);
  });
});

describe("по людям и версии", () => {
  test("часы по сотрудникам из поимённых строк, итог по дням", () => {
    const lead = seed.employees.find((e) => e.isLead)!;
    const mate = seed.employees.find((e) => e.brigadeId === lead.brigadeId && !e.isLead) ?? lead;
    const day = seed.week.days[1]!;
    const entry: TimeEntry = {
      ...fact[0]!,
      id: "t-people",
      day,
      status: "pending",
      people: [
        {
          employeeId: lead.id,
          startMinutes: 480,
          endMinutes: 1020,
          breakMinutes: 60,
          minutes: 480,
        },
        { employeeId: mate.id, startMinutes: 480, endMinutes: 780, breakMinutes: 0, minutes: 300 },
      ],
    };
    const rows = peopleRows([entry, fact[1]!], seed.employees, seed.week.days);
    expect(rows.map((r) => r.total).sort((a, b) => a - b)).toEqual(
      lead.id === mate.id ? [780] : [300, 480],
    );
    expect(peopleTotals(rows, seed.week.days)[1]).toBe(780);
    expect(rows.every((r) => r.days[0] === null)).toBe(true);
  });

  test("контрольная сумма версии стабильна и меняется от правки", () => {
    const a = versionChecksum(fact);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(versionChecksum([...fact].reverse())).toBe(a);
    const changed = fact.map((e, i) => (i === 0 ? { ...e, minutes: e.minutes + 1 } : e));
    expect(versionChecksum(changed)).not.toBe(a);
  });
});
