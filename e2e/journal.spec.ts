import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";

/**
 * «Журнал» (ADR-061, 10; раздел 4.4) и «неизвестное не ноль» (2.3, п. 2): таблица с флажками,
 * колонками состава и чел.-ч, группировкой по дням и страницами; действия с выбранными
 * неактивны без выбора; массовое принятие и возврат на уточнение; клик по строке открывает
 * ту же деталь, что в «Проверке».
 */

const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });

const row = (page: Page, number: string) => page.locator("tr[data-entry-row]", { hasText: number });

test.describe("журнал 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("таблица: колонки, группы по дням, страницы, шестерёнка", async ({ page }) => {
    await open(page, "/gas/entries");
    const table = page.getByRole("table", { name: "Журнал записей" });
    for (const title of ["Дата", "№", "Бригада", "Объект", "Начало", "Часы", "Состав", "Чел.-ч"])
      await expect(table.getByRole("columnheader", { name: title, exact: true })).toBeVisible();
    // Группа дня с итогом: «Сб 03.10 · 6 записей · …»
    await expect(table.getByRole("rowheader").first()).toContainText(/ · \d+ запис/);
    // Строки 40 px
    const box = (await page.locator("tr[data-entry-row]").first().boundingBox())!;
    expect(Math.round(box.height)).toBe(40);

    await expect(page.getByTestId("journal-range")).toHaveText(/^1–25 из \d+$/);
    await page.getByRole("button", { name: "50", exact: true }).click();
    await expect(page.getByTestId("journal-range")).toHaveText(/^1–50 из \d+$/);
    await expect(page.locator("tr[data-entry-row]")).toHaveCount(50);

    await expect(table.getByRole("columnheader", { name: "Канал" })).toHaveCount(0);
    await page.getByRole("button", { name: "Настроить колонки" }).click();
    await page.getByRole("checkbox", { name: "Канал" }).check();
    await page.keyboard.press("Escape");
    await expect(table.getByRole("columnheader", { name: "Канал" })).toBeVisible();
    // Ничего не уезжает вбок
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  });

  test("действия неактивны без выбора; массовое принятие с отменой", async ({ page }) => {
    await open(page, "/gas/entries");
    const toolbar = page.getByRole("toolbar", { name: "Панель журнала" });
    await expect(toolbar.getByRole("button", { name: /^Принять/ })).toBeDisabled();
    await expect(toolbar.getByRole("button", { name: "На уточнение" })).toBeDisabled();

    await page.getByRole("checkbox", { name: "Выбрать ГЗ-00096" }).check();
    await page.getByRole("checkbox", { name: "Выбрать ГЗ-00099" }).check();
    await expect(toolbar).toContainText("Выбрано 2");
    await toolbar.getByRole("button", { name: "Принять 2" }).click();
    const done = toast(page, "Принято 2 записи");
    await expect(done).toBeVisible();
    await expect(row(page, "ГЗ-00096")).toContainText("Подтверждено");
    await expect(row(page, "ГЗ-00099")).toContainText("Подтверждено");
    await expect(toolbar.getByRole("button", { name: /^Принять/ })).toBeDisabled();

    await done.getByRole("button", { name: "Отменить" }).click();
    await expect(row(page, "ГЗ-00096")).toContainText("Ожидает проверки");
  });

  test("массовый возврат на уточнение требует вопрос", async ({ page }) => {
    await open(page, "/gas/entries");
    await page.getByRole("checkbox", { name: "Выбрать ГЗ-00098" }).check();
    await page.getByRole("button", { name: "На уточнение" }).click();
    const dialog = page.getByRole("dialog", { name: /Вернуть на уточнение 1 запись/ });
    const send = dialog.getByRole("button", { name: "Вернуть бригадирам" });
    await expect(send).toBeDisabled();
    await dialog.getByRole("button", { name: "Уточните начало и окончание" }).click();
    await send.click();
    await expect(toast(page, "На уточнении 1 запись")).toBeVisible();
    await expect(row(page, "ГЗ-00098")).toContainText("Требует уточнения");
  });

  test("клик по строке открывает ту же деталь, что в «Проверке»", async ({ page }) => {
    await open(page, "/gas/entries");
    await row(page, "ГЗ-00098").click();
    const panel = page.getByRole("dialog").last();
    for (const name of ["Что проверить", "Данные бригадира", "Расчёт", "Стоимость", "История"])
      await expect(panel.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(panel.locator('[data-tour="review-confirm"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("неизвестное не ноль: «не рассчитано» ведёт к записям без состава", async ({ page }) => {
    await open(page, "/gas/week");
    const man = page.getByRole("listitem").filter({ hasText: "Человеко-часы" });
    await expect(man).toContainText("не рассчитано");
    await expect(man).not.toContainText("0 чел.-ч");
    await man.getByRole("link", { name: "Показать записи" }).click();
    await expect(page).toHaveURL(/\/gas\/entries\?crew=none/);
    await expect(page.getByRole("list", { name: "Активные фильтры" })).toContainText("Без состава");
    const first = page.locator("tr[data-entry-row]").first();
    await expect(first.getByLabel("Не рассчитано: состав не указан")).toBeVisible();
  });
});

test.describe("журнал 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("список по дням, деталь листом, без прокрутки вбок", async ({ page }) => {
    await open(page, "/gas/entries");
    await expect(page.locator("main h2").first()).toContainText(/ · \d+ запис/);
    await page.locator("[data-queue-card]", { hasText: "ГЗ-00098" }).click();
    await expect(page.locator("[data-review-sheet]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Что проверить", exact: true })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
