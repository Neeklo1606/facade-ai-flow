import { describe, expect, test } from "bun:test";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import { completenessOf } from "@/domain/gas-ops/exec-docs";
import { buildDocsSeed } from "@/data/mock/gas-docs-seed";
import { limitCheck, limitText, parseRequestText } from "@/domain/gas-ops/supply";
import {
  DOCS_SAMPLE,
  formatMillions,
  HERO_HOURS,
  HERO_WEEK,
  SUPPLY_SAMPLE,
  WEEK_SAMPLE,
  WEEK_TOTAL_RUB,
} from "@/lib/site/sample";

/**
 * Числа лендинга (ADR-059) записаны в sample.ts, чтобы не грузить сид в сайт. Тест держит их
 * равными публичному набору «Демо-подрядчик»: правка набора без правки лендинга здесь падает.
 */
describe("пример недели на первом экране", () => {
  const snapshot = getServerSnapshot();

  test("дни и подтверждённое начисление по дням совпадают с набором", () => {
    expect(WEEK_SAMPLE.dates).toEqual(snapshot.week.days);
    const byDay = snapshot.week.days.map((day) =>
      snapshot.entries
        .filter((e) => e.day === day && e.status === "confirmed")
        .reduce((sum, e) => sum + (e.amountRub ?? 0), 0),
    );
    expect(WEEK_SAMPLE.amountRub).toEqual(byDay);
  });

  test("итог минут и число подтверждённых записей совпадают с набором", () => {
    const confirmed = snapshot.entries.filter(
      (e) => snapshot.week.days.includes(e.day) && e.status === "confirmed",
    );
    expect(WEEK_SAMPLE.confirmedMinutes).toBe(confirmed.reduce((sum, e) => sum + e.minutes, 0));
    expect(WEEK_SAMPLE.confirmedEntries).toBe(confirmed.length);
  });

  test("пример акта: комплектность и строка «не хватает» из демо-набора документов", () => {
    const docs = buildDocsSeed(snapshot.today);
    const work = docs.works.find((w) => w.number === DOCS_SAMPLE.work)!;
    const result = completenessOf(
      { docs, supply: snapshot.supply, objects: snapshot.objects },
      work,
    );
    expect(result.percent).toBe(DOCS_SAMPLE.percent);
    expect(result.issues.map((i) => [i.text, i.owner])).toEqual([
      [DOCS_SAMPLE.missing, DOCS_SAMPLE.owner],
    ]);
  });

  test("пример заявки: разбор текста и лимит сметы из демо-набора снабжения", () => {
    const { items, limits, requests } = snapshot.supply;
    const draft = parseRequestText(SUPPLY_SAMPLE.text, items, snapshot.today);
    const line = draft.lines[0]!;
    const item = items.find((i) => i.id === line.itemId)!;
    expect(item.name).toBe(SUPPLY_SAMPLE.item);
    expect(`${line.qty}\u00a0${item.unit}`).toBe(SUPPLY_SAMPLE.qty);
    const check = limitCheck({
      objectId: "obj-m1",
      itemId: item.id,
      qty: line.qty!,
      limits,
      requests,
    });
    expect(limitText(check, item.unit)).toBe(SUPPLY_SAMPLE.limit);
  });

  test("первый экран «Тепло»: запись бригады 2, ждущие записи и суммы бригад из набора", () => {
    const week = snapshot.entries.filter((e) => snapshot.week.days.includes(e.day));
    expect(week.filter((e) => e.status === "pending")).toHaveLength(HERO_WEEK.pendingEntries);
    const entry = week.find((e) => e.number === HERO_WEEK.entry.number)!;
    expect(entry.status).toBe("pending");
    expect(entry.amountRub).toBe(HERO_WEEK.entry.amountRub);
    const brigade = snapshot.brigades.find((b) => b.id === entry.brigadeId)!;
    expect(brigade.name).toBe(HERO_WEEK.entry.brigade);
    const object = snapshot.objects.find((o) => o.id === entry.objectId)!;
    expect(object.label).toContain(HERO_WEEK.entry.object);
    for (const row of HERO_WEEK.brigades) {
      const sum = week
        .filter((e) => e.brigadeId === row.id && e.status === "confirmed")
        .reduce((total, e) => total + (e.amountRub ?? 0), 0);
      expect(sum).toBe(row.amountRub);
      expect(snapshot.brigades.find((b) => b.id === row.id)!.name).toBe(row.name);
    }
    expect(HERO_HOURS).toBe(402);
    expect(formatMillions(WEEK_TOTAL_RUB)).toBe("1,70М");
  });
});
