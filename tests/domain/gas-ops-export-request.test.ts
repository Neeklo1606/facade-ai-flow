import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { ExportRequestError, exportPayloadOf, type GasExportRequest } from "@/api/gas-export";
import { freezeWeek, type PeriodVersion } from "@/domain/gas-ops/week";

/**
 * Выгрузка недели (ADR-061, 11): сервер строит файл по неделе и версии, строки считает сам.
 */

const seed = buildSeed();
const request = (patch: Partial<GasExportRequest> = {}): GasExportRequest => ({
  kind: "approved",
  week: seed.week,
  data: {
    entries: seed.entries,
    groups: seed.groups,
    brigades: seed.brigades,
    employees: seed.employees,
    objects: seed.objects,
    frames: seed.frames,
    periods: [],
  },
  ...patch,
});
const total = (rows: { id: string; total: { amountRub: number | null } }[]) =>
  rows.find((r) => r.id === "total")!.total.amountRub;

describe("выгрузка по неделе и версии", () => {
  test("утверждённая — только принятые записи, без метки черновика", () => {
    const payload = exportPayloadOf(request());
    const confirmed = seed.entries.filter((e) => e.status === "confirmed");
    expect(payload.analytic).toHaveLength(confirmed.length);
    expect(payload.label).toBeNull();
    expect(payload.pendingIds).toEqual([]);
  });

  test("черновик — с непроверенными, метка и их список для подсветки", () => {
    const payload = exportPayloadOf(request({ kind: "draft" }));
    const pending = seed.entries.filter((e) => e.status === "pending").map((e) => e.id);
    expect(payload.label).toEqual({ draft: true });
    expect(payload.pendingIds!.sort()).toEqual(
      seed.entries
        .filter((e) => e.status !== "confirmed")
        .map((e) => e.id)
        .sort(),
    );
    expect(payload.analytic.length).toBe(
      seed.entries.filter((e) => e.status === "confirmed").length + pending.length,
    );
    expect(total(payload.rows)!).toBeGreaterThan(total(exportPayloadOf(request()).rows)!);
  });

  test("версия — из копии записей закрытой недели, а не из текущих данных", () => {
    const frozen = freezeWeek(seed.entries, seed.week.days);
    const version: PeriodVersion = {
      id: "p-1",
      weekFrom: seed.week.from,
      weekTo: seed.week.to,
      version: 1,
      closedAt: "2026-10-05T10:00:00",
      closedBy: "u-director",
      ...frozen,
      accepted: [],
      reopenedAt: null,
      reopenedBy: null,
      reopenReason: null,
    };
    // Текущие данные изменились после закрытия: в файле версии этого нет
    const changed = seed.entries.map((e) =>
      e.status === "confirmed" && e.amountRub !== null
        ? { ...e, amountRub: e.amountRub + 1000 }
        : e,
    );
    const base = request();
    const payload = exportPayloadOf({
      ...base,
      version: 1,
      data: { ...base.data, entries: changed, periods: [version] },
    });
    expect(payload.label).toEqual({ version: 1 });
    expect(total(payload.rows)).toBe(frozen.totals.accruedRub);
  });

  test("нет такой версии — 404; нет недели — 400", () => {
    expect(() => exportPayloadOf(request({ version: 7 }))).toThrow(ExportRequestError);
    try {
      exportPayloadOf(request({ version: 7 }));
    } catch (error) {
      expect((error as ExportRequestError).status).toBe(404);
    }
    try {
      exportPayloadOf({ ...request(), week: undefined as never });
    } catch (error) {
      expect((error as ExportRequestError).status).toBe(400);
    }
  });
});
