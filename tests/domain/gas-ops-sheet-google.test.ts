import { describe, expect, test } from "bun:test";
import {
  GOOGLE_TOKEN_URL,
  createGoogleSheetSync,
  googleSheetSyncFromEnv,
  serviceJwt,
} from "@/adapters/gas-ops/sheet-sync-google";
import { sheetSyncDemo, sheetSyncYandex } from "@/adapters/gas-ops/sheet-sync-demo";
import type { WeekSheet } from "@/domain/gas-ops/cloud-sheet";

/**
 * Адаптер Google Таблиц (ADR-063, 1.4) на подменённом `fetch`: ключ сервисного аккаунта
 * генерируется в тесте, настоящего ключа и сети нет. Боевую таблицу проверяет владелец.
 */

async function account() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let bin = "";
  for (const byte of der) bin += String.fromCharCode(byte);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin)}\n-----END PRIVATE KEY-----\n`;
  return {
    sa: { client_email: "gaika@test.iam.gserviceaccount.com", private_key: pem },
    publicKey: pair.publicKey,
  };
}

const sheet = (rows: { key: string; values: (string | number | null)[]; draft: boolean }[]) =>
  ({
    title: "Неделя 28.09–03.10.2026",
    header: [
      ["ФАКТИЧЕСКИЙ ОТЧЁТ", "28.09.2026"],
      ["Бригада и адрес", "Сумма начислений"],
    ],
    rows,
    width: 2,
  }) satisfies WeekSheet;

function fakeGoogle() {
  const calls: { url: string; body: string | null }[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: typeof init?.body === "string" ? init.body : null });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (url === GOOGLE_TOKEN_URL) return json({ access_token: "tok", expires_in: 3600 });
    if (url.includes("?fields=")) return json({ sheets: [] });
    if (
      url.endsWith(":batchUpdate") &&
      calls.filter((c) => c.url.endsWith(":batchUpdate")).length === 1
    )
      return json({ replies: [{ addSheet: { properties: { sheetId: 7 } } }] });
    return json({});
  };
  return { calls, fetcher };
}

describe("Google Таблицы", () => {
  test("JWT сервисного аккаунта подписан RS256 и проверяется открытым ключом", async () => {
    const { sa, publicKey } = await account();
    const jwt = await serviceJwt(sa, 1_700_000_000);
    const [head, claims, signature] = jwt.split(".");
    const decode = (part: string) =>
      JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    expect(decode(head!)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims!)).toMatchObject({
      iss: sa.client_email,
      aud: GOOGLE_TOKEN_URL,
      exp: 1_700_003_600,
    });
    const sig = Uint8Array.from(atob(signature!.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      sig,
      new TextEncoder().encode(`${head}.${claims}`),
    );
    expect(ok).toBe(true);
  });

  test("первая отправка: токен, лист недели, значения одним пакетом, черновик подсвечен", async () => {
    const { sa } = await account();
    const google = fakeGoogle();
    const port = createGoogleSheetSync({
      account: sa,
      spreadsheetId: "sheet-1",
      fetch: google.fetcher,
      now: () => new Date("2026-10-03T12:40:00Z"),
    });
    const next = sheet([
      { key: "a", values: ["Бригада 1", 100], draft: false },
      { key: "b", values: ["  ул. Демо, 1", 50], draft: true },
    ]);
    const result = await port.push({ sheet: next, prev: null });
    expect(result).toEqual({
      ok: true,
      url: "https://docs.google.com/spreadsheets/d/sheet-1",
      syncedAt: "2026-10-03T12:40:00.000Z",
      ranges: 1,
    });
    const values = google.calls.find((c) => c.url.endsWith("/values:batchUpdate"))!;
    const body = JSON.parse(values.body!) as { data: { range: string; values: unknown[][] }[] };
    expect(body.data[0]!.range).toBe("'Неделя 28.09–03.10.2026'!A1:B4");
    expect(body.data[0]!.values).toHaveLength(4);
    const format = JSON.parse(google.calls.at(-1)!.body!) as {
      requests: { repeatCell: { range: { startRowIndex: number } } }[];
    };
    // Строка «b» — четвёртая в листе (две строки шапки): индекс 3
    expect(format.requests.map((r) => r.repeatCell.range.startRowIndex)).toEqual([2, 3]);
  });

  test("повтор того же листа ничего не отправляет", async () => {
    const { sa } = await account();
    const google = fakeGoogle();
    const port = createGoogleSheetSync({ account: sa, spreadsheetId: "s", fetch: google.fetcher });
    const same = sheet([{ key: "a", values: ["Бригада 1", 100], draft: false }]);
    const result = await port.push({ sheet: same, prev: same });
    expect(result.ok && result.ranges).toBe(0);
    expect(google.calls).toEqual([]);
  });

  test("ошибка Google — отказ с причиной, а не исключение", async () => {
    const { sa } = await account();
    const port = createGoogleSheetSync({
      account: sa,
      spreadsheetId: "s",
      fetch: async () => new Response("no", { status: 403 }),
    });
    const result = await port.push({ sheet: sheet([]), prev: null });
    expect(result).toEqual({ ok: false, reason: "Google не выдал токен: 403" });
  });

  test("без переменных окружения адаптера нет; заглушка и Яндекс говорят «не подключена»", async () => {
    expect(googleSheetSyncFromEnv({})).toBeNull();
    expect(googleSheetSyncFromEnv({ GAS_SHEET_ID: "x" })).toBeNull();
    const { sa } = await account();
    const port = googleSheetSyncFromEnv({
      GAS_SHEETS_SA_JSON: JSON.stringify(sa),
      GAS_SHEET_ID: "x",
    });
    expect(port?.connected).toBe(true);
    expect(sheetSyncDemo.connected).toBe(false);
    const demo = await sheetSyncDemo.push({ sheet: sheet([]), prev: null });
    expect(!demo.ok && demo.reason).toContain("не подключена");
    const yandex = await sheetSyncYandex.push({ sheet: sheet([]), prev: null });
    expect(!yandex.ok && yandex.reason).toContain("не реализован");
  });
});
