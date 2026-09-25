import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { DEFAULT_USER_ID } from "@/api/config";
import {
  PERSONA_PREFIX,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  SESSION_PREFIX,
  signSession,
  verifySession,
} from "@/lib/session-token";
import { authAvailable, sessionEmployee } from "./auth-store";

/**
 * Сессия сотрудника в серверной функции (ADR-012, п. 4): кто действует, серверные функции
 * узнают только отсюда. Подделанная или чужая подпись — сессии нет.
 */
export async function sessionActorId(): Promise<string | null> {
  const verified = await verifySession(getCookie(SESSION_COOKIE));
  const withAuth = authAvailable();
  if (verified?.startsWith(SESSION_PREFIX)) {
    // Рабочий контур: кука хранит идентификатор серверной сессии, а не сотрудника.
    // Выход и выключение доступа гасят строку — и кука сразу перестаёт работать (ADR-021)
    return withAuth ? await sessionEmployee(verified.slice(SESSION_PREFIX.length)) : null;
  }
  if (verified?.startsWith(PERSONA_PREFIX)) {
    // Персона демонстрации: свободный выбор одной из пяти за ключом показа. С базой её нет
    return withAuth ? null : verified.slice(PERSONA_PREFIX.length);
  }
  if (verified) return withAuth ? null : verified;
  /*
   * Сессии по умолчанию больше нет (ADR-021, п. 5): с базой любой вход только через /login.
   * Без базы это демонстрация в памяти процесса — там сотрудник по умолчанию остаётся,
   * иначе первые запросы новой вкладки получали бы 403 ещё до выбора персоны.
   */
  return !withAuth && isDocumentRequest() ? DEFAULT_USER_ID : null;
}

/** Запрос документа страницы, а не вызов серверной функции или выгрузки */
function isDocumentRequest() {
  const request = getRequest();
  const { pathname } = new URL(request.url);
  return (
    request.method === "GET" &&
    !pathname.startsWith("/_serverFn") &&
    !pathname.startsWith("/api/") &&
    (request.headers.get("accept") ?? "").includes("text/html")
  );
}

/** Выдать сессию персоны демонстрации: подпись и cookie на 30 дней */
export async function grantSession(actorId: string) {
  await setSessionCookie(`${PERSONA_PREFIX}${actorId}`);
}

/** Выдать настоящую сессию: в куке идентификатор строки, которую гасит выход */
export async function grantAuthSession(sessionId: string) {
  await setSessionCookie(`${SESSION_PREFIX}${sessionId}`);
}

/** Забрать куку: сама сессия гасится на сервере отдельно */
export function clearSessionCookie() {
  setCookie(SESSION_COOKIE, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(getRequest().url).protocol === "https:",
  });
}

/** Идентификатор серверной сессии из куки запроса, если он там есть */
export async function currentSessionId() {
  const verified = await verifySession(getCookie(SESSION_COOKIE));
  return verified?.startsWith(SESSION_PREFIX) ? verified.slice(SESSION_PREFIX.length) : null;
}

async function setSessionCookie(value: string) {
  setCookie(SESSION_COOKIE, await signSession(value), {
    path: "/",
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(getRequest().url).protocol === "https:",
  });
}
