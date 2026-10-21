/**
 * Сегменты с прокруткой (ADR-045 «Финальный интерфейс», 4.11; refs/04, 12): ряд капсул `.seg`, который не влезает
 * в ширину, прокручивается пальцем, у края появляется затухание, а активный сегмент сам
 * докручивается в видимую часть — при открытии экрана и после касания.
 * Один хук на оболочку вместо правки каждого экрана.
 */
import { useEffect } from "react";

const ACTIVE =
  "[aria-selected='true'],[aria-current='page'],[data-active='true'],[aria-pressed='true']";

function settle(root: ParentNode = document) {
  for (const row of root.querySelectorAll<HTMLElement>(".seg")) {
    const overflow = row.scrollWidth > row.clientWidth + 1;
    row.classList.toggle("seg-scroll", overflow);
    if (!overflow) continue;
    const active = row.querySelector<HTMLElement>(ACTIVE);
    if (!active) continue;
    const left = active.offsetLeft - row.clientWidth / 2 + active.offsetWidth / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }
}

export function useSegScroll(key: string) {
  useEffect(() => {
    const timers = [80, 400, 1200].map((ms) => window.setTimeout(() => settle(), ms));
    const onClick = (event: MouseEvent) => {
      const row = (event.target as Element | null)?.closest?.(".seg");
      if (row) window.setTimeout(() => settle(row.parentElement ?? document), 60);
    };
    const onResize = () => settle();
    document.addEventListener("click", onClick);
    window.addEventListener("resize", onResize);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      document.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
    };
  }, [key]);
}
