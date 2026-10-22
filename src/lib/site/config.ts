/**
 * Переменные публичного сайта (01_SPEC 13, ADR-047). Все значения необязательны:
 * без них работает вариант по умолчанию из спецификации. `VITE_*` подставляются при сборке,
 * после изменения в Lovable нужен повторный Publish. Серверные читаются при запросе.
 */
import { serverEnv } from "@/lib/runtime-env";

const env = (value: string | undefined) => (value ?? "").trim();

/** Публичный адрес для canonical и og:url */
export const PUBLIC_URL = (
  env(import.meta.env["VITE_PUBLIC_URL"]) || "https://facade-ai-flow.lovable.app"
).replace(/\/+$/, "");

/** Telegram владельца для связи, без @ */
export const CONTACT_TG = env(import.meta.env["VITE_CONTACT_TG"]).replace(/^@/, "") || "neeekn";

export const contactTgUrl = (text?: string) =>
  `https://t.me/${CONTACT_TG}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** Цены лестницы: без значения строка цены не выводится вовсе */
export const PRICES = {
  razbor: env(import.meta.env["VITE_PRICE_RAZBOR"]),
  pilot: env(import.meta.env["VITE_PRICE_PILOT"]),
  impl: env(import.meta.env["VITE_PRICE_IMPL"]),
  support: env(import.meta.env["VITE_PRICE_SUPPORT"]),
};

export const RAZBOR_CREDIT = env(import.meta.env["VITE_RAZBOR_CREDIT"]) === "on";
export const CASE_STATUS = env(import.meta.env["VITE_CASE_STATUS"]) || "Внедрение, октябрь 2026";
/** Название заказчика в кейсе: пусто, пока заказчик не согласился */
export const CASE_CLIENT_NAME = env(import.meta.env["VITE_CASE_CLIENT_NAME"]);
/** Строка реквизитов в подвале: пусто, строка скрыта */
export const LEGAL_LINE = env(import.meta.env["VITE_LEGAL_LINE"]);
export const PRIVACY_FINAL = env(import.meta.env["VITE_PRIVACY_FINAL"]) === "on";
export const METRIKA_ID = env(import.meta.env["VITE_METRIKA_ID"]);
export const VIDEO = {
  url: env(import.meta.env["VITE_VIDEO_URL"]),
  poster: env(import.meta.env["VITE_VIDEO_POSTER"]),
};

/**
 * Индексация сайта: только при SEO_INDEX=on в окружении хостинга. Мета-тег решается при
 * отрисовке на сервере (его и видят поисковики), заголовок x-robots-tag ставит src/server.ts.
 * /kit и личный контур закрыты всегда.
 */
export function seoIndexEnabled(): boolean {
  if (typeof window !== "undefined") return false;
  return serverEnv("SEO_INDEX") === "on";
}

export const NEVER_INDEXED = ["/kit"] as const;
