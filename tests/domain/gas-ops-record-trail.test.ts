import { describe, expect, test } from "bun:test";
import { trailOf } from "@/domain/gas-ops/record-trail";

const states = (status: Parameters<typeof trailOf>[0], remarks = 0) =>
  trailOf(status, remarks).map((step) => `${step.label}:${step.state}`);

describe("путь записи (ADR-068)", () => {
  test("новая без замечаний: внесено и проверено, решения ещё нет", () => {
    expect(states("pending")).toEqual([
      "Внесено:done",
      "Проверено:done",
      "Подтверждено:todo",
      "В отчёте:todo",
    ]);
  });

  test("с замечанием проверка жёлтая, в отчёт не попала", () => {
    expect(states("pending", 2)[1]).toBe("Проверено:warn");
    expect(states("pending", 2)[3]).toBe("В отчёте:todo");
  });

  test("подтверждённая в отчёте", () => {
    expect(states("confirmed", 1).slice(2)).toEqual(["Подтверждено:done", "В отчёте:done"]);
  });

  test("отклонённая и на уточнении называются своим словом", () => {
    expect(states("rejected")[2]).toBe("Отклонено:fail");
    expect(states("clarify")[2]).toBe("На уточнении:warn");
  });

  test("черновик ещё не внесён", () => {
    expect(states("draft").every((step) => step.endsWith(":todo"))).toBe(true);
  });
});
