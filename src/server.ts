import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { rememberEnv } from "./lib/runtime-env";
import {
  sessionFromCookieHeader,
  sessionSetCookie,
  signSession,
  verifySession,
} from "./lib/session-token";
import { DEFAULT_USER_ID } from "./api/config";
import {
  accessKey,
  accessParam,
  grantResponse,
  hasAccess,
  isPreviewCrawler,
  isPublicPath,
  isRemovedInProduction,
  renderAccessPage,
} from "./lib/access";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/** Ответы страниц не индексируются: демонстрация живёт по ссылке, а не в поиске (TASK-A5, п. 2) */
function withNoIndex(response: Response) {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Рабочий контур: документ страницы без сессии выдаёт сессию сотрудника по умолчанию
 * (ADR-012, уточнение п. 4) — иначе первые запросы данных новой вкладки получали 403.
 * Серверные функции и выгрузки сессию не выдают: прямой вызов без неё — 403.
 */
async function withDefaultSession(request: Request, response: Response) {
  if (import.meta.env.VITE_DATA_SOURCE !== "server") return response;
  if (request.method !== "GET") return response;
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;
  const current = sessionFromCookieHeader(request.headers.get("cookie"));
  if (await verifySession(current)) return response;
  const headers = new Headers(response.headers);
  const secure = new URL(request.url).protocol === "https:";
  headers.append("set-cookie", sessionSetCookie(await signSession(DEFAULT_USER_ID), secure));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Шлюз доступа. Ключ берётся из окружения хостинга; статика, robots и иконки проходят всегда,
 * краулерам мессенджеров отдаётся страница-объяснение с превью — ссылка выглядит прилично,
 * а содержимое остаётся закрытым.
 */
function accessGate(request: Request, env: unknown): Response | null {
  const key = accessKey((env ?? {}) as Record<string, string | undefined>);
  if (!key) return null;

  const url = new URL(request.url);
  if (isPublicPath(url.pathname)) return null;
  if (accessParam(url) === key) return grantResponse(url, key);
  if (hasAccess(request, key)) return null;

  return new Response(renderAccessPage(url.origin), {
    status: isPreviewCrawler(request.headers.get("user-agent")) ? 200 : 401,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Секреты хостинга для серверных функций: ключ подписи сессии (ADR-012)
      rememberEnv(env);
      const gate = accessGate(request, env);
      if (gate) return gate;
      // Витрина дизайн-системы в production не существует. Путь подменяется несуществующим
      // до рендера: маршрут не резолвится, а ответ — тот же 404-экран приложения, что и у любого
      // другого несуществующего адреса (находки ревью BLOCKER-2 и повторного ревью LOW)
      let incoming = request;
      const url = new URL(request.url);
      if (isRemovedInProduction(url.pathname)) {
        url.pathname = "/__removed";
        incoming = new Request(url, request);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(incoming, env, ctx);
      return withDefaultSession(
        incoming,
        withNoIndex(await normalizeCatastrophicSsrResponse(response)),
      );
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
