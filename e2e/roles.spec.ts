import type { Page } from "@playwright/test";
import { expect, expectA11y, expectEmber, open, test } from "./fixtures";

/**
 * Сквозной сценарий за каждую роль (Q6, ADR-013, п. 3): вход через экран выбора роли, путь роли
 * по её разделам, на ключевых экранах — EMBER и axe. Консоль без ошибок проверяет оснастка.
 */

async function chooseRole(page: Page, role: RegExp) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("dialog").getByRole("button", { name: role }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.locator("main").waitFor();
}

async function checkScreen(page: Page, name: string) {
  await expectEmber(page, name);
  await expectA11y(page, name);
}

test("руководитель: что требует решения → объект → история", async ({ page }) => {
  await chooseRole(page, /Руководитель/);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Требует решения" })).toBeVisible();
  await checkScreen(page, "дашборд");

  await open(page, "/projects");
  await checkScreen(page, "реестр объектов");
  await page.locator("main").getByText("Северная Корона").first().click();
  await expect(page).toHaveURL(/\/projects\/p-korona/);
  await open(page, "/projects/p-korona");
  await checkScreen(page, "карточка объекта");

  await open(page, "/projects/p-korona/timeline");
  await expect(page.getByRole("heading", { name: /Решения/ }).first()).toBeVisible();
  await checkScreen(page, "история и решения");
});

test("снабжение: запрос поставщикам → сравнение → решение → поставка", async ({ page }) => {
  await chooseRole(page, /Снабжение/);
  await expect(page).toHaveURL(/\/projects\/p-korona\/procurement/);
  await checkScreen(page, "закупки");

  await open(page, "/projects/p-korona/materials?purchase=none");
  await checkScreen(page, "материалы");
  await page.locator("[data-tour=create-request]:visible:not([disabled])").first().click();
  const dialog = page.getByRole("dialog");
  for (let step = 0; step < 3; step += 1) {
    await dialog.getByRole("button", { name: /^Далее/ }).click();
  }
  await dialog.getByRole("button", { name: /^Отправить/ }).click();
  await expect(page.locator("[data-sonner-toast]", { hasText: /Запрос .+ создан/ })).toBeVisible();

  await open(page, "/projects/p-korona/procurement/sr-323");
  await checkScreen(page, "сравнение предложений");
  await page.getByRole("button", { name: "Зафиксировать решение" }).first().click();
  await page
    .getByRole("dialog")
    .locator("textarea")
    .fill("Лучшая цена и полный объём по спецификации");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Зафиксировать", exact: true })
    .click();
  await expect(
    page.locator("[data-sonner-toast]", { hasText: "Решение зафиксировано" }),
  ).toBeVisible();

  await open(page, "/projects/p-korona/deliveries");
  await expect(page.getByText("Ожидается").first()).toBeVisible();
  await checkScreen(page, "поставки");
});

test("ПТО: спецификация → подтвердить → исправить → в истории", async ({ page }) => {
  await chooseRole(page, /ПТО/);
  await expect(page).toHaveURL(/\/projects\/p-korona\/documents/);
  await checkScreen(page, "документация");

  await open(page, "/projects/p-korona/documents/pd-korona-spec");
  const list = page.locator("[data-position-id]").first();
  await list.waitFor();
  await checkScreen(page, "проверка позиций");
  await page
    .getByRole("button", { name: /Требуют внимания/ })
    .first()
    .click();
  await page.locator("[data-position-id]").first().click();
  await page.getByRole("button", { name: "Подтвердить", exact: true }).first().click();
  await page.locator("[data-position-id]").first().click();
  await page.getByRole("button", { name: "Исправить", exact: true }).first().click();
  await page.locator("input[inputmode=decimal]").first().fill("12");
  await page
    .getByRole("button", { name: /Сохранить/ })
    .first()
    .click();

  await open(page, "/projects/p-korona/timeline");
  await expect(page.getByText(/Исправлено|исправлен/).first()).toBeVisible();
});

test("прораб: свой объект → отчёт с площадки → принять объём", async ({ page }) => {
  await chooseRole(page, /Прораб/);
  await expect(page).toHaveURL(/\/projects\/p-korona\/field-reports/);
  await open(page, "/projects/p-korona/field-reports");
  await checkScreen(page, "отчёты с площадки");
  await page.getByRole("button", { name: "Принять", exact: true }).first().click();
  await expect(page.locator("[data-sonner-toast]", { hasText: "Отчёт принят" })).toBeVisible();

  // В реестре прораба — только его объект
  await open(page, "/projects");
  const registry = page.locator("main");
  await expect(registry.getByText("Северная Корона").first()).toBeVisible();
  await expect(registry.getByText("Меридиан")).toHaveCount(0);
});

test("директор: дашборд → реестр → выгрузка, без кнопок записи", async ({ page }) => {
  await chooseRole(page, /Директор/);
  await expect(page).toHaveURL(/\/$/);
  await checkScreen(page, "дашборд директора");

  await open(page, "/projects");
  const download = page.waitForEvent("download");
  await page.locator("[data-tour=export]:visible").first().click();
  expect((await download).suggestedFilename()).toMatch(/^Объекты_.*\.xlsx$/);
  await expect(page.getByRole("button", { name: "Добавить объект" })).toHaveCount(0);

  await open(page, "/projects/p-korona/procurement");
  await expect(page.getByRole("button", { name: /Создать запрос/ })).toHaveCount(0);
  await open(page, "/access");
  await checkScreen(page, "права доступа");
});
