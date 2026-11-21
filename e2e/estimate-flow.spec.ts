import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, expectA11y, open, test } from "./fixtures";
import { mobileCheck } from "./mobile-checks";

/**
 * Путь «смета → карточки → объект → табель» (ADR-080). Синтетическая ГРАНД-смета собирается bun
 * (gas-estimate-file.cli.ts): файлов заказчика в репозитории нет. Мастер открывается с «Обзора»,
 * показывает итоги разбора по шагам и карточки, «Создать объект» ведёт на страницу объекта
 * с полосой пути, «Табель объекта» открывает табель с поиском по объекту.
 */
function grandXlsx(): string {
  const path = join(tmpdir(), `gas-estimate-flow-${process.pid}.xlsx`);
  execFileSync("bun", ["run", "e2e/gas-estimate-file.cli.ts", path]);
  return path;
}

test.describe("смета → табель", () => {
  test("мастер с «Обзора»: итоги разбора, карточки, объект, табель", async ({ page }) => {
    await open(page, "/gas/overview");
    await page.getByTestId("estimate-flow-open").click();
    const flow = page.getByTestId("estimate-flow");
    await expect(flow).toBeVisible();
    await page.getByTestId("estimate-flow-input").setInputFiles(grandXlsx());

    // Итоги разбора: пять шагов, у каждого тон и текст из файла
    const checks = page.getByTestId("estimate-flow-checks");
    await expect(checks).toBeVisible({ timeout: 20_000 });
    await expect(checks.locator("li")).toHaveCount(5);
    await expect(checks).toContainText("2 раздела");
    await expect(checks).toContainText("Объект");
    await expectA11y(page, "мастер сметы: итоги разбора");

    // Карточки разделов из файла
    await expect(flow.getByTestId("estimate-section")).toHaveCount(2);
    await expect(flow.getByTestId("estimate-section").first()).toContainText("Монтаж");

    // Объект: новый, создаём из шапки
    await flow.getByTestId("estimate-create-object").click();
    // Поля предзаполнены из шапки; синтетическая смета без шапки, задаём свои
    await flow.getByRole("textbox", { name: "Адрес или название" }).fill("Е2Е, ул. Сметная, 1");
    await flow.getByRole("textbox", { name: "Номер объекта" }).fill("E2E-080");
    await flow.getByTestId("estimate-create-confirm").click();

    // Страница объекта с полосой пути: смета пройдена, текущий шаг — стоимость
    await expect(page).toHaveURL(/\/gas\/objects\//, { timeout: 15_000 });
    const path = page.getByTestId("object-path");
    await expect(path).toBeVisible();
    await expect(path.locator("li").first()).toHaveAttribute("data-state", "done");
    await expect(path.locator("li").nth(1)).toHaveAttribute("data-state", "current");
    await expect(page.getByTestId("object-sections")).toContainText("Монтаж");
    await expectA11y(page, "страница объекта: полоса пути");

    // Табель объекта: поиск заполнен подписью объекта
    await page.getByTestId("object-path-tabel").click();
    await expect(page).toHaveURL(/\/gas\/tabel\?q=/);
    expect(decodeURIComponent(new URL(page.url()).searchParams.get("q") ?? "")).toBe(
      "Е2Е, ул. Сметная, 1",
    );
    await expect(page.getByRole("searchbox").first()).toHaveValue("Е2Е, ул. Сметная, 1");
  });

  test("весь путь: смета → бригады → время бригадира → строка раздела в табеле", async ({
    page,
  }) => {
    await open(page, "/gas/objects");
    await page.getByTestId("estimate-flow-open").click();
    await page.getByTestId("estimate-flow-input").setInputFiles(grandXlsx());
    const flow = page.getByTestId("estimate-flow");
    await expect(page.getByTestId("estimate-flow-checks")).toBeVisible({ timeout: 20_000 });
    await flow.getByTestId("estimate-create-object").click();
    await flow.getByRole("textbox", { name: "Адрес или название" }).fill("Липецк, ул. Путевая, 80");
    await flow.getByRole("textbox", { name: "Номер объекта" }).fill("ПТ-080");
    await flow.getByTestId("estimate-create-confirm").click();
    await expect(page).toHaveURL(/\/gas\/objects\//, { timeout: 15_000 });

    // Оба раздела — бригаде 1: шаг «Бригады» закрыт
    const sections = page.getByTestId("object-sections");
    for (let i = 0; i < 2; i += 1) {
      await sections.getByRole("button", { name: "Назначить бригаду" }).nth(i).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox", { name: "Бригада" }).selectOption({ label: "Бригада 1" });
      await dialog.getByRole("button", { name: "Назначить", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    await expect(page.getByTestId("object-path").locator("li").nth(2)).toHaveAttribute(
      "data-state",
      "done",
    );

    // Бригадир 1 вносит время на объект из сметы, раздел выбирает из назначенных
    await open(page, "/gas");
    await page.getByTestId("gas-role-foreman").click();
    await expect(page).toHaveURL(/\/gas\/brigade$/);
    await page.getByRole("button", { name: "Добавить время" }).first().click();
    await page
      .getByRole("button", { name: /^Объект/ })
      .first()
      .click();
    await page.getByText("Липецк, ул. Путевая, 80").first().click();
    await page
      .getByRole("button", { name: /^Раздел/ })
      .first()
      .click();
    await page
      .getByText(/Монтаж стальных/)
      .last()
      .click();
    await page.getByRole("textbox", { name: "Время работы" }).fill("8-17");
    await page.getByRole("button", { name: "Проверить" }).click();
    await expect(page.getByText("Проверьте перед отправкой")).toBeVisible();
    await page.getByRole("button", { name: "Отправить" }).click();

    // Менеджер: в табеле строка раздела под адресом объекта
    await open(page, "/gas");
    await page.getByTestId("gas-role-manager").click();
    await open(page, `/gas/tabel?q=${encodeURIComponent("Путевая")}`);
    const address = page.locator('[data-row-kind="address"]', { hasText: "Путевая, 80" });
    await expect(address).toHaveCount(1);
    await expect(page.locator('[data-row-kind="section"]')).toHaveText([/Монтаж стальных/]);
  });

  test("бригадир не видит «Загрузить смету»", async ({ page }) => {
    await open(page, "/gas");
    await page.getByTestId("gas-role-foreman").click();
    await expect(page).toHaveURL(/\/gas\/brigade$/);
    await open(page, "/gas/objects");
    await expect(page.getByTestId("estimate-flow-open")).toHaveCount(0);
  });

  test("телефон: мастер из «Объектов» во весь экран, без переполнения @mobile", async ({
    page,
  }) => {
    await open(page, "/gas/objects");
    await page.getByTestId("estimate-flow-open").click();
    await page.getByTestId("estimate-flow-input").setInputFiles(grandXlsx());
    await expect(page.getByTestId("estimate-flow-checks")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("estimate-flow").getByTestId("estimate-section")).toHaveCount(2);
    const check = await mobileCheck(page);
    expect(check.overflow.offenders, "переполнение по ширине").toEqual([]);
    await expectA11y(page, "мастер сметы на телефоне");
  });
});
