import { beforeEach, describe, expect, test } from "bun:test";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { resetState } from "@/adapters/gas-ops/state";
import { GasOpsError } from "@/ports/gas-ops";

/**
 * Отмена решения проверки (ADR-044, F5): тост «Подтверждено. Отменить» возвращает запись
 * в прежний статус и с прежней суммой, решение уходит из истории, отмена пишется в журнал.
 */
const port = createGasOpsDemo();

beforeEach(async () => {
  resetState();
  await port.signIn("u-manager");
});

async function firstPending() {
  const snapshot = await port.snapshot();
  return snapshot.entries.find((e) => e.status === "pending")!;
}

/** Код ошибки правил: адаптер бросает сразу, сервер вернёт отказ — ловим оба случая */
async function errorCode(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof GasOpsError ? error.code : "unknown";
  }
}

describe("отмена решения проверки", () => {
  test("подтверждение отменяется: статус, сумма и история как до решения", async () => {
    const before = await firstPending();
    const reviewsBefore = (await port.snapshot()).reviews.length;

    const confirmed = await port.review({ id: before.id, action: "confirm" });
    expect(confirmed.status).toBe("confirmed");
    expect((await port.snapshot()).reviews.length).toBe(reviewsBefore + 1);

    const restored = await port.undoReview(before.id);
    expect(restored.status).toBe("pending");
    expect(restored.amountRub).toBe(before.amountRub);
    expect(restored.reviewedBy).toBeNull();
    expect(restored.comment).toBe(before.comment);

    const after = await port.snapshot();
    expect(after.reviews.length).toBe(reviewsBefore);
    expect(after.audit[0]?.action).toBe("entry.undo");
    expect(after.audit[0]?.entityId).toBe(before.id);
  });

  test("сумма из стоимости объекта приходит с подтверждением и уходит с отменой", async () => {
    const snapshot = await port.snapshot();
    const entry = snapshot.entries.find((e) => e.status === "pending" && e.amountRub === null)!;
    expect(entry).toBeDefined();
    await port.setEstimate({ objectId: entry.objectId, amountRub: 12_000 });

    const confirmed = await port.review({ id: entry.id, action: "confirm" });
    expect(confirmed.amountRub).toBe(12_000);
    const restored = await port.undoReview(entry.id);
    expect(restored.amountRub).toBeNull();
    expect(restored.status).toBe("pending");
  });

  test("отклонение отменяется вместе с причиной", async () => {
    const before = await firstPending();
    await port.review({ id: before.id, action: "reject", comment: "Дубль записи" });
    const restored = await port.undoReview(before.id);
    expect(restored.status).toBe("pending");
    expect(restored.comment).toBe(before.comment);
  });

  test("второй раз отменять нечего, исправление времени не отменяется", async () => {
    const before = await firstPending();
    await port.review({ id: before.id, action: "confirm" });
    await port.undoReview(before.id);
    expect(await errorCode(() => port.undoReview(before.id))).toBe("nothing-to-undo");

    const snapshot = await port.snapshot();
    const timed = snapshot.entries.find(
      (e) => e.status === "pending" && e.startMinutes !== null && e.endMinutes !== null,
    )!;
    await port.updateEntry({ id: timed.id, breakMinutes: 0, comment: "Перерыв не учтён" });
    expect(await errorCode(() => port.undoReview(timed.id))).toBe("nothing-to-undo");
  });

  test("бригадир не отменяет решения", async () => {
    const before = await firstPending();
    await port.review({ id: before.id, action: "confirm" });
    await port.signIn("u-foreman-1");
    expect(await errorCode(() => port.undoReview(before.id))).toBe("not-allowed");
  });
});
