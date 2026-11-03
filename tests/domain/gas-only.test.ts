import { afterEach, describe, expect, test } from "bun:test";
import { GAS_ONLY_KEY, gasOnlyEnabled } from "@/lib/gas-ops/gas-only";
import { FROZEN_SCREENS, rolesShown, screensFor } from "@/lib/gas-ops/screens";

/**
 * Флаг газового контура (ADR-061, T0): снабжение, ПТО и общий лендинг уходят из навигации,
 * код остаётся. По умолчанию флаг включён, ключ сессии "0" возвращает модули.
 */
const globals = globalThis as { window?: unknown };

function withSession(value: string | null) {
  globals.window = {
    sessionStorage: { getItem: (key: string) => (key === GAS_ONLY_KEY ? value : null) },
  };
}

afterEach(() => {
  delete globals.window;
});

describe("флаг газового контура", () => {
  test("включён по умолчанию", () => {
    expect(gasOnlyEnabled()).toBe(true);
    withSession(null);
    expect(gasOnlyEnabled()).toBe(true);
  });

  test("в выборе роли нет прораба, снабженца и ПТО", () => {
    expect(rolesShown()).toEqual(["foreman", "manager", "director", "admin"]);
  });

  test("ни одна роль не видит экранов снабжения и ПТО", () => {
    for (const role of ["admin", "director", "supply", "pto", "prorab"] as const) {
      const keys = screensFor(role).map((s) => s.key);
      for (const frozen of FROZEN_SCREENS) expect(keys).not.toContain(frozen);
    }
  });

  test("учёт времени на месте", () => {
    const keys = screensFor("manager").map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(["moderation", "entries", "reports", "week"]));
  });

  test('ключ сессии "0" возвращает модули', () => {
    withSession("0");
    expect(gasOnlyEnabled()).toBe(false);
    expect(rolesShown()).toContain("supply");
    expect(screensFor("admin").map((s) => s.key)).toEqual(
      expect.arrayContaining(["supply", "docs"]),
    );
  });
});
