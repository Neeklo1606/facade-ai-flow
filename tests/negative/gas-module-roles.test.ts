import { beforeEach, describe, expect, test } from "bun:test";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { getSnapshot, resetState } from "@/adapters/gas-ops/state";
import { GasOpsError } from "@/ports/gas-ops";

/**
 * Роли модулей снабжения и ИД не получают учёт времени через порт (инвариант 1.4, 5; S8).
 * Правила S4 перечисляли запреты, и прораб, снабженец и ПТО проходили их: могли подтвердить
 * запись с суммой, загрузить смету, поменять состав. Теперь у действий список разрешённых ролей
 */
const ops = createGasOpsDemo();

async function code(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof GasOpsError ? error.code : "unknown";
  }
}

describe("роли модулей 2 и 3 в учёте времени", () => {
  beforeEach(() => {
    resetState();
  });

  for (const userId of ["u-prorab", "u-supply", "u-pto"]) {
    test(`${userId}: ни записи, ни проверки, ни сумм, ни смет`, async () => {
      const pending = getSnapshot().entries.find((e) => e.status === "pending")!;
      await ops.signIn(userId);
      expect(await code(() => ops.review({ id: pending.id, action: "confirm" }))).toBe(
        "not-allowed",
      );
      expect(await code(() => ops.undoReview(pending.id))).toBe("not-allowed");
      expect(
        await code(() =>
          ops.createEntry({
            day: pending.day,
            brigadeId: pending.brigadeId,
            employeeId: null,
            objectId: pending.objectId,
            start: "09:00",
            end: "10:00",
            breakMinutes: 0,
            submit: true,
          }),
        ),
      ).toBe("not-allowed");
      expect(await code(() => ops.submitEntry(pending.id))).toBe("not-allowed");
      expect(
        await code(() =>
          ops.setEstimate({ objectId: pending.objectId, amountRub: 1000, note: "x" }),
        ),
      ).toBe("not-allowed");
      // Запись не изменилась
      expect(getSnapshot().entries.find((e) => e.id === pending.id)!.status).toBe("pending");
    });
  }

  test("менеджер по-прежнему проверяет запись", async () => {
    const pending = getSnapshot().entries.find((e) => e.status === "pending")!;
    await ops.signIn("u-manager");
    expect(await code(() => ops.review({ id: pending.id, action: "confirm" }))).toBeNull();
  });
});
