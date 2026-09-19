import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Общая оснастка сквозных тестов (ADR-013, п. 3):
 * — любая ошибка в консоли или необработанное исключение роняет тест;
 * — `persona` открывает вкладку за сотрудника без экрана выбора роли (кроме тестов, где выбор
 *   роли и есть сценарий);
 * — проверки EMBER и axe вызываются на экранах явно.
 */
type Options = { persona: string | null };

export const test = base.extend<Options & { consoleGuard: void }>({
  persona: [null, { option: true }],

  // Второй аргумент фикстуры Playwright — функция, отдающая значение тесту
  page: async ({ page, persona }, provide) => {
    await page.addInitScript((id) => {
      try {
        if (id) {
          sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
          sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
          sessionStorage.setItem("neeklo-fieldops-persona", id);
        }
      } catch {
        // Приватный режим: тест увидит экран выбора роли
      }
    }, persona);
    await provide(page);
  },

  consoleGuard: [
    async ({ page }, provide) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text().slice(0, 200));
      });
      page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
      await provide();
      expect(errors, "ошибки в консоли за время теста").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Открыть экран и дождаться, пока уйдут скелетоны */
export async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.locator("main").waitFor();
  // Скелетоны экранов помечены aria-busy: ждём, пока все они уйдут
  await expect(page.locator("main [aria-busy='true'], main [aria-busy='']")).toHaveCount(0, {
    timeout: 20_000,
  });
}

/**
 * Дождаться конца анимаций: во время появления панели текст полупрозрачный, и контраст
 * и цвет, измеренные в этот момент, не те, что видит человек
 */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );
}

/**
 * Правила EMBER на экране: одно оранжевое пятно в содержимом (боковое меню, нижняя панель
 * и уведомления не считаются — у них своё активное состояние) и ни одного капса.
 * Критерии те же, что у проверки 12 пунктов EMBER.
 */
export async function expectEmber(page: Page, screen: string) {
  await settle(page);
  const result = await page.evaluate(() => {
    // Видимость по всей цепочке предков и ненулевой размер: кнопка мобильной панели внутри
    // скрытого на десктопе контейнера не пятно
    const rendered = (el: Element) => {
      const rect = el.getBoundingClientRect();
      return (
        el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const inContent = (el: Element) =>
      !el.closest("[data-sidebar='app']") &&
      !el.closest("[data-sonner-toaster]") &&
      !el.closest("nav[aria-label='Основная навигация']") &&
      !el.closest("section[aria-label='Подсказки по сценарию']");
    const hsl = (c: string) => {
      const x = c.match(/rgba?\(([^)]+)\)/);
      if (!x?.[1]) return null;
      const [r = 0, g = 0, b = 0, a = 1] = x[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      const R = r / 255,
        G = g / 255,
        B = b / 255;
      const max = Math.max(R, G, B),
        min = Math.min(R, G, B);
      const l = (max + min) / 2,
        d = max - min;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      const h =
        d === 0 ? 0 : max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
      return { h: (h * 60 + 360) % 360, s, l, a };
    };
    const isOrange = (c: string) => {
      const v = hsl(c);
      return !!v && v.a >= 0.1 && v.s > 0.6 && v.h >= 8 && v.h <= 34 && v.l > 0.2 && v.l < 0.65;
    };
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)}`;
    const all = [...document.querySelectorAll("body *")].filter(
      (el) => inContent(el) && rendered(el),
    );
    const orange: Element[] = [];
    const caps: string[] = [];
    for (const el of all) {
      const s = getComputedStyle(el);
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      const svg = el instanceof SVGElement;
      const hit =
        isOrange(s.backgroundColor) ||
        (parseFloat(s.borderTopWidth) > 0 && isOrange(s.borderTopColor)) ||
        (parseFloat(s.borderLeftWidth) > 0 && isOrange(s.borderLeftColor)) ||
        (ownText && isOrange(s.color)) ||
        (svg && (isOrange(s.stroke) || isOrange(s.fill)));
      if (hit) orange.push(el);
      if (ownText && s.textTransform === "uppercase") caps.push(describe(el));
    }
    const roots = orange.filter((el) => !orange.some((o) => o !== el && o.contains(el)));
    return { orange: roots.map(describe), caps };
  });
  expect(
    result.orange.length,
    `${screen}: оранжевых пятен ${result.orange.join(", ")}`,
  ).toBeLessThanOrEqual(1);
  expect(result.caps, `${screen}: текст капсом`).toEqual([]);
}

/** axe-core: нарушения уровня serious и critical роняют тест */
export async function expectA11y(page: Page, screen: string) {
  await settle(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}, узлов ${v.nodes.length}): ${v.nodes[0]?.target.join(" ")}`);
  expect(serious, `${screen}: нарушения доступности`).toEqual([]);
}
