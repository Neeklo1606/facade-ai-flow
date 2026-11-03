import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { gasCreateEntryInput, gasMethodArgs, gasTimeEntry } from "@/contracts/gas-api";
import { GAS_OPS_METHODS } from "@/ports/gas-ops";
import { OPENAPI_FILE, gasOpenApi, schemaOf } from "../../scripts/gas-openapi";

/**
 * Контракты API учёта времени (ADR-061, 14): OpenAPI в репозитории равен выводу генератора,
 * схемы входов — те же, что проверяет серверная функция.
 */
describe("OpenAPI учёта времени", () => {
  test("docs/api/openapi.yaml равен выводу генератора из контрактов", () => {
    expect(readFileSync(OPENAPI_FILE, "utf8")).toBe(gasOpenApi());
  });

  test("в документе пути черновика HANDOFF v1.1 и ошибки 400–501", () => {
    const doc = gasOpenApi();
    for (const path of [
      "/api/v1/me:",
      "/api/v1/time-entries:",
      "/api/v1/time-entries/{id}/review:",
      "/api/v1/reviews/queue:",
      "/api/v1/estimates/{id}/approve:",
      "/api/v1/weeks/{id}/close:",
      "/api/v1/weeks/{id}/exports:",
      "/api/v1/audit:",
      "/api/max/webhook:",
    ]) {
      expect(doc).toContain(`\n  ${path}\n`);
    }
    for (const code of [400, 401, 403, 404, 409, 422, 501]) expect(doc).toContain(`E${code}:`);
  });

  test("схемы входов действий есть только у методов порта", () => {
    for (const method of Object.keys(gasMethodArgs)) {
      expect(GAS_OPS_METHODS as readonly string[]).toContain(method);
    }
  });

  test("запись в ответе несёт признаки и версию; вход записи строгий", () => {
    const entry = schemaOf(gasTimeEntry) as { required: string[] };
    expect(entry.required).toContain("flags");
    expect(entry.required).toContain("version");
    expect(
      gasCreateEntryInput.safeParse({
        day: "2026-10-03",
        brigadeId: "brg-1",
        employeeId: null,
        objectId: "obj-m1",
        start: "8:00",
        end: "17:00",
        breakMinutes: 60,
        submit: true,
        amountRub: 1000,
      }).success,
    ).toBe(false);
  });
});
