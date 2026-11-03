import { describe, expect, test } from "bun:test";
import { weekReadyNotice } from "@/domain/gas-ops/week";

/** «Неделя готова к закрытию» с пятницы 18:00 (финальный промт, 1.5; ADR-063) */
describe("неделя готова к закрытию", () => {
  const base = { weekFrom: "2026-09-28", closed: false, entries: 93, remarks: 9 };

  test("до пятницы 18:00 плашки нет, с 18:00 есть", () => {
    expect(weekReadyNotice({ ...base, now: "2026-10-02T17:59" })).toBeNull();
    expect(weekReadyNotice({ ...base, now: "2026-10-02T18:00" })).toEqual({
      entries: 93,
      remarks: 9,
    });
    expect(weekReadyNotice({ ...base, now: "2026-10-03T09:00" })).not.toBeNull();
    expect(weekReadyNotice({ ...base, now: "2026-09-30T20:00" })).toBeNull();
  });

  test("закрытая неделя — плашки нет", () => {
    expect(weekReadyNotice({ ...base, closed: true, now: "2026-10-03T09:00" })).toBeNull();
  });
});
