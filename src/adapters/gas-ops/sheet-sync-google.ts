/**
 * Google Таблицы через сервисный аккаунт (ADR-063, 1.4; решение D12 по умолчанию).
 *
 * Включается переменными окружения сервера: `GAS_SHEETS_SA_JSON` — ключ сервисного аккаунта
 * (JSON из консоли Google Cloud) и `GAS_SHEET_ID` — таблица заказчика, к которой аккаунту дан
 * доступ «Редактор». Без них адаптера нет, порт отдаёт заглушку «не подключена». Ключ не
 * попадает в сборку вкладки: файл импортирует только сервер.
 *
 * Отправка: токен по JWT (RS256, Web Crypto), лист недели создаётся при первой отправке,
 * значения уходят одним `values:batchUpdate` по изменившимся диапазонам, строки-черновики
 * подсвечиваются одним `spreadsheets:batchUpdate`. Боевую таблицу проверяет владелец ключом
 * (BLOCKED до ключа): тест идёт на подменённом `fetch`.
 */
import { changedRanges, draftRowNumbers, type WeekSheet } from "@/domain/gas-ops/cloud-sheet";
import type { SheetSyncPort, SheetSyncResult } from "@/ports/sheet-sync";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export type SheetsEnv = Record<string, string | undefined>;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const b64url = (bytes: Uint8Array | string): string => {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let bin = "";
  for (const byte of raw) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function signingKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** JWT-утверждение сервисного аккаунта на час (OAuth 2.0 для серверных приложений) */
export async function serviceJwt(account: ServiceAccount, nowSeconds: number): Promise<string> {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const key = await signingKey(account.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${head}.${claims}`),
  );
  return `${head}.${claims}.${b64url(new Uint8Array(signature))}`;
}

const quote = (title: string) => `'${title.replace(/'/g, "''")}'`;

export function createGoogleSheetSync(options: {
  account: ServiceAccount;
  spreadsheetId: string;
  fetch?: Fetch;
  now?: () => Date;
}): SheetSyncPort {
  const call: Fetch = options.fetch ?? ((url, init) => fetch(url, init));
  const now = options.now ?? (() => new Date());
  const base = `${GOOGLE_SHEETS_API}/${encodeURIComponent(options.spreadsheetId)}`;
  let token: { value: string; until: number } | null = null;

  async function accessToken(): Promise<string> {
    const seconds = Math.floor(now().getTime() / 1000);
    if (token && token.until > seconds + 60) return token.value;
    const assertion = await serviceJwt(options.account, seconds);
    const response = await call(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
    if (!response.ok) throw new Error(`Google не выдал токен: ${response.status}`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, until: seconds + body.expires_in };
    return token.value;
  }

  async function api(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await call(`${base}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        "content-type": "application/json",
      },
    });
    if (!response.ok) throw new Error(`Google Таблицы ответили ${response.status}`);
    return response.json();
  }

  /** Номер листа недели; нет листа — создаём */
  async function sheetIdOf(title: string): Promise<number> {
    const meta = (await api("?fields=sheets.properties(sheetId,title)")) as {
      sheets?: { properties: { sheetId: number; title: string } }[];
    };
    const found = meta.sheets?.find((s) => s.properties.title === title);
    if (found) return found.properties.sheetId;
    const added = (await api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
    })) as { replies: { addSheet: { properties: { sheetId: number } } }[] };
    return added.replies[0]!.addSheet.properties.sheetId;
  }

  return {
    connected: true,
    provider: "google",
    async push({ sheet, prev }): Promise<SheetSyncResult> {
      try {
        const updates = changedRanges(prev, sheet);
        const url = `https://docs.google.com/spreadsheets/d/${options.spreadsheetId}`;
        const syncedAt = now().toISOString();
        if (updates.length === 0) return { ok: true, url, syncedAt, ranges: 0 };
        const sheetId = await sheetIdOf(sheet.title);
        await api("/values:batchUpdate", {
          method: "POST",
          body: JSON.stringify({
            valueInputOption: "RAW",
            data: updates.map((u) => ({
              range: `${quote(sheet.title)}!${u.range}`,
              values: u.values,
            })),
          }),
        });
        await api(":batchUpdate", {
          method: "POST",
          body: JSON.stringify({ requests: highlightRequests(sheetId, sheet) }),
        });
        return { ok: true, url, syncedAt, ranges: updates.length };
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : "Google Таблицы недоступны",
        };
      }
    },
  };
}

/** Подсветка: все строки данных без заливки, черновики янтарным */
export function highlightRequests(sheetId: number, sheet: WeekSheet): unknown[] {
  const plain = {
    repeatCell: {
      range: { sheetId, startRowIndex: 2, endRowIndex: 2 + sheet.rows.length },
      cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } } },
      fields: "userEnteredFormat.backgroundColor",
    },
  };
  const drafts = draftRowNumbers(sheet).map((row) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: row - 1, endRowIndex: row },
      cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.95, blue: 0.8 } } },
      fields: "userEnteredFormat.backgroundColor",
    },
  }));
  return [plain, ...drafts];
}

/** Адаптер из окружения сервера; без переменных — null, и порт остаётся заглушкой */
export function googleSheetSyncFromEnv(env: SheetsEnv, fetcher?: Fetch): SheetSyncPort | null {
  const json = env["GAS_SHEETS_SA_JSON"];
  const spreadsheetId = env["GAS_SHEET_ID"];
  if (!json || !spreadsheetId) return null;
  const account = JSON.parse(json) as ServiceAccount;
  if (!account.client_email || !account.private_key) return null;
  return createGoogleSheetSync({
    account,
    spreadsheetId,
    ...(fetcher ? { fetch: fetcher } : {}),
  });
}
