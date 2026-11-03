import { beforeEach, describe, expect, test } from "bun:test";
import { gasOps } from "@/adapters/gas-ops/demo";
import { getSnapshot, resetState } from "@/adapters/gas-ops/state";
import type { CreateEntryInput } from "@/ports/gas-ops";

/**
 * Одновременные действия во вкладке (ADR-061, 14). Порт стал асинхронным, как над базой:
 * два вызова читают один снимок. Устаревшее решение повторяется на свежем снимке, поэтому
 * двойная отправка с одним ключом даёт одну запись, а разные записи — разные номера.
 */
const input = (clientKey: string, start: string): CreateEntryInput => ({
  day: getSnapshot().today,
  brigadeId: "brg-1",
  employeeId: null,
  objectId: "obj-m1",
  start,
  end: "7:00",
  breakMinutes: 0,
  submit: true,
  clientKey,
});

describe("одновременные действия во вкладке", () => {
  beforeEach(async () => {
    resetState();
    await gasOps.signIn("u-foreman-1");
  });

  test("двойная отправка с одним ключом: одна запись", async () => {
    const before = getSnapshot().entries.length;
    const [a, b] = await Promise.all([
      gasOps.createEntry(input("double-1", "6:00")),
      gasOps.createEntry(input("double-1", "6:00")),
    ]);
    expect(a.id).toBe(b.id);
    expect(getSnapshot().entries.length).toBe(before + 1);
  });

  test("две разные записи одновременно: обе на месте, номера разные", async () => {
    const [a, b] = await Promise.all([
      gasOps.createEntry(input("race-a", "5:00")),
      gasOps.createEntry(input("race-b", "6:00")),
    ]);
    expect(a.number).not.toBe(b.number);
    const numbers = getSnapshot().entries.map((e) => e.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
