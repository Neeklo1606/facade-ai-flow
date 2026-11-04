/*
 * Оболочка бригадира без сети (ADR-062, F7). Экран «Сегодня» (/gas/brigade) открывается
 * без интернета, если хоть раз открывался с сетью.
 * - Переход на /gas/brigade: сначала сеть (не дольше 3 с на медленной связи), без ответа —
 *   сохранённая страница.
 * - Скрипты, стили, шрифты и значки с хешем в имени: из кэша, иначе из сети с сохранением.
 * Остальные экраны и серверные функции сервис не трогает: данные без сети ведёт очередь
 * отправки бригадира (field-queue), а не кэш.
 */
const CACHE = "gaika-foreman-v1";
const SHELL = "/gas/brigade";
const TIMEOUT_MS = 3000;
const MAX_ENTRIES = 160;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

/** Кэш не растёт без меры: старые файлы прежних сборок уходят первыми */
async function trim(cache) {
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
    await cache.delete(request);
  }
}

async function shell(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    if (response.ok) await cache.put(SHELL, response.clone());
    return response;
  } catch {
    const saved = await cache.match(SHELL);
    if (saved) return saved;
    throw new Error("offline");
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    const path = url.pathname.replace(/\/+$/, "");
    if (path === SHELL) event.respondWith(shell(request));
    return;
  }
  if (
    /^\/(assets|fonts)\//.test(url.pathname) ||
    /\.(png|ico|webmanifest|woff2|css)$/.test(url.pathname)
  ) {
    event.respondWith(asset(request));
  }
});
