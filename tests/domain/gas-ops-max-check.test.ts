import { describe, expect, test } from "bun:test";
import { MAX_TEST_TEXT, checkMaxChannel, isMaxSecret } from "@/adapters/gas-ops/max/channel";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import type { GasStore } from "@/adapters/gas-ops/store";
import { MAX_FALLBACK_TEXT, maxCheckResponse, publicOrigin } from "@/api/gas-max-check";
import { connectionRows, connectionsOf } from "@/domain/gas-ops/connections";
import { createInvite, type MaxLink } from "@/domain/gas-ops/max-link";

/**
 * Проверка канала MAX из «Подключений» (ADR-087): без токена в MAX не ходит ничего
 * и бригадир работает веб-формой; с токеном — вебхук и тестовое сообщение через порт
 * с заглушкой сети. Токен в ответ не попадает.
 */
const TOKEN = "tok-SECRET-1";
const HOOK = "https://gaika.example.ru/api/max/webhook";
const ENV = { MAX_BOT_TOKEN: TOKEN, MAX_WEBHOOK_SECRET: "hook-secret-1" };

type Call = { url: string; method: string; auth: string | null; body: unknown };

/** Заглушка MAX: ответы по пути, все вызовы записываются */
function fakeMax(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const http = (async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method: init.method ?? "GET",
      auth: headers["Authorization"] ?? null,
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    const path = new URL(url).pathname;
    const route = routes[path] ?? { status: 404, body: {} };
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  }) as unknown as typeof fetch;
  return { http, calls };
}

const OK_ROUTES = {
  "/me": { body: { user_id: 1, username: "id0000000000_bot", is_bot: true } },
  "/subscriptions": { body: { subscriptions: [{ url: HOOK, time: 1, update_types: null }] } },
  "/messages": { body: { message: { body: { mid: "mid-9" } } } },
};

function memoryStore(): GasStore {
  const state = structuredClone(getServerSnapshot());
  return {
    read: async () => state,
    update: async () => {
      throw new Error("проверка канала не пишет в учёт");
    },
  } as unknown as GasStore;
}

const linked = (userId: string, maxUserId: string): MaxLink => ({
  ...createInvite({
    id: `ml-${userId}`,
    userId,
    createdBy: "u-admin",
    now: "2026-11-23T09:00:00",
    code: "ABCD2345",
  }),
  maxUserId,
  linkedAt: "2026-11-23T09:00:00",
});

const post = (action: string) =>
  new Request("http://app:3000/api/gas/max-check", {
    method: "POST",
    headers: { "x-forwarded-proto": "https", host: "gaika.example.ru" },
    body: JSON.stringify({ action }),
  });

describe("проверка канала MAX: адаптер", () => {
  test("без токена в MAX не ходит ничего", async () => {
    const { http, calls } = fakeMax(OK_ROUTES);
    expect(await checkMaxChannel({ env: {}, webhookUrl: HOOK, fetch: http })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  test("токен принят, подписка на адрес сервиса, секрет годится", async () => {
    const { http, calls } = fakeMax(OK_ROUTES);
    const lines = await checkMaxChannel({ env: ENV, webhookUrl: HOOK, fetch: http });
    expect(lines.map((l) => [l.name, l.ok])).toEqual([
      ["Токен бота", true],
      ["Вебхук", true],
      ["Секрет вебхука", true],
    ]);
    expect(lines[0]!.text).toContain("@id0000000000_bot");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET https://platform-api2.max.ru/me",
      "GET https://platform-api2.max.ru/subscriptions",
    ]);
    expect(calls.every((c) => c.auth === TOKEN)).toBe(true);
    expect(JSON.stringify(lines)).not.toContain(TOKEN);
  });

  test("неверный токен: одна строка 401, подписки не запрашиваются", async () => {
    const { http, calls } = fakeMax({ "/me": { status: 401, body: { code: "verify.token" } } });
    const lines = await checkMaxChannel({ env: ENV, webhookUrl: HOOK, fetch: http });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: "Токен бота", ok: false });
    expect(lines[0]!.text).toContain("401");
    expect(calls).toHaveLength(1);
  });

  test("подписки нет или она на другой адрес: вебхук не годится и назван нужный адрес", async () => {
    const none = fakeMax({ ...OK_ROUTES, "/subscriptions": { body: { subscriptions: [] } } });
    const a = await checkMaxChannel({ env: ENV, webhookUrl: HOOK, fetch: none.http });
    expect(a[1]).toMatchObject({ name: "Вебхук", ok: false });
    expect(a[1]!.text).toContain(HOOK);
    const other = fakeMax({
      ...OK_ROUTES,
      "/subscriptions": { body: { subscriptions: [{ url: "https://old.example.ru/hook" }] } },
    });
    const b = await checkMaxChannel({ env: ENV, webhookUrl: HOOK, fetch: other.http });
    expect(b[1]!.ok).toBe(false);
    expect(b[1]!.text).toContain("https://old.example.ru/hook");
  });

  test("секрет по правилам MAX: 5-256 символов, латиница, цифры, дефис", () => {
    expect(isMaxSecret("hook-secret-1")).toBe(true);
    expect(isMaxSecret("abcd")).toBe(false);
    expect(isMaxSecret("секрет-12345")).toBe(false);
    expect(isMaxSecret("has_underscore")).toBe(false);
    expect(isMaxSecret("a".repeat(257))).toBe(false);
  });

  test("нет связи с MAX — так и сказано, без исключения", async () => {
    const down = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const lines = await checkMaxChannel({ env: ENV, webhookUrl: HOOK, fetch: down });
    expect(lines[0]).toMatchObject({ ok: false });
    expect(lines[0]!.text).toContain("не ответил");
  });
});

describe("проверка канала MAX: маршрут /api/gas/max-check", () => {
  const deps = (over: Partial<Parameters<typeof maxCheckResponse>[1]> = {}) => {
    const max = fakeMax(OK_ROUTES);
    return {
      max,
      deps: {
        env: ENV,
        store: memoryStore(),
        userId: "u-admin",
        links: async () => [linked("u-admin", "555")],
        fetch: max.http,
        ...over,
      },
    };
  };

  test("права на сервере: без базы 501, без входа 401, не администратор 403", async () => {
    expect((await maxCheckResponse(post("check"), deps({ store: null }).deps)).status).toBe(501);
    expect((await maxCheckResponse(post("check"), deps({ userId: null }).deps)).status).toBe(401);
    for (const userId of ["u-foreman-1", "u-director", "u-manager"]) {
      const { deps: d, max } = deps({ userId });
      expect((await maxCheckResponse(post("test"), d)).status).toBe(403);
      expect(max.calls).toHaveLength(0);
    }
  });

  test("неизвестное действие — 400", async () => {
    expect((await maxCheckResponse(post("subscribe"), deps().deps)).status).toBe(400);
  });

  test("без токена: «не подключён», бригадир работает веб-формой, в MAX ни одного запроса", async () => {
    const { deps: d, max } = deps({ env: {} });
    for (const action of ["check", "test"]) {
      const res = await maxCheckResponse(post(action), d);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ configured: false, text: MAX_FALLBACK_TEXT });
    }
    expect(MAX_FALLBACK_TEXT).toContain("веб-форме");
    expect(max.calls).toHaveLength(0);
  });

  test("check сверяет подписку с внешним адресом сервиса за прокси", async () => {
    const { deps: d } = deps();
    const body = await (await maxCheckResponse(post("check"), d)).json();
    expect(body.configured).toBe(true);
    expect(body.lines[1]).toMatchObject({ name: "Вебхук", ok: true });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  test("test: сообщение только нажавшему администратору в его аккаунт MAX", async () => {
    const { deps: d, max } = deps({
      links: async () => [linked("u-foreman-1", "111"), linked("u-admin", "555")],
    });
    const body = await (await maxCheckResponse(post("test"), d)).json();
    expect(body).toMatchObject({ configured: true, action: "test", ok: true });
    expect(max.calls).toHaveLength(1);
    expect(max.calls[0]!.url).toBe("https://platform-api2.max.ru/messages?user_id=555");
    expect(max.calls[0]!.body).toEqual({ text: MAX_TEST_TEXT });
  });

  test("test без привязки или без базы: не отправлено, сказано почему", async () => {
    const unlinked = deps({ links: async () => [linked("u-foreman-1", "111")] });
    const a = await (await maxCheckResponse(post("test"), unlinked.deps)).json();
    expect(a).toMatchObject({ ok: false });
    expect(a.text).toContain("не привязан");
    expect(unlinked.max.calls).toHaveLength(0);
    const noDb = deps({ links: null });
    const b = await (await maxCheckResponse(post("test"), noDb.deps)).json();
    expect(b).toMatchObject({ ok: false });
    expect(noDb.max.calls).toHaveLength(0);
  });

  test("Telegram-аккаунт администратора не считается аккаунтом MAX", async () => {
    const { deps: d, max } = deps({ links: async () => [linked("u-admin", "tg:42")] });
    const body = await (await maxCheckResponse(post("test"), d)).json();
    expect(body.ok).toBe(false);
    expect(max.calls).toHaveLength(0);
  });

  test("внешний адрес: протокол из x-forwarded-proto, домен из Host", () => {
    expect(publicOrigin(post("check"))).toBe("https://gaika.example.ru");
    expect(publicOrigin(new Request("http://localhost:4644/x"))).toBe("http://localhost:4644");
  });
});

describe("строка MAX в «Подключениях»", () => {
  const none = { available: false, model: null };
  test("без токена: не подключён, бригадир работает веб-формой по ссылке", () => {
    const row = connectionRows(connectionsOf({}, none, "disk:/С")).find((r) => r.key === "max")!;
    expect(row).toMatchObject({ state: "не подключён", on: false });
    expect(row.detail).toContain("веб-форме");
    expect(row.detail).toContain("MAX_BOT_TOKEN");
  });

  test("токен, секрет и база: настроен, проверка кнопками", () => {
    const row = connectionRows(
      connectionsOf({ ...ENV, DATABASE_URL: "postgres://x" }, none, "disk:/С"),
    ).find((r) => r.key === "max")!;
    expect(row).toMatchObject({ state: "настроен", on: true });
    expect(row.detail).toContain("кнопки");
  });
});
