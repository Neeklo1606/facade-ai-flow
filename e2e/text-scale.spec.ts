import { expect, open, test } from "./fixtures";

/**
 * Масштаб текста 130 % на 390 (ADR-045, 3.1 и V10): размер шрифта браузера увеличен, шкала
 * в rem растёт вместе с ним, раскладка не ломается: страница не уезжает вбок, текст токенов
 * действительно крупнее.
 */
const SCREENS = [
  "/gas/moderation",
  "/gas/entries",
  "/gas/reports",
  "/gas/objects",
  // «Графит» (ADR-052, ADR-053): новые и перестроенные экраны
  "/gas/overview",
  "/gas/estimates",
  "/gas/admin",
  "/today",
  "/projects",
];

test.describe("масштаб текста 130 % @mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, persona: "e-sokolov" });

  for (const path of SCREENS) {
    test(`${path} без горизонтальной прокрутки @mobile`, async ({ page }) => {
      await open(page, path);
      await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
      await page.waitForTimeout(200);
      const body = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
      expect(body, "основной текст 15 × 1,3").toBeGreaterThan(19);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `переполнение на ${path}`).toBeLessThanOrEqual(1);
    });
  }
});
