import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";

/**
 * Перекрытия и переполнение (D2, правила 6 и 7; D5, п. 4). Главные кнопки и ссылки экрана
 * не уходят под нижнюю панель и полосу шагов, закреплённые действия не наезжают на панель,
 * ни один экран не прокручивается вбок. Ширины 375–1440, полоса шагов включена, флаг
 * `legacy_modules` снят — проверяется то, что видит зритель.
 */
const WIDTHS = [375, 390, 430, 768, 1024, 1440] as const;
const SCREENS: { persona: string; path: string }[] = [
  { persona: "e-gareev", path: "/today" },
  { persona: "e-gareev", path: "/capture" },
  { persona: "e-gareev", path: "/projects/p-korona" },
  { persona: "e-volkova", path: "/check" },
  { persona: "e-dorohov", path: "/inbox" },
  { persona: "e-sokolov", path: "/attention" },
  { persona: "e-sokolov", path: "/projects" },
  { persona: "e-sokolov", path: "/office" },
];

async function geometry(page: Page) {
  return page.evaluate(() => {
    const rect = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
    const nav = rect(document.querySelector('nav[aria-label="Основная навигация"]'));
    const strip = rect(document.querySelector('section[aria-label="Подсказки по сценарию"]'));
    const visible = (r: DOMRect) => r.width > 0 && r.height > 0;
    const hits = (a: DOMRect, b: DOMRect | null) =>
      !!b &&
      visible(b) &&
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom - 1 &&
      a.bottom > b.top + 1;
    const label = (el: Element) =>
      (el.getAttribute("aria-label") || el.textContent || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40);
    const main = document.querySelector("main");
    // Прокрутка до конца: последний элемент обязан стоять выше панели (отступ под панель)
    if (main) main.scrollTop = main.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
    const controls = [...(main?.querySelectorAll("a, button, [role=slider]") ?? [])].filter((el) =>
      el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
    );
    const underNav = controls
      .filter((el) => {
        const r = el.getBoundingClientRect();
        // Кнопка, частично ушедшая под панель при прокрутке, видна целиком после прокрутки
        return (
          visible(r) &&
          r.top < innerHeight &&
          hits(r, nav) &&
          r.bottom > (nav?.top ?? 0) + 8 &&
          r.top >= (nav?.top ?? 0) - 1
        );
      })
      .map(label);
    /*
     * Видимая часть элемента — внутри области прокрутки: прокрученное за её верх не видно
     * и полосой не закрыто. Полоса стоит над областью; если что-то видимое залезает под неё,
     * это и есть перекрытие.
     */
    const area = main?.getBoundingClientRect() ?? null;
    const shown = (r: DOMRect) =>
      area
        ? new DOMRect(
            r.left,
            Math.max(r.top, area.top),
            r.width,
            Math.max(0, Math.min(r.bottom, area.bottom) - Math.max(r.top, area.top)),
          )
        : r;
    const underStrip = controls
      .map((el) => [el, shown(el.getBoundingClientRect())] as const)
      .filter(([, r]) => r.height > 0 && hits(r, strip))
      .map(([el]) => label(el));
    // Закреплённые действия экрана (полоса над панелью) не наезжают на саму панель
    const pinned = [...document.querySelectorAll("body *")]
      .filter(
        (el) =>
          getComputedStyle(el).position === "fixed" &&
          !el.closest("nav") &&
          el.querySelector("button, a"),
      )
      .filter((el) => el.checkVisibility() && hits(el.getBoundingClientRect(), nav))
      .map(label);
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      underNav,
      underStrip,
      pinned,
    };
  });
}

for (const width of WIDTHS) {
  test.describe(`раскладка ${width}`, () => {
    test.use({ viewport: { width, height: width >= 1024 ? 900 : 844 }, persona: null });
    // Ширина задаётся здесь, поэтому прогон один — в проекте десктопа
    test.skip(({ isMobile }) => isMobile, "ширины задаются тестом");

    for (const screen of SCREENS) {
      test(`${screen.path} глазами ${screen.persona}`, async ({ page }) => {
        await page.addInitScript(
          ({ id }) => {
            try {
              sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
              sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
              sessionStorage.setItem("neeklo-fieldops-persona", id);
              sessionStorage.removeItem("neeklo-fieldops-legacy");
              // Полоса шагов включена: она не должна закрывать ни контент, ни кнопки
              sessionStorage.setItem(
                "neeklo-fieldops-guide",
                JSON.stringify({ scenarioId: "canon-shift", stepIndex: 1, status: {} }),
              );
            } catch {
              // Приватный режим
            }
          },
          { id: screen.persona },
        );
        await open(page, screen.path);
        const result = await geometry(page);
        expect(result.overflow, "горизонтальная прокрутка").toBeLessThanOrEqual(1);
        expect(result.underNav, "кнопки под нижней панелью").toEqual([]);
        expect(result.underStrip, "кнопки под полосой шагов").toEqual([]);
        expect(result.pinned, "закреплённое действие на панели").toEqual([]);
      });
    }
  });
}
