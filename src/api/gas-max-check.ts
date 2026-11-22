/**
 * Проверка канала MAX из «Подключений» (ADR-087): POST `/api/gas/max-check`
 * с `{ action: "check" }` или `{ action: "test" }`.
 *
 * Только администратор (права проверяет сервер, ADR-012). Без `MAX_BOT_TOKEN` в MAX не ходит
 * ничего: ответ говорит, что канал не подключён и бригадир работает в мобильной веб-форме
 * по ссылке входа. С токеном: «check» читает `GET /me` и `GET /subscriptions`, ничего
 * не меняя; «test» отправляет короткое сообщение только самому администратору в его
 * привязанный аккаунт MAX через порт отправки. Значение токена в ответ не попадает.
 */
import {
  MAX_TEST_TEXT,
  MAX_WEBHOOK_PATH,
  checkMaxChannel,
  createMaxMessenger,
  type MaxCheckLine,
  type MaxEnv,
} from "@/adapters/gas-ops/max/channel";
import type { GasStore } from "@/adapters/gas-ops/store";
import type { MaxLink } from "@/domain/gas-ops/max-link";

/** Что делает бригадир, пока бота нет: это не ошибка, а рабочий путь */
export const MAX_FALLBACK_TEXT =
  "Канал MAX не подключён. Бригадир отправляет время в мобильной веб-форме по своей ссылке входа.";

export type MaxCheckAction = "check" | "test";

export type MaxCheckAnswer =
  | { configured: false; text: string }
  | { configured: true; action: "check"; lines: MaxCheckLine[] }
  | { configured: true; action: "test"; ok: boolean; text: string };

export interface MaxCheckDeps {
  env: MaxEnv;
  store: GasStore | null;
  userId: string | null;
  /** Привязки аккаунтов MAX (`gas_max_links`); null — базы нет */
  links: (() => Promise<MaxLink[]>) | null;
  fetch?: typeof fetch;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** Внешний адрес сервиса: за Caddy протокол приходит в `x-forwarded-proto`, домен в Host */
export function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return `${proto || url.protocol.replace(":", "")}://${host || url.host}`;
}

export async function maxCheckResponse(request: Request, deps: MaxCheckDeps): Promise<Response> {
  if (!deps.store) return json(501, { reason: "Рабочая база не подключена" });
  if (!deps.userId) return json(401, { reason: "Войдите, чтобы продолжить" });
  const user = (await deps.store.read()).users.find((u) => u.id === deps.userId);
  if (!user || user.role !== "admin") {
    return json(403, { reason: "Канал проверяет администратор" });
  }
  let action: unknown;
  try {
    action = ((await request.json()) as { action?: unknown } | null)?.action;
  } catch {
    action = null;
  }
  if (action !== "check" && action !== "test") {
    return json(400, { reason: "Нужно действие check или test" });
  }
  const token = deps.env["MAX_BOT_TOKEN"]?.trim() ?? "";
  if (!token)
    return json(200, { configured: false, text: MAX_FALLBACK_TEXT } satisfies MaxCheckAnswer);

  if (action === "check") {
    const lines = await checkMaxChannel({
      env: deps.env,
      webhookUrl: `${publicOrigin(request)}${MAX_WEBHOOK_PATH}`,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    });
    return json(200, { configured: true, action, lines } satisfies MaxCheckAnswer);
  }

  if (!deps.links) {
    return json(200, {
      configured: true,
      action,
      ok: false,
      text: "Нет базы: привязки к MAX негде хранить",
    } satisfies MaxCheckAnswer);
  }
  const links = deps.links;
  const messenger = createMaxMessenger({
    env: deps.env,
    channelUserOf: async (id) =>
      (await links()).find((l) => l.userId === id && l.maxUserId && !l.maxUserId.startsWith("tg:"))
        ?.maxUserId ?? null,
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });
  const sent = await messenger.send({
    key: `max-test|${user.id}|${Date.now()}`,
    toUserId: user.id,
    text: MAX_TEST_TEXT,
    buttons: [],
  });
  return json(200, {
    configured: true,
    action,
    ok: sent.ok,
    text: sent.ok
      ? "Сообщение ушло в ваш MAX. Если его нет, проверьте, что бот не заблокирован"
      : sent.reason === "Сотрудник не привязан к MAX."
        ? "Ваш аккаунт MAX не привязан. Откройте бота по ссылке приглашения из «Сотрудников»"
        : sent.reason,
  } satisfies MaxCheckAnswer);
}

/** Вход маршрута: окружение, база и сессия сервера */
export async function maxCheckRequest(request: Request): Promise<Response> {
  const [{ gasServerStore, gasServerDriver, appTimeZone }, { sessionActorId }] = await Promise.all([
    import("./gas-server-store"),
    import("./session"),
  ]);
  const [store, db] = await Promise.all([gasServerStore(), gasServerDriver()]);
  let links: MaxCheckDeps["links"] = null;
  if (db) {
    const { createMessengerDb } = await import("@/adapters/gas-ops/messenger-db");
    const state = createMessengerDb(db, { timeZone: appTimeZone() });
    links = () => state.links();
  }
  return maxCheckResponse(request, {
    env: process.env,
    store,
    userId: await sessionActorId(),
    links,
  });
}
