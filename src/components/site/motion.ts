import { useEffect } from "react";

/**
 * Появление блоков при прокрутке (ADR-067, раздел 8): прозрачность и сдвиг 12 px, 280 мс,
 * один раз, шаг 40 мс внутри группы `[data-reveal-group]`.
 *
 * Прятать умеет только скрипт: он ставит `data-pending` тем `[data-reveal]`, что ниже экрана,
 * и снимает, когда блок вошёл в экран. Что уже на экране, не прячется вовсе, поэтому первый
 * экран не мигает, а блок, который скрипт не увидел, просто виден. Без скриптов виден весь
 * текст. reduced-motion оставляет только прозрачность (styles.css).
 */
export function useSiteReveal(key: string) {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const groups = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          delete el.dataset["pending"];
          observer.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    const height = window.innerHeight;
    for (const el of nodes) {
      if (el.dataset["revealed"] !== undefined) continue;
      el.dataset["revealed"] = "";
      const box = el.getBoundingClientRect();
      if (box.top < height && box.bottom > 0) continue;
      const group = el.closest("[data-reveal-group]");
      if (group) {
        const index = groups.get(group) ?? 0;
        groups.set(group, index + 1);
        el.style.setProperty("--reveal-delay", `${Math.min(index, 8) * 40}ms`);
      }
      el.dataset["pending"] = "";
      observer.observe(el);
    }
    return () => {
      observer.disconnect();
      for (const el of nodes) delete el.dataset["pending"];
    };
  }, [key]);
}

/** Пользователь просит без движения: анимации в скриптах тоже гасятся */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
