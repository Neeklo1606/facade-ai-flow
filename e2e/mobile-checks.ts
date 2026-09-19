import type { Page } from "@playwright/test";

/**
 * Проверки мобильной версии (Q8, ADR-015): переполнение, области нажатия от 44 px, действия
 * только по наведению, фокус за краем экрана и пометка демонстрации в первом экране.
 * Общие для сквозных тестов экранов (375) и обхода продукта (375, 390, 430).
 */

/** Интерактивные элементы, которые проверяются на размер и видимость */
export const INTERACTIVE = [
  "a[href]",
  "button",
  "[role=button]",
  "[role=tab]",
  "[role=menuitem]",
  "[role=option]",
  "[role=switch]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=listitem][data-position-id]",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
].join(", ");

export interface MobileCheck {
  overflow: { scrollWidth: number; offenders: string[] };
  small: { element: string; width: number; height: number }[];
  hoverOnly: string[];
  demoMarked: boolean;
  offscreenFocusable: string[];
  offscreenCount: number;
}

export function mobileCheck(page: Page): Promise<MobileCheck> {
  return page.evaluate((selector) => {
    const vw = window.innerWidth;
    const describe = (el: Element) => {
      const label = (el.getAttribute("aria-label") ?? el.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} «${label}»`;
    };
    // На экране: выдвижное меню за левым краем в раскладке есть, но его не видно
    const shown = (el: Element) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.left < vw &&
        el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
        !el.closest("[inert], [aria-hidden='true']")
      );
    };
    const scrollsX = (el: Element) => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) return true;
      }
      return false;
    };
    const scrollWidth = document.documentElement.scrollWidth;
    const offenders =
      scrollWidth > vw + 1
        ? [...document.querySelectorAll("body *")]
            .filter((el) => shown(el) && el.getBoundingClientRect().right > vw + 1 && !scrollsX(el))
            .slice(0, 8)
            .map(describe)
        : [];

    // Ссылка внутри строки текста — не отдельная цель (WCAG 2.5.8, исключение для строки)
    const inlineInText = (el: Element) =>
      el.tagName === "A" &&
      !!el.parentElement &&
      ["P", "SPAN", "LI"].includes(el.parentElement.tagName) &&
      [...el.parentElement.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim().length > 0,
      );
    const targetRect = (el: Element) => {
      const label = el.closest("label");
      return (label ?? el).getBoundingClientRect();
    };
    const small = [...document.querySelectorAll(selector)]
      .filter((el) => shown(el) && !inlineInText(el) && el.getBoundingClientRect().left < vw)
      .map((el) => ({ el, rect: targetRect(el) }))
      .filter(({ rect }) => rect.width < 44 - 0.5 || rect.height < 44 - 0.5)
      .map(({ el, rect }) => ({
        element: describe(el),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }));

    // В раскладке, но не видно: появляется только по наведению
    const opacityOf = (el: Element) => {
      let value = 1;
      for (let node: Element | null = el; node; node = node.parentElement) {
        value *= Number(getComputedStyle(node).opacity);
      }
      return value;
    };
    const hoverOnly = [...document.querySelectorAll(selector)]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.right <= 0 || rect.left >= vw) return false;
        if (el.closest("[inert], [aria-hidden='true']")) return false;
        const style = getComputedStyle(el);
        if (style.display === "none") return false;
        return opacityOf(el) < 0.1 || style.visibility === "hidden";
      })
      .map(describe);

    // Пометка видна в первом экране, без прокрутки и без открытия меню
    const demoMarked = [...document.querySelectorAll("body *")].some((el) => {
      if (el.children.length > 0 || !/демонстрац|демо-данн|демо/i.test(el.textContent ?? "")) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return shown(el) && rect.top < window.innerHeight && rect.bottom > 0;
    });
    // Фокус не уходит за экран: элементы, до которых дойдёт Tab, но которых не видно
    const offscreenFocusable = [
      ...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex='0']"),
    ]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return (
          rect.width > 0 &&
          (rect.right <= 0 || rect.left >= vw) &&
          el.checkVisibility({ checkVisibilityCSS: true }) &&
          !el.closest("[inert], [aria-hidden='true']") &&
          !(el as HTMLButtonElement).disabled &&
          !el.closest("[class*='overflow-x']")
        );
      })
      .map(describe);
    return {
      overflow: { scrollWidth, offenders },
      small,
      hoverOnly,
      demoMarked,
      offscreenFocusable: offscreenFocusable.slice(0, 5),
      offscreenCount: offscreenFocusable.length,
    };
  }, INTERACTIVE);
}
