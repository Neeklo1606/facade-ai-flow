/**
 * Личная ссылка заказчика (ADR-047, 01_SPEC 6.2). `/gas?c=<CLIENT_LINK_KEY>` ставит куку
 * контура на 30 дней и уводит на тот же адрес без ключа. Сервер отдаёт набор заказчика
 * только с этой кукой.
 *
 * Значение куки: HMAC-SHA256 от метки назначения с ключом, производным от CLIENT_LINK_KEY.
 * Подпись сессии без SESSION_SECRET берёт случайный ключ на процесс, а у хостинга процессов
 * много: кука жила бы до перезапуска. Смена CLIENT_LINK_KEY гасит все выданные куки.
 * Модуль серверный: его импортируют `src/server.ts` и серверная функция контура.
 */
import { serverEnv } from "@/lib/runtime-env";

export const CLIENT_PARAM = "c";
export const CLIENT_COOKIE = "gaika_client";
const PURPOSE = "gaika-client-contour-v1";
const MAX_AGE = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

export function clientLinkKey(): string | null {
  return serverEnv("CLIENT_LINK_KEY") ?? null;
}

async function tokenFor(key: string): Promise<string> {
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", base, encoder.encode(PURPOSE));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function cookieValue(header: string | null, name: string): string | null {
  const match = (header ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? null;
}

/** Сравнение за постоянное время: длина токена известна, перебор по времени ответа не нужен */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hasClientAccess(cookieHeader: string | null): Promise<boolean> {
  const key = clientLinkKey();
  const value = cookieValue(cookieHeader, CLIENT_COOKIE);
  if (!key || !value) return false;
  return same(value, await tokenFor(key));
}

/**
 * Обработчик адреса с ключом. Только для /gas: ключ в адресе сайта или ГАЙКИ ничего не значит.
 * Верный ключ: кука и 302 на адрес без ключа. Неверный: 302 на адрес без ключа, без куки,
 * чтобы неверная ссылка не гуляла дальше с параметром.
 */
export async function clientLinkGate(request: Request): Promise<Response | null> {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (!(url.pathname === "/gas" || url.pathname.startsWith("/gas/"))) return null;
  const given = url.searchParams.get(CLIENT_PARAM);
  if (given === null) return null;
  const clean = new URL(url);
  clean.searchParams.delete(CLIENT_PARAM);
  const headers = new Headers({
    location: clean.pathname + clean.search + clean.hash,
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
  });
  const key = clientLinkKey();
  if (key && same(given, key)) {
    const secure = clean.protocol === "https:" ? " Secure;" : "";
    headers.set(
      "set-cookie",
      `${CLIENT_COOKIE}=${await tokenFor(key)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax;${secure}`,
    );
  }
  return new Response(null, { status: 302, headers });
}
