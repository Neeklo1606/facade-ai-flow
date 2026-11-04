import { expect, open, test } from "../fixtures";

/**
 * Кабинет заказчика (ADR-062, F6): сборка с `VITE_CABINET_ONLY=1` и названием заказчика
 * из `VITE_CABINET_CLIENT`. Запуск: `bun run test:cabinet` (своя сборка, вне конвейера).
 */
const CLIENT = process.env["CABINET_CLIENT"] ?? "ООО «Пример заказчика»";

test.describe("кабинет заказчика", () => {
  test("любой путь вне /gas ведёт в /gas", async ({ page }) => {
    for (const path of ["/", "/demo", "/projects", "/case/gas", "/office"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/gas\/?$/);
    }
  });

  test("вкладка «Учёт времени · <заказчик>», нет показа, лендинга и демо-меток", async ({
    page,
  }) => {
    await open(page, "/gas");
    await expect(page).toHaveTitle(`Учёт времени · ${CLIENT}`);
    const main = page.locator("main");
    await expect(page.getByRole("button", { name: "Показать за 3 минуты" })).toHaveCount(0);
    await expect(main).not.toContainText("Демо-подрядчик");
    await expect(main).not.toContainText("Демонстрация на");
    await expect(main).toContainText(CLIENT);

    for (const path of ["/gas/entries", "/gas/moderation", "/gas/estimates", "/gas/directory"]) {
      await open(page, path);
      await expect(page).toHaveTitle(`Учёт времени · ${CLIENT}`);
      await expect(page.locator("body")).not.toContainText("Демо-подрядчик");
      // Метки источника «Демо» и «Пример» рядом со значениями не выводятся
      await expect(page.locator("main").getByText(/^(Демо|Пример)$/)).toHaveCount(0);
    }
    await open(page, "/gas/more");
    await expect(page.getByRole("button", { name: /Сбросить демо/ })).toHaveCount(0);
  });

  test("сборка проверки без сервера помечена «Тестовый режим» (решение владельца 3)", async ({
    page,
  }) => {
    await open(page, "/gas");
    await expect(page.getByTestId("test-mode-bar")).toHaveText(
      "Тестовый режим: данные хранятся в этом браузере",
    );
  });
});
