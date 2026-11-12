import { describe, expect, test } from "bun:test";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import type { GasStore } from "@/adapters/gas-ops/store";
import { ExportRequestError, gasExportFromStore, gasExportResponse } from "@/api/gas-export";
import { GasAccessError } from "@/api/gas-ops-server";

/**
 * Выгрузка на сервере из хранилища (ADR-061, 14): тело — неделя, вид и версия; записи читает
 * сервер. Бригадир файла с суммами не получает.
 */

const store: GasStore = {
  read: async () => getServerSnapshot(),
  update: async () => {
    throw new Error("выгрузка не пишет в хранилище");
  },
};
const week = getServerSnapshot().week.from;

async function status(run: () => Promise<unknown>): Promise<number | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof GasAccessError || error instanceof ExportRequestError) return error.status;
    throw error;
  }
}

describe("выгрузка недели из хранилища", () => {
  test("менеджер получает xlsx недели с контрольной суммой", async () => {
    const result = await gasExportFromStore({
      store,
      userId: "u-manager",
      request: { kind: "approved", weekFrom: week, version: null },
    });
    // xlsx — zip: первые байты «PK»
    expect(String.fromCharCode(result.file[0]!, result.file[1]!)).toBe("PK");
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(result.fileName).toMatch(/\.xlsx$/);
    expect(result.asciiName).toMatch(/^[\x20-\x7e]+$/);
  });

  test("бригадир 403, без сессии 401, чужая неделя и нет версии 404, неверный вид 400", async () => {
    const run = (userId: string | null, request: object) => () =>
      gasExportFromStore({ store, userId, request: request as never });
    const ok = { kind: "approved", weekFrom: week, version: null };
    expect(await status(run("u-foreman-1", ok))).toBe(403);
    expect(await status(run(null, ok))).toBe(401);
    expect(await status(run("u-manager", { ...ok, weekFrom: "2020-01-06" }))).toBe(404);
    expect(await status(run("u-manager", { ...ok, version: 7 }))).toBe(404);
    expect(await status(run("u-manager", { ...ok, kind: "everything" }))).toBe(400);
  });

  test("маршрут: запрос рабочего контура без базы — 501, с базой — файл и заголовок суммы", async () => {
    const request = () =>
      new Request("http://x/api/gas/export", {
        method: "POST",
        body: JSON.stringify({ kind: "draft", weekFrom: week, version: null }),
      });
    const off = await gasExportResponse(request(), { store: null, userId: async () => null });
    expect(off.status).toBe(501);
    const on = await gasExportResponse(request(), { store, userId: async () => "u-director" });
    expect(on.status).toBe(200);
    expect(on.headers.get("x-checksum-sha256")).toMatch(/^[0-9a-f]{64}$/);
    const denied = await gasExportResponse(request(), { store, userId: async () => "u-foreman-1" });
    expect(denied.status).toBe(403);
  });

  test("с базой данные из тела не принимаются: без входа 401, бригадир 403, файл из хранилища", async () => {
    // Экран присылает неделю целиком; подставленная сумма не должна попасть в файл
    const snapshot = getServerSnapshot();
    const forged = snapshot.entries.map((e) => ({ ...e, amountRub: 999_999_999 }));
    const request = () =>
      new Request("http://x/api/gas/export", {
        method: "POST",
        body: JSON.stringify({
          kind: "approved",
          week: snapshot.week,
          data: { ...snapshot, entries: forged },
        }),
      });
    expect((await gasExportResponse(request(), { store, userId: async () => null })).status).toBe(
      401,
    );
    expect(
      (await gasExportResponse(request(), { store, userId: async () => "u-foreman-1" })).status,
    ).toBe(403);
    const on = await gasExportResponse(request(), { store, userId: async () => "u-director" });
    expect(on.status).toBe(200);
    expect(on.headers.get("x-checksum-sha256")).toMatch(/^[0-9a-f]{64}$/);
    const XLSX = await import("xlsx");
    const book = XLSX.read(new Uint8Array(await on.arrayBuffer()));
    const text = book.SheetNames.map((n) => XLSX.utils.sheet_to_csv(book.Sheets[n]!)).join("\n");
    expect(text).not.toMatch(/999\s?999\s?999/);
    // Без базы демо по-прежнему присылает данные телом
    const demo = await gasExportResponse(request(), { store: null, userId: async () => null });
    expect(demo.status).toBe(200);
    // Проверка чувствительна: без базы подставленная сумма в файле есть
    const demoBook = XLSX.read(new Uint8Array(await demo.arrayBuffer()));
    const demoText = demoBook.SheetNames.map((n) =>
      XLSX.utils.sheet_to_csv(demoBook.Sheets[n]!),
    ).join("\n");
    expect(demoText).toMatch(/999\s?999\s?999/);
  });
});
