import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";

/**
 * Планшет, компьютер и кабинет (шаг L7; ADR-045 V7, V8; 01_SPEC 3 и 5).
 * Модель навигации телефона (L2) не должна задевать планшет и компьютер.
 */

/** Плавающая капсула «Монохрома» (ADR-055, 2.1) */
const capsule = (page: Page) => page.getByRole("complementary", { name: "Панель действий" });

/** Самый мелкий видимый текст на экране, в пикселях после html 87,5 % */
async function smallestText(page: Page): Promise<{ size: number; text: string }> {
  return page.evaluate(() => {
    let best = { size: 99, text: "" };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const el = node.parentElement;
      if (!text || !el) continue;
      if (el.closest("[aria-hidden='true'], .sr-only, script, style, [data-sonner-toaster]")) {
        continue;
      }
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      const size = parseFloat(style.fontSize);
      if (size < best.size) best = { size, text: text.slice(0, 40) };
    }
    return best;
  });
}

test.describe("планшет 900", () => {
  test.use({ viewport: { width: 900, height: 1100 } });

  test("до 1024 раскладка телефона: шапка и нижняя панель, без капсулы (ADR-055)", async ({
    page,
  }) => {
    await open(page, "/gas/moderation");
    await expect(capsule(page)).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Разделы", exact: true })).toBeHidden();
    const tabs = page.getByRole("navigation", { name: "Основные разделы" });
    await expect(tabs).toBeVisible();
    expect(Math.round((await tabs.boundingBox())!.width)).toBe(900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(900);
  });
});

test.describe("компьютер 1280", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("верхняя строка 72, меню-таблетка по центру, капсула 64 слева (ADR-055, 2.1)", async ({
    page,
  }) => {
    await open(page, "/gas/moderation");
    const menu = page.getByRole("navigation", { name: "Разделы", exact: true });
    const box = (await menu.boundingBox())!;
    expect(box.height).toBe(56);
    // По центру строки: середина меню не дальше 120 от середины окна (знак слева шире кругов)
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(120);
    // Активный пункт — инверсная таблетка: индикатор под «Проверкой»
    const active = menu.getByRole("link", { name: /Проверка/ });
    await expect(active).toHaveAttribute("aria-current", "page");
    const bar = (await capsule(page).boundingBox())!;
    expect(bar.width).toBe(64);
    expect(bar.x).toBe(24);
    await expect(page.getByRole("navigation", { name: "Основные разделы" })).toBeHidden();
    // Переход по меню: индикатор переезжает, текущий пункт меняется
    await menu.getByRole("link", { name: "Журнал" }).click();
    await expect(page).toHaveURL(/\/gas\/entries/);
    await expect(menu.getByRole("link", { name: "Журнал" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("деталь записи справа 420, Esc закрывает", async ({ page }) => {
    await open(page, "/gas/entries");
    await page.locator("main table tbody tr").first().click();
    const panel = page.getByRole("dialog").last();
    await expect(panel).toBeVisible();
    expect(Math.round((await panel.boundingBox())!.width)).toBe(420);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("при html 87,5 % ничего мельче 12 px, касание мышью от 32, таблица без прокрутки вбок", async ({
    page,
  }) => {
    for (const path of ["/gas/reports", "/gas/entries", "/gas/moderation"]) {
      await open(page, path);
      await page.locator("main").first().waitFor();
      const small = await smallestText(page);
      expect(small.size, `${path}: «${small.text}»`).toBeGreaterThanOrEqual(12);
      const tiny = await page.evaluate(() =>
        [...document.querySelectorAll("main button, main a, main [role='button']")]
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && box.height > 0 && box.height < 32)
          .map(({ el }) => (el.textContent ?? el.getAttribute("aria-label") ?? "").trim())
          .filter(Boolean),
      );
      expect(tiny, `${path}: элементы ниже 32 px`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
    }
  });

  test("отчёт «Во весь экран» открывается и закрывается Esc", async ({ page }) => {
    await open(page, "/gas/reports");
    await page.getByRole("button", { name: "Во весь экран" }).click();
    // Отчёт ложится поверх меню и шапки: рельс под ним, видна только кнопка возврата
    const back = page.getByRole("button", { name: "Свернуть, Esc" });
    await expect(back).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(back).toBeHidden();
    await expect(page.getByRole("button", { name: "Во весь экран" })).toBeVisible();
  });
});

test.describe("кабинет на компьютере 1280", () => {
  test.use({ viewport: { width: 1280, height: 800 }, persona: "e-sokolov" });

  test("подключения: сайдбар кабинета, ничего мельче 12 px, без прокрутки вбок", async ({
    page,
  }) => {
    await open(page, "/office/connections");
    await expect(page.getByText("Приём заявок с сайта", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Разделы кабинета" })).toBeVisible();
    await expect(page.getByTestId("office-desktop-note")).toBeHidden();
    const small = await smallestText(page);
    expect(small.size, `«${small.text}»`).toBeGreaterThanOrEqual(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
  });
});

test.describe("сайт на компьютере и планшете", () => {
  for (const width of [768, 1024, 1280, 1440, 1920]) {
    test(`лендинг ${width}: сетка, текст до 640, контент до 1200, фрагменты по ширине`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/", { waitUntil: "load" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const lead = page.locator("main p.site-lead").first();
      expect((await lead.boundingBox())!.width).toBeLessThanOrEqual(640);
      const wraps = await page
        .locator("main .site-wrap")
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
      for (const w of wraps) expect(w).toBeLessThanOrEqual(1200);
      const title = (await page.locator("main h1").boundingBox())!;
      const record = page.getByLabel("Путь одной записи");
      const fragment = (await record.getByLabel("Пример: бот бригадира").boundingBox())!;
      // ADR-053 (лендинг): заголовок по центру, путь записи под ним тремя шагами в строку
      expect(fragment.y).toBeGreaterThan(title.y + title.height);
      const steps = await record.locator(".landing-record-step").evaluateAll((els) =>
        els.map((el) => {
          const box = el.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width };
        }),
      );
      expect(steps).toHaveLength(3);
      for (const [i, step] of steps.entries()) {
        const previous = steps[i - 1];
        if (!previous) continue;
        expect(Math.abs(step.y - previous.y)).toBeLessThan(2);
        expect(step.x).toBeGreaterThan(previous.x + previous.width - 1);
      }
    });
  }

  test("/demo на компьютере: две карточки рядом", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/demo", { waitUntil: "load" });
    const cards = page.locator("main section[aria-labelledby]");
    const a = (await cards.nth(0).boundingBox())!;
    const b = (await cards.nth(1).boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(b.x).toBeGreaterThan(a.x + a.width - 1);
  });
});

test.describe("кабинет на телефоне", () => {
  test.use({ viewport: { width: 390, height: 844 }, persona: "e-sokolov" });

  test("список разделов и честная строка «Кабинет удобнее на компьютере»", async ({ page }) => {
    await open(page, "/office");
    await expect(page.getByTestId("office-desktop-note")).toContainText(
      "Кабинет удобнее на компьютере",
    );
    await expect(page.getByRole("link", { name: "В полевое приложение" })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});
