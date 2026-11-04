import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Оболочка бригадира без сети (ADR-062, F7): «Сегодня» открылся с сетью один раз, потом
 * перезагрузка без сети показывает тот же экран из сервиса `public/sw.js`.
 */
test.describe("«Сегодня» без сети 390", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    // Без сети запрос контура к серверу падает, загрузчик берёт публичный набор: это ожидаемо
    expectedConsole: /ERR_INTERNET_DISCONNECTED/,
  });

  test("после первого открытия экран бригадира открывается без сети", async ({ page, context }) => {
    await open(page, "/gas/brigade");
    await gasRole(page, "Бригадир");
    await page.goto("/gas/brigade");
    await expect(page.locator('[data-tour="today-add"]:visible')).toHaveCount(1);
    // Сервис установлен и управляет вкладкой; второе открытие сохраняет страницу и файлы
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect(page.locator('[data-tour="today-add"]:visible')).toHaveCount(1);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('[data-tour="today-add"]:visible')).toHaveCount(1, {
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/\/gas\/brigade$/);

    // Запись без сети ложится в очередь на телефоне, при связи уходит сама
    await page.locator('[data-tour="today-add"]:visible').click();
    await page
      .getByRole("group", { name: "Начало" })
      .getByRole("button", { name: "08:00" })
      .click();
    await page
      .getByRole("group", { name: "Окончание" })
      .getByRole("button", { name: "17:00" })
      .click();
    await page.getByRole("button", { name: "Проверить" }).click();
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByRole("heading", { name: "Запись на телефоне" })).toBeVisible();
    await page.getByRole("button", { name: "Готово" }).click();
    await expect(page.getByText("Ждут отправки: 1")).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText(/Ждут отправки/)).toHaveCount(0, { timeout: 20_000 });
  });
});
