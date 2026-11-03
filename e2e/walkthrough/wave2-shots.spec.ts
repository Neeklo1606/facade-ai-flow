import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, open, test } from "../fixtures";
import { gasRole } from "../gas-helpers";

/**
 * Снимки «до и после» волны 2 (финальный промт, проверка волны 2; ADR-064): домашний экран
 * каждой роли и форма бригадира на 390 и 1440. Метка в `WAVE2_LABEL` («before» / «after»),
 * папка — `WAVE2_OUT` (по умолчанию docs/design/wave-2). Запуск вне конвейера:
 * `npx playwright test -c playwright.walkthrough.config.ts wave2-shots`.
 */
const OUT = process.env["WAVE2_OUT"] ?? "docs/design/wave-2";
const LABEL = process.env["WAVE2_LABEL"] ?? "after";

const WIDTHS = [
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
] as const;

for (const width of WIDTHS) {
  test.describe(`снимки волны 2 ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("домашние экраны ролей и форма бригадира", async ({ page }) => {
      mkdirSync(OUT, { recursive: true });
      const snap = (name: string) =>
        page.screenshot({ path: join(OUT, `${LABEL}-${width.name}-${name}.png`) });

      await open(page, "/gas");
      await gasRole(page, "Бригадир");
      await expect(page).toHaveURL(/\/gas\/brigade/);
      await snap("1-brigadir-segodnya");
      await page.getByRole("button", { name: "Добавить время" }).click();
      await snap("2-brigadir-forma");

      await gasRole(page, "Менеджер");
      await open(page, "/gas/moderation");
      await snap("3-menedzher-proverka");
      await open(page, "/gas/directory");
      await snap("4-menedzher-spravochniki");

      await gasRole(page, "Руководитель");
      await open(page, "/gas/week");
      await snap("5-rukovoditel-nedelya");
    });
  });
}
