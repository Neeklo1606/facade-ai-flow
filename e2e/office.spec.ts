import { expect, expectA11y, open, test } from "./fixtures";

/**
 * Кабинет компании (ADR-039): отдельная поверхность, права на сервере, ключей на экране нет.
 */

test.describe("руководитель", () => {
  test.use({ persona: "e-sokolov" });

  test("кабинет открывается из меню, справочники и подключения на месте", async ({ page }) => {
    await open(page, "/office");
    await expect(page.getByRole("heading", { name: "Кабинет компании", level: 1 })).toBeVisible();
    await page
      .getByRole("link", { name: /Подключения/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Подключения" })).toBeVisible();
    for (const title of [
      "Модель разбора",
      "Распознавание речи",
      "Telegram",
      "Вход по телефону",
      "Приём заявок с сайта",
      "Личный контур заказчика",
    ]) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }
    // Сервер тестов без приёма заявок и с ключом личной ссылки (ADR-051, ADR-047)
    await expect(page.getByText(/^Не подключён: форма честно ведёт в Telegram/)).toBeVisible();
    await expect(page.getByText(/^Личная ссылка открывает данные заказчика/)).toBeVisible();
    await expect(page.locator("main")).not.toContainText("e2e-client-key");
    // Тот же адрес сервер отдаёт руководителю: отказ прорабу ниже — право, а не поломка
    const allowed = await page.request.get("/api/office/connections");
    expect(allowed.status()).toBe(200);
    // Значений ключей на экране нет: только имена переменных
    await expect(page.locator("main")).not.toContainText(/sk-|Bearer/u);
    await expectA11y(page, "подключения");
  });

  test("прежние адреса ведут в кабинет", async ({ page }) => {
    await page.goto("/catalogs", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/office\/catalogs$/u);
    await page.goto("/integrations", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/office\/connections$/u);
  });
});

test.describe("прораб", () => {
  test.use({ persona: "e-gareev" });

  test("в кабинет не пускает сервер, а не скрытый пункт меню", async ({ page }) => {
    // Открыть любой экран: вкладка получает куку персоны прораба
    await open(page, "/today");
    // Кука персоны выдаётся после загрузки вкладки: ждём, пока вкладка вошла за прораба
    await page.waitForLoadState("networkidle");
    const denied = await page.request.get("/api/office/connections");
    expect(denied.status()).toBe(403);
    await page.goto("/office/connections", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-screen='no-access']").first()).toBeVisible();
  });
});
