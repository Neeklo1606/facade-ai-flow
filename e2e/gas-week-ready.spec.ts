import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * «Неделя готова к закрытию» (финальный промт, 1.5; ADR-063): в демо сегодня суббота 03.10,
 * после пятницы 18:00 руководитель видит число записей и замечаний и скачивает черновик.
 */
for (const width of [
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
] as const) {
  test.describe(`неделя готова ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("плашка с числом записей и замечаний, черновик скачивается", async ({ page }) => {
      await open(page, "/gas");
      await gasRole(page, "Руководитель");
      await open(page, "/gas/week");
      const ready = page.getByTestId("week-ready");
      await expect(ready).toContainText(/Неделя готова к закрытию: \d+ запис\S*, \d+ замечани/);
      const [draft] = await Promise.all([
        page.waitForEvent("download"),
        ready.getByRole("button", { name: "Скачать черновик" }).click(),
      ]);
      expect(draft.suggestedFilename()).toMatch(/черновик/i);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}
