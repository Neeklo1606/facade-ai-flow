import { expect, open, test } from "./fixtures";

/**
 * Тема оформления (ADR-017): выбор из трёх положений, память между загрузками, «как в системе»
 * и печать. Проверяется тем, что видно: атрибутом на <html> и вычисленными цветами.
 */

const theme = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.dataset["theme"]);

const pageBackground = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.querySelector(".app-window")!).backgroundColor);

test.describe("тема оформления", () => {
  test.use({ persona: "e-sokolov" });

  test("демонстрация открывается тёмной", async ({ page }) => {
    await open(page, "/projects");
    expect(await theme(page)).toBe("dark");
  });

  test("выбор светлой темы переживает перезагрузку", async ({ page }) => {
    await open(page, "/projects");
    await page.getByRole("button", { name: /Тема оформления/ }).click();
    await page.getByRole("menuitemradio", { name: "Светлая" }).click();
    await expect.poll(() => theme(page)).toBe("light");
    // Светлая тема — это не только атрибут: фон окна становится светлым
    expect(await pageBackground(page)).toBe("rgb(244, 242, 238)");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("main").waitFor();
    expect(await theme(page)).toBe("light");
  });

  test("«как в системе» слушает настройку системы", async ({ page }) => {
    await open(page, "/projects");
    await page.getByRole("button", { name: /Тема оформления/ }).click();
    await page.getByRole("menuitemradio", { name: "Как в системе" }).click();

    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => theme(page)).toBe("light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => theme(page)).toBe("dark");
  });
});

test.describe("печать", () => {
  test.use({ persona: "e-sokolov" });

  test("реестр печатается светлым даже из тёмной темы", async ({ page }) => {
    await open(page, "/projects");
    expect(await theme(page)).toBe("dark");

    await page.emulateMedia({ media: "print" });
    // Бумага белая независимо от выбранной темы (ADR-017, п. 8)
    expect(await pageBackground(page)).toBe("rgb(255, 255, 255)");
    // Текст на бумаге — чёрный, а не «почти белый» из тёмной темы
    const ink = await page.evaluate(
      () => getComputedStyle(document.querySelector(".app-window")!).color,
    );
    expect(ink).toBe("rgb(0, 0, 0)");
    // Оболочка на листе не печатается: меню и шапка
    await expect(page.locator("[data-sidebar='app']")).toBeHidden();
    await expect(page.locator("header.content-header")).toBeHidden();
    // Содержимое остаётся
    await expect(page.getByRole("table").first()).toBeVisible();
  });
});
