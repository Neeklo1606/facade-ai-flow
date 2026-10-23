import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";

/**
 * Планшет, компьютер и кабинет (шаг L7; ADR-045 V7, V8; 01_SPEC 3 и 5).
 * Модель навигации телефона (L2) не должна задевать планшет и компьютер.
 */

const rail = (page: Page) => page.getByRole("complementary", { name: "Меню учёта выработки" });

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

  test("рельс 72 всегда, нижней панели нет", async ({ page }) => {
    await open(page, "/gas/moderation");
    await expect(rail(page)).toHaveAttribute("data-rail", "true");
    expect((await rail(page).boundingBox())!.width).toBe(72);
    await expect(page.getByRole("navigation", { name: "Основные разделы" })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(900);
  });
});

test.describe("компьютер 1280", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("сайдбар 248 сворачивается в 72 и помнит выбор", async ({ page }) => {
    await open(page, "/gas/moderation");
    expect((await rail(page).boundingBox())!.width).toBe(248);
    await page.getByRole("button", { name: "Свернуть панель" }).click();
    await expect(rail(page)).toHaveAttribute("data-rail", "true");
    await expect.poll(async () => (await rail(page).boundingBox())!.width).toBe(72);
    await page.reload();
    await expect(rail(page)).toHaveAttribute("data-rail", "true");
    await page.getByRole("button", { name: "Развернуть панель" }).click();
    await expect.poll(async () => (await rail(page).boundingBox())!.width).toBe(248);
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
      const fragment = (await page
        .getByLabel("Путь одной записи")
        .getByLabel("Пример: бот бригадира")
        .boundingBox())!;
      if (width >= 1024) {
        expect(fragment.x).toBeGreaterThan(title.x + title.width - 1);
      } else {
        expect(fragment.y).toBeGreaterThan(title.y + title.height);
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
