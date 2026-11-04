import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * «Как вчера» (финальный промт, 2.2; ADR-064): вчерашняя запись на объект сегодняшнего
 * графика повторяется за 2 касания; перерыв и люди свёрнуты строкой «как в прошлой записи».
 */
const WIDTHS = [
  { name: "375", viewport: { width: 375, height: 812 }, hasTouch: true },
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
] as const;

async function foreman(page: Page) {
  await open(page, "/gas");
  await gasRole(page, "Бригадир");
  await expect(page).toHaveURL(/\/gas\/brigade/);
}

for (const width of WIDTHS) {
  test.describe(`как вчера ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("вчерашняя запись повторяется за 2 касания", async ({ page }) => {
      await foreman(page);
      // Вчера: 07:00–15:00 с перерывом 30 на объект, который сегодня снова по графику
      await page.getByRole("button", { name: "Добавить время" }).click();
      await page.getByRole("radio", { name: /^Вчера/ }).click();
      await page.getByLabel("Время работы").fill("7-15");
      await expect(page.getByTestId("form-defaults")).toBeVisible();
      await page.getByRole("button", { name: "Изменить", exact: true }).click();
      await page.getByRole("radio", { name: "30", exact: true }).click();
      await page.getByRole("button", { name: "Проверить" }).click();
      await page.getByRole("button", { name: "Отправить" }).click();
      await page.getByRole("button", { name: "Готово" }).click();

      let taps = 0;
      const like = page.getByTestId("like-yesterday");
      await expect(like).toContainText("07:00–15:00");
      await like.click();
      taps += 1;
      await page.getByRole("button", { name: "Отправить" }).click();
      taps += 1;
      await expect(page.getByRole("heading", { name: /Запись ГЗ-\d+ принята/ })).toBeVisible();
      expect(taps, "касаний для записи «как вчера»").toBeLessThanOrEqual(2);
      await page.getByRole("button", { name: "Готово" }).click();
      // Сегодня по этому объекту уже есть запись: кнопки больше нет
      await expect(page.getByTestId("like-yesterday")).toHaveCount(0);
    });

    test("перерыв и люди по умолчанию как в прошлой записи, свёрнуты", async ({ page }) => {
      await foreman(page);
      await page.getByRole("button", { name: "Добавить время" }).click();
      const defaults = page.getByTestId("form-defaults");
      await expect(defaults).toContainText(/Перерыв \d+ мин · \d+ чел\./);
      await expect(page.getByRole("radiogroup", { name: "Перерыв, минут" })).toHaveCount(0);
      await defaults.getByRole("button", { name: "Изменить" }).click();
      await expect(page.getByRole("radiogroup", { name: "Перерыв, минут" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}
