import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { DEFAULT_USER_ID } from "@/api/config";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "@/lib/session-token";

/**
 * Сессия сотрудника в серверной функции (ADR-012, п. 4): кто действует, серверные функции
 * узнают только отсюда. Подделанная или чужая подпись — сессии нет.
 */
export async function sessionActorId(): Promise<string | null> {
  const verified = await verifySession(getCookie(SESSION_COOKIE));
  if (verified) return verified;
  // Загрузчики документа страницы: этот же ответ выдаёт сессию по умолчанию (server.ts),
  // и данные первой страницы строятся за того же сотрудника (ADR-012, уточнение п. 4)
  return isDocumentRequest() ? DEFAULT_USER_ID : null;
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

/** Выдать сессию сотруднику: подпись и cookie на 30 дней */
export async function grantSession(actorId: string) {
  setCookie(SESSION_COOKIE, await signSession(actorId), {
    path: "/",
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(getRequest().url).protocol === "https:",
  });
}
