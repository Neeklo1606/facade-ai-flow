import { beforeEach, expect, test } from "bun:test";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { getSnapshot, resetState } from "@/adapters/gas-ops/state";
import { confirmReviewSelection } from "@/api/gas-review-selection";
import { canSelectReview, filterReviewPeriod } from "@/domain/gas-ops/review-selection";
import { queue } from "@/domain/gas-ops/view";
import { tabelRows } from "@/domain/gas-ops/tabel";
import { customerFormatRows } from "@/domain/gas-ops/report";
import type { GasOpsPort } from "@/ports/gas-ops";

const port = createGasOpsDemo();
beforeEach(async () => {
  resetState();
  await port.signIn("u-manager");
});

test("объект и включительные границы дат сочетаются; обратный диапазон пуст", () => {
  const base = queue(getSnapshot())[0]!;
  const rows = ["2026-09-28", "2026-09-29", "2026-09-30"].map((day, index) => ({
    ...base,
    entry: { ...base.entry, id: String(index), day, objectId: index === 2 ? "b" : "a" },
  }));
  expect(
    filterReviewPeriod(rows, { objectId: "a", from: "2026-09-28", to: "2026-09-29" }).map(
      (v) => v.entry.id,
    ),
  ).toEqual(["0", "1"]);
  expect(filterReviewPeriod(rows, { from: "2026-09-29" }).map((v) => v.entry.id)).toEqual([
    "1",
    "2",
  ]);
  expect(filterReviewPeriod(rows, { to: "2026-09-28" }).map((v) => v.entry.id)).toEqual(["0"]);
  expect(filterReviewPeriod(rows, { from: "2026-09-30", to: "2026-09-28" })).toEqual([]);
});

test("принимаются только допустимые выбранные; табель сохраняет дату, объект и единственный учёт", async () => {
  const s = await port.snapshot();
  const rows = queue(s);
  const clean = rows.find(canSelectReview)!;
  const blocked = rows.find((v) => !canSelectReview(v))!;
  expect(clean).toBeDefined();
  expect(blocked).toBeDefined();
  const id = clean.entry.id;
  const done = await confirmReviewSelection(port, [id, blocked.entry.id, id]);
  expect(done.done).toEqual([id]);
  expect(done.failed.map((x) => x.id)).toEqual([blocked.entry.id]);
  const after = await port.snapshot();
  const entry = after.entries.find((e) => e.id === id)!;
  expect(entry).toMatchObject({
    day: clean.entry.day,
    objectId: clean.entry.objectId,
    status: "confirmed",
  });
  expect(after.entries).toHaveLength(s.entries.length);
  expect(after.entries.find((e) => e.id === blocked.entry.id)?.status).toBe("pending");
  const grid = tabelRows({ ...after, days: after.week.days, expected: [] });
  const address = grid.find((r) => r.kind === "address" && r.total.entryIds.includes(id))!;
  expect(address).toBeDefined();
  expect(
    address.days[after.week.days.indexOf(entry.day)]?.entryIds.filter((x) => x === id),
  ).toEqual([id]);
  const report = customerFormatRows({
    ...after,
    days: after.week.days,
    frames: [],
    mode: "confirmed",
  });
  expect(report.find((r) => r.kind === "address" && r.entryIds.includes(id))).toBeDefined();
  expect((await confirmReviewSelection(port, [id])).done).toEqual([]);
  expect(
    (await port.snapshot()).reviews.filter((r) => r.entryId === id && r.action === "confirm"),
  ).toHaveLength(1);
  await port.undoReview(id);
  expect((await port.snapshot()).entries.find((e) => e.id === id)?.status).toBe("pending");
});

test("частичный отказ возвращает только успехи для отмены и продолжает пакет", async () => {
  const clean = queue(await port.snapshot()).find(canSelectReview)!;
  const faulty = {
    ...port,
    review: async () => {
      throw new Error("Нет связи");
    },
  } as GasOpsPort;
  const result = await confirmReviewSelection(faulty, [clean.entry.id, "missing"]);
  expect(result.done).toEqual([]);
  expect(result.failed).toHaveLength(2);
  expect(result.failed[0]?.message).toBe("Нет связи");
  expect((await port.snapshot()).entries.find((e) => e.id === clean.entry.id)?.status).toBe(
    "pending",
  );
});
