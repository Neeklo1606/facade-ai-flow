import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import type { TimeEntry } from "@/domain/gas-ops/model";
import { customerFormatRows } from "@/domain/gas-ops/report";
import { statsValues, tabelRows, type TabelInput } from "@/domain/gas-ops/tabel";

/**
 * Разделы сметы в табеле (ADR-080): строки разделов под адресом, сумма адреса не меняется,
 * итог выделенного без двойного счёта, выгрузка заказчику без разделов.
 */

const seed = buildSeed();
const fact = seed.entries.filter((e) => e.source === "fact-report");
// Пара «бригада и объект» с наибольшим числом записей
const pairs = new Map<string, TimeEntry[]>();
for (const e of fact) {
  const k = `${e.brigadeId}|${e.objectId}|${e.employeeId ?? ""}`;
  pairs.set(k, [...(pairs.get(k) ?? []), e]);
}
const sample = [...pairs.values()].sort((a, b) => b.length - a.length)[0]![0]!;
// Записи одного адреса: часть в разделе 1, часть в разделе 2, одна без раздела
const own = fact.filter((e) => e.objectId === sample.objectId && e.brigadeId === sample.brigadeId);
const tagged: TimeEntry[] = fact.map((e) => {
  const i = own.indexOf(e);
  if (i < 0) return e;
  return { ...e, sectionKey: i === 0 ? null : i % 2 ? "1" : "2" };
});
const sections = [
  { objectId: sample.objectId, key: "2", label: "Раздел 2. Испытания" },
  { objectId: sample.objectId, key: "1", label: "Раздел 1. Монтаж газопровода" },
];
const input = (withSections: boolean): TabelInput => ({
  groups: seed.groups,
  brigades: seed.brigades,
  employees: seed.employees,
  objects: seed.objects,
  days: seed.week.days,
  entries: tagged,
  estimates: seed.estimates,
  expected: [],
  ...(withSections ? { sections } : {}),
});

describe("разделы под адресом", () => {
  const rows = tabelRows(input(true));
  const plain = tabelRows(input(false));
  const children = rows.filter((r) => r.kind === "section");
  const address = rows.find((r) => r.id === children[0]?.parentId)!;

  test("строки разделов идут под своим адресом в порядке сметы, без раздела последней", () => {
    expect(own.length).toBeGreaterThan(2);
    expect(address.kind).toBe("address");
    expect(address.hasChildren).toBe(true);
    const labels = children.filter((c) => c.parentId === address.id).map((c) => c.label);
    expect(labels).toEqual(["Раздел 2. Испытания", "Раздел 1. Монтаж газопровода", "Без раздела"]);
    for (const c of children) expect(c.level).toBe(address.level + 1);
  });

  test("сумма разделов равна адресу, итоги групп не меняются", () => {
    const mine = children.filter((c) => c.parentId === address.id);
    const minutes = mine.reduce((a, c) => a + (c.total.minutes ?? 0), 0);
    const amount = mine.reduce((a, c) => a + (c.total.amountRub ?? 0), 0);
    expect(minutes).toBe(address.total.minutes ?? 0);
    expect(amount).toBe(address.total.amountRub ?? 0);
    const total = (list: typeof rows) => list.find((r) => r.id === "total")!.total;
    expect(total(rows)).toEqual(total(plain));
    expect(rows.filter((r) => r.kind !== "section").map((r) => r.id)).toEqual(
      plain.map((r) => r.id),
    );
  });

  test("пустой день раздела не помечается пропуском", () => {
    for (const c of children) for (const d of c.days) expect(d.status).not.toBe("missing");
  });

  test("итог столбца с адресом и его разделами считается один раз", () => {
    const cells = [address, ...children.filter((c) => c.parentId === address.id)].map((r) => ({
      value: r.total.minutes,
      kind: r.kind,
    }));
    const { values } = statsValues(cells);
    expect(values).toEqual([address.total.minutes]);
  });

  test("без списка разделов строк нет: выгрузка заказчику прежняя", () => {
    expect(plain.some((r) => r.kind === "section")).toBe(false);
    const report = customerFormatRows({ ...input(false), frames: [], mode: "confirmed" });
    expect(report.some((r) => r.kind === "section")).toBe(false);
  });
});
