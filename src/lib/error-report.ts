/**
 * Сбор ошибок фронтенда (TASK-A5, п. 5).
 *
 * Куда: собственный маршрут `/api/client-error`, который пишет ошибку в лог хостинга.
 * Никаких внешних сервисов и аккаунтов, ничего, кроме текста ошибки, адреса экрана и версии
 * браузера, наружу не уходит. Как читать логи — docs/RUNBOOK.md.
 */

const ENDPOINT = "/api/client-error";
/** Больше двадцати сообщений за сессию — это цикл, а не ошибки: дальше молчим */
const SESSION_LIMIT = 20;

let sent = 0;
const seen = new Set<string>();

function textOf(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack ?? null };
  if (typeof error === "string") return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error).slice(0, 500), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

/** Отправить ошибку в лог сервера. Повторы одного и того же сообщения не отправляются */
export function reportClientError(error: unknown, context: Record<string, string> = {}) {
  if (typeof window === "undefined") return;
  const { message, stack } = textOf(error);
  const key = `${context["kind"] ?? "error"}:${message}`;
  if (!message || seen.has(key) || sent >= SESSION_LIMIT) return;
  seen.add(key);
  sent += 1;

  const payload = JSON.stringify({
    message: message.slice(0, 500),
    stack: stack?.slice(0, 2000) ?? null,
    url: window.location.pathname + window.location.search,
    userAgent: navigator.userAgent.slice(0, 200),
    at: new Date().toISOString(),
    context,
  });

  try {
    // keepalive: отчёт уходит, даже если экран закрывают в этот момент
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Сбор ошибок не имеет права ломать экран
  }
}

/** Глобальные ловушки: необработанные ошибки и промисы. Вызывается один раз из корня */
export function startErrorReporting() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    reportClientError(event.error ?? event.message, { kind: "onerror" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError(event.reason, { kind: "unhandledrejection" });
  });
}
