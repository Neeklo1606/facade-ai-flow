import { expect, open, test } from "./fixtures";

/**
 * Тема оформления (ADR-017): выбор из трёх положений, память между загрузками, «как в системе»
 * и печать. Проверяется тем, что видно: атрибутом на <html> и вычисленными цветами.
 */

const theme = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.dataset["theme"]);

const pageBackground = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.querySelector(".app-window")!).backgroundColor);

/**
 * Светлота цвета по WCAG: 0 — чёрный, 1 — белый. Проверка держится за смысл «фон стал светлым»,
 * а не за конкретное значение палитры: палитра меняется решениями вроде ADR-027, и прибитое
 * `rgb(244, 242, 238)` ловило бы не ошибку, а перекраску.
 */
const luminance = (page: import("@playwright/test").Page, color: string) =>
  page.evaluate((value) => {
    const [r = 0, g = 0, b = 0] = (value.match(/\d+/gu) ?? []).map(Number);
    const lin = (channel: number) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }, color);

test.describe("тема оформления", () => {
  test.use({ persona: "e-sokolov" });

  // Умолчание демонстрации — светлая тема (решение владельца, ADR-030, п. 1).
  // До 16.10 здесь ожидалась тёмная: поменялось решение, а не проверка под код
  test("демонстрация открывается светлой", async ({ page }) => {
    await open(page, "/projects");
    expect(await theme(page)).toBe("light");
  });

  test("выбор светлой темы переживает перезагрузку", async ({ page }) => {
    await open(page, "/projects");
    await page.getByRole("button", { name: /Тема оформления/ }).click();
    await page.getByRole("menuitemradio", { name: "Светлая" }).click();
    await expect.poll(() => theme(page)).toBe("light");
    // Светлая тема — это не только атрибут: фон окна становится светлым и равен токену --void
    const background = await pageBackground(page);
    expect(await luminance(page, background)).toBeGreaterThan(0.8);
    // Токен читаем как цвет, а не как строку: браузер сам приведёт #rrggbb к rgb()
    const token = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--void)";
      document.body.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    expect(background).toBe(token);

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
    // Тёмную тему выбираем руками: умолчание демонстрации теперь светлое (ADR-030, п. 1)
    await page.getByRole("button", { name: /Тема оформления/ }).click();
    await page.getByRole("menuitemradio", { name: "Тёмная" }).click();
    await expect.poll(() => theme(page)).toBe("dark");

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
