/**
 * Заголовки безопасности ответов сервера (план критического тестирования, раздел 2).
 *
 * - `x-content-type-options: nosniff` — браузер не угадывает тип файла выгрузки;
 * - `referrer-policy` — адрес страницы не уходит на чужие сайты; экран входа не передаёт его
 *   никому: в адресе там одноразовая ссылка-приглашение;
 * - `permissions-policy` — камера, микрофон и место только для самого сервиса;
 * - рабочий контур (есть база и вход): страницы не встраиваются в чужие окна. Демонстрацию
 *   встраивает редактор Lovable, поэтому там запрет не ставится.
 *
 * HSTS ставит Caddy (deploy/Caddyfile): сервер приложения за ним видит обычный http.
 */

const LOGIN_PATH = "/login";

export function securityHeaders(input: { pathname: string; working: boolean }): [string, string][] {
  const headers: [string, string][] = [
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", input.pathname === LOGIN_PATH ? "no-referrer" : "same-origin"],
    [
      "permissions-policy",
      "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()",
    ],
  ];
  if (input.working) {
    headers.push(["x-frame-options", "SAMEORIGIN"]);
    headers.push(["content-security-policy", "frame-ancestors 'self'"]);
  }
  return headers;
}

/** Ответ с заголовками безопасности. Свои заголовки ответа не перезаписываются */
export function withSecurityHeaders(
  response: Response,
  input: { pathname: string; working: boolean },
): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of securityHeaders(input)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Запрос пришёл по https: сам адрес или заголовок обратного прокси (Caddy ставит
 * `x-forwarded-proto`). Без этого кука сессии за прокси выходила без флага Secure
 */
export function requestIsHttps(request: Pick<Request, "url" | "headers">): boolean {
  if (new URL(request.url).protocol === "https:") return true;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwarded === "https";
}
