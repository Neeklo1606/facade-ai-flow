import { expect, expectA11y, expectEmber, open, test } from "./fixtures";

/**
 * Главные окна продукта под теми же правилами, что и экраны (ADR-017, поправка 22.09.2026):
 * axe и одно оранжевое пятно, в обеих темах.
 *
 * Зачем отдельный файл: светлый прогон был ограничен `screens.spec.ts`, а экранов с открытым
 * диалогом там нет. Из-за этого нарушение контраста в окне «Зафиксировать решение» жило
 * в светлой теме и не попадало ни под один тест — его нашла независимая проверка, а не мы.
 */

test.describe("окна", () => {
  test.describe("руководитель проекта", () => {
    test.use({ persona: "e-sokolov" });

    test("зафиксировать решение по запросу", async ({ page }) => {
      await open(page, "/projects/p-korona/procurement/sr-323");
      await page.getByRole("button", { name: "Зафиксировать решение" }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectEmber(page, "окно решения");
      await expectA11y(page, "окно решения");
    });

    test("создать запрос поставщикам", async ({ page }) => {
      await open(page, "/projects/p-korona/materials?purchase=none");
      await page.getByRole("button", { name: "Создать запрос поставщикам" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectEmber(page, "окно запроса");
      await expectA11y(page, "окно запроса");
    });

    test("принять поставку", async ({ page }) => {
      // Поставка в пути из фикстур: панель открывается адресом, как в screens.spec
      await open(page, "/projects/p-korona/deliveries?delivery=dl-503");
      await page.getByRole("button", { name: "Поставка прибыла на объект" }).click();
      await page.getByRole("button", { name: "Принять поставку" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectEmber(page, "окно приёмки");
      await expectA11y(page, "окно приёмки");
    });
  });

  test.describe("снабжение", () => {
    test.use({ persona: "e-dorohov" });

    test("добавить материал в справочник", async ({ page }) => {
      await open(page, "/catalogs");
      await page.getByRole("button", { name: "Добавить материал" }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectEmber(page, "окно материала");
      await expectA11y(page, "окно материала");
    });
  });
});
