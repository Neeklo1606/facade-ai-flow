import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import type { Grid } from "@/domain/gas-ops/estimate-labels";
import { cellDay, readFileWeek, reconcileFile } from "@/domain/gas-ops/reconcile-file";

/**
 * Сверка недели с Excel заказчика (финальный промт, 1.8; ADR-063): файл в формате
 * «ФАКТИЧЕСКИЙ ОТЧЁТ» собирается в тесте из принятых записей системы, потом портится.
 */
const seed = buildSeed();
const days = seed.week.days;
const confirmed = seed.entries.filter((e) => e.status === "confirmed" && days.includes(e.day));

/** Лист как у заказчика: подпись в A, с E по три столбца на день */
function fileGrid(
  rows: { label: string; byDay: Record<string, { amount: number; hours: number }> }[],
): Grid {
  const head: Grid[number] = ["Бригада и адрес", null, null, null];
  const metrics: Grid[number] = ["Бригада и адрес", null, null, null];
  for (const day of days) {
    head.push(`${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`, null, null);
    metrics.push("Сумма начислений", "Эффективное рабочее время (ч.)", "Доходность часа");
  }
  const grid: Grid = [head, metrics, ["1. СТАЛЬНЫЕ"], ["Бригада 1"]];
  for (const row of rows) {
    const line: Grid[number] = [row.label, null, null, null];
    for (const day of days) {
      const v = row.byDay[day];
      line.push(v?.amount ?? null, v?.hours ?? null, null);
    }
    grid.push(line);
    // Рамка смены под адресом: без подписи, не сверяется
    grid.push([null, null, null, null, "8.20-16.40"]);
  }
  return grid;
}

function systemRows() {
  const map = new Map<string, Record<string, { amount: number; hours: number }>>();
  for (const e of confirmed) {
    const label = seed.objects.find((o) => o.id === e.objectId)!.label;
    const byDay = map.get(label) ?? {};
    const prev = byDay[e.day] ?? { amount: 0, hours: 0 };
    byDay[e.day] = {
      amount: prev.amount + (e.amountRub ?? 0),
      hours: Math.round((prev.hours + e.minutes / 60) * 100) / 100,
    };
    map.set(label, byDay);
  }
  return [...map.entries()].map(([label, byDay]) => ({ label, byDay }));
}

describe("сверка с Excel заказчика", () => {
  test("дни шапки: строка, ISO и число Excel", () => {
    expect(cellDay("28.09.2026")).toBe("2026-09-28");
    expect(cellDay("2026-09-28")).toBe("2026-09-28");
    expect(cellDay(46293)).toBe("2026-09-28");
    expect(cellDay("Бригада и адрес")).toBeNull();
  });

  test("файл из тех же записей сходится полностью", () => {
    const file = readFileWeek(fileGrid(systemRows()), seed.objects)!;
    expect(file.days).toEqual(days);
    const result = reconcileFile(file, seed.entries, seed.objects);
    expect(result.discrepancies).toEqual([]);
    expect(result.matched).toBe(result.compared);
    expect(result.compared).toBeGreaterThan(0);
  });

  test("причины: нет записи, нет в файле, другое время, другая сумма", () => {
    const rows = systemRows();
    const [a, b, c, ...rest] = rows;
    const dayOf = (row: (typeof rows)[number]) => Object.keys(row.byDay)[0]!;
    // a — в файле другое время, b — другая сумма, c — в файле нет
    const aDay = dayOf(a!);
    const bDay = dayOf(b!);
    const changed = [
      {
        ...a!,
        byDay: { ...a!.byDay, [aDay]: { ...a!.byDay[aDay]!, hours: a!.byDay[aDay]!.hours + 1 } },
      },
      {
        ...b!,
        byDay: {
          ...b!.byDay,
          [bDay]: { ...b!.byDay[bDay]!, amount: b!.byDay[bDay]!.amount + 500 },
        },
      },
      ...rest,
    ];
    // Объект без записей системы, но с цифрами в файле
    const spare = seed.objects.find((o) => !confirmed.some((e) => e.objectId === o.id))!;
    changed.push({ label: spare.label, byDay: { [days[0]!]: { amount: 1000, hours: 2 } } });
    // Адрес, которого нет среди объектов
    changed.push({
      label: "ст. Демо-Неизвестная, ул. Демо, 999",
      byDay: { [days[0]!]: { amount: 1, hours: 1 } },
    });

    const file = readFileWeek(fileGrid(changed), seed.objects)!;
    const result = reconcileFile(file, seed.entries, seed.objects);
    const reasons = Object.fromEntries(
      result.discrepancies.map((d) => [`${d.objectLabel}|${d.day}`, d.reason]),
    );
    expect(reasons[`${a!.label}|${aDay}`]).toBe("time");
    expect(reasons[`${b!.label}|${bDay}`]).toBe("amount");
    for (const day of Object.keys(c!.byDay))
      expect(reasons[`${c!.label}|${day}`]).toBe("not-in-file");
    expect(reasons[`${spare.label}|${days[0]}`]).toBe("no-entry");
    expect(result.unknown.map((u) => u.label)).toEqual(["ст. Демо-Неизвестная, ул. Демо, 999"]);
  });

  test("лист без строки дат — не неделя", () => {
    expect(readFileWeek([["Смета"], ["Итого", 100]], seed.objects)).toBeNull();
  });
});
