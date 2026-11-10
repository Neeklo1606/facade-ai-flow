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
  /**
   * Пилот (ADR-067): без переменной «30 000 ₽», как в постановке владельца 11.11.2026.
   * Пустое значение в окружении убирает цену: «назовём после разбора»
   */
  pilot:
    import.meta.env["VITE_PRICE_PILOT"] === undefined
      ? "30\u00a0000\u00a0₽"
      : env(import.meta.env["VITE_PRICE_PILOT"]),
  impl: env(import.meta.env["VITE_PRICE_IMPL"]),
  support: env(import.meta.env["VITE_PRICE_SUPPORT"]),
};

export const RAZBOR_CREDIT = env(import.meta.env["VITE_RAZBOR_CREDIT"]) === "on";
export const CASE_STATUS = env(import.meta.env["VITE_CASE_STATUS"]) || "Пилот, осень 2026";
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
 * Индексация сайта: только при SEO_INDEX=on в окружении хостинга (ADR-067, раздел 9).
 * Решает сервер; в HTML он кладёт мету `gaika-seo`, и вкладка читает решение из неё один раз.
 * Иначе после загрузки скриптов мета robots сменилась бы на noindex, и поисковик, который
 * исполняет скрипты, увидел бы запрет. Заголовок x-robots-tag ставит src/server.ts.
 */
let clientSeo: boolean | null = null;
export function seoIndexEnabled(): boolean {
  if (typeof window === "undefined") return serverEnv("SEO_INDEX") === "on";
  if (clientSeo === null) {
    clientSeo = document.querySelector('meta[name="gaika-seo"]')?.getAttribute("content") === "on";
  }
  return clientSeo;
}

/** Коды подтверждения Яндекс Вебмастера и Google Search Console: мета только если заданы */
export const VERIFICATION = {
  yandex: env(import.meta.env["VITE_YANDEX_VERIFICATION"]),
  google: env(import.meta.env["VITE_GOOGLE_VERIFICATION"]),
};

/** Дата сборки для lastmod карты сайта: подставляется Vite, в тестах берётся текущая */
export const BUILD_DATE = (
  env(import.meta.env["VITE_BUILD_DATE"]) || new Date().toISOString()
).slice(0, 10);
