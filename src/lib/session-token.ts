import { serverEnv } from "@/lib/runtime-env";

/**
 * Подпись сессии (ADR-012, п. 4): `<id сотрудника>.<HMAC-SHA256>`. Без зависимостей от контекста
 * запроса: подпись проверяют и серверные функции, и обработчик документа страницы.
 */
export const SESSION_COOKIE = "fieldops_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
/** Метка назначения: ключ сессии, производный от ключа демонстрации, не совпадает с ним */
const PURPOSE = "fieldops-session-v1";
/** Значение куки: `p:<персона демо>` или `s:<идентификатор серверной сессии>` (ADR-021) */
const ID = /^[a-z0-9:-]{1,72}$/;
export const PERSONA_PREFIX = "p:";
export const SESSION_PREFIX = "s:";

const encoder = new TextEncoder();
let cached: { source: string; key: Promise<CryptoKey> } | null = null;
let randomSecret: string | null = null;

const hmacKey = (raw: BufferSource) =>
  crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

/**
 * Ключ подписи: SESSION_SECRET; иначе производный от DEMO_ACCESS_KEY окружения; иначе случайный
 * на процесс. Ключ сборки VITE_DEMO_ACCESS_KEY не годится: он попадает в клиентский бандл.
 */
function signingKey(): Promise<CryptoKey> {
  const explicit = serverEnv("SESSION_SECRET");
  const demoKey = serverEnv("DEMO_ACCESS_KEY");
  const source = explicit
    ? `secret:${explicit}`
    : demoKey
      ? `demo:${demoKey}`
      : `random:${(randomSecret ??= crypto.randomUUID() + crypto.randomUUID())}`;
  if (cached?.source === source) return cached.key;
  const key = explicit
    ? hmacKey(encoder.encode(explicit))
    : demoKey
      ? hmacKey(encoder.encode(demoKey))
          .then((base) => crypto.subtle.sign("HMAC", base, encoder.encode(PURPOSE)))
          .then((derived) => hmacKey(derived))
      : hmacKey(encoder.encode(randomSecret!));
  cached = { source, key };
  return key;
}

const toBase64Url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Значение cookie сессии для сотрудника */
export async function signSession(actorId: string) {
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(actorId));
  return `${actorId}.${toBase64Url(signature)}`;
}

/** Сотрудник из значения cookie или null: испорчена или подпись не сходится */
export async function verifySession(raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null;
  /*
   * Значение приходит из cookie процентно-закодированным: двоеточие в `s:<сессия>` браузер
   * пишет как `%3A`. Без расшифровки приставка не узнаётся, и вход молча не срабатывал —
   * кука ставилась, а сервер её не признавал.
   */
  const value = decodeCookieValue(raw);
  const dot = value.lastIndexOf(".");
  const actorId = value.slice(0, dot);
  const signature = fromBase64Url(value.slice(dot + 1));
  if (dot <= 0 || !ID.test(actorId) || !signature) return null;
  // verify сравнивает подпись за постоянное время
  const valid = await crypto.subtle.verify(
    "HMAC",
    await signingKey(),
    signature,
    encoder.encode(actorId),
  );
  return valid ? actorId : null;
}

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Значение сессии из заголовка Cookie запроса */
export function sessionFromCookieHeader(header: string | null) {
  const match = (header ?? "").match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

/** Заголовок Set-Cookie сессии */
export function sessionSetCookie(value: string, secure: boolean) {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; SameSite=Lax;${secure ? " Secure;" : ""}`;
}
