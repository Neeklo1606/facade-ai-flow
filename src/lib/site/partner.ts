/**
 * Код партнёра из ?src= (ADR-051, 01_SPEC 10.3): запоминается на время сессии
 * и уходит в заявку. Только латиница, цифры, дефис и подчёркивание, до 40 знаков.
 */
const KEY = "gaika-partner-src";

export function cleanPartnerCode(value: string): string {
  return value
    .trim()
    .replace(/[^\w-]/g, "")
    .slice(0, 40);
}

export function rememberPartnerSrc(search: string) {
  try {
    const code = cleanPartnerCode(new URLSearchParams(search).get("src") ?? "");
    if (code) window.sessionStorage.setItem(KEY, code);
  } catch {
    // без хранилища код живёт только в адресе
  }
}

export function partnerSrc(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** Ссылка партнёра: адрес страницы с ?src=код */
export function partnerLink(base: string, path: string, code: string): string {
  const url = new URL(path, base);
  const clean = cleanPartnerCode(code);
  if (clean) url.searchParams.set("src", clean);
  return url.toString();
}
