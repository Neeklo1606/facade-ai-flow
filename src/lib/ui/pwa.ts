/**
 * Приложение на экране «Домой» (ADR-045, 4.20). Заказчик открывает систему как сайт
 * и выносит на «Домой», как банк: у ГАЙКИ и у учёта выработки свои манифесты и имена.
 *
 * - `useAppManifest` ставит манифест и имя для iOS текущего контура;
 * - `useInstallHint` один раз на телефоне в Safari подсказывает, как добавить на «Домой»,
 *   и больше не появляется. Хранилище может быть недоступно: тогда подсказки нет.
 */
import { useEffect } from "react";
import { notify } from "@/components/ui/kit/toast";

export function useAppManifest(href: string, title: string) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const meta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const before = { href: link?.getAttribute("href"), title: meta?.content };
    link?.setAttribute("href", href);
    if (meta) meta.content = title;
    return () => {
      if (link && before.href) link.setAttribute("href", before.href);
      if (meta && before.title) meta.content = before.title;
    };
  }, [href, title]);
}

const HINT_KEY = "neeklo-install-hint";

export function useInstallHint() {
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua);
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|YaBrowser/.test(ua);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!ios || !safari || standalone) return;
    try {
      if (localStorage.getItem(HINT_KEY) === "1") return;
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      return;
    }
    const timer = window.setTimeout(
      () => notify("Добавьте на экран «Домой»: «Поделиться», затем «На экран „Домой“»"),
      2500,
    );
    return () => window.clearTimeout(timer);
  }, []);
}
