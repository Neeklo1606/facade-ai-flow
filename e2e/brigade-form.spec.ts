import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";
import type { Page } from "@playwright/test";

/**
 * Форма бригадира «Добавить время» (ADR-061, 9; раздел 4.1) на 390 и 1440:
 * - типичная запись за 5 касаний: «Добавить время», 08:00, 17:00, «Проверить», «Отправить»;
 * - 08:00–17:00 на объект, где уже есть 08:10–11:40 (ГЗ-00095): запись принята, менеджер
 *   видит признак «Пересечение времени»;
 * - «с 13 до 17» в поле «Время работы» — 13:00–17:00, а не 13:17;
 * - полный дубль не отправляется, есть «Открыть существующую запись».
 */

const WIDTHS = [
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
] as const;

async function signInForeman(page: Page) {
  await open(page, "/gas");
  await gasRole(page, "Бригадир");
  await expect(page).toHaveURL(/\/gas\/brigade/);
  await expect(page.getByRole("button", { name: "Добавить время" })).toBeVisible();
}

async function pickObject(page: Page, code: string) {
  await page.getByRole("button", { name: /^Объект/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp(code) })
    .first()
    .click();
}

for (const width of WIDTHS) {
  test.describe(`форма бригадира ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("типичная запись за 5 касаний", async ({ page }) => {
      await signInForeman(page);
      let taps = 0;
      const tap = async (locator: ReturnType<Page["getByRole"]>) => {
        await locator.click();
        taps += 1;
      };
      await tap(page.getByRole("button", { name: "Добавить время" }));
      await tap(page.getByRole("group", { name: "Начало" }).getByRole("button", { name: "08:00" }));
      await tap(
        page.getByRole("group", { name: "Окончание" }).getByRole("button", { name: "17:00" }),
      );
      await expect(page.getByTestId("time-decoded")).toHaveText("08:00–17:00 · 9 ч 00 мин");
      await tap(page.getByRole("button", { name: "Проверить" }));
      await expect(page.getByText("по 8 ч на человека")).toBeVisible();
      await tap(page.getByRole("button", { name: "Отправить" }));
      await expect(page.getByText("Принято сервером")).toBeVisible();
      await expect(page.getByRole("heading", { name: /Запись ГЗ-\d+ принята/ })).toBeVisible();
      expect(taps, "касаний для типичной записи").toBeLessThanOrEqual(5);
      await expect(page.locator("main")).not.toContainText("₽");

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test("08:00–17:00 рядом с 08:10–11:40 принята с признаком «Пересечение»", async ({ page }) => {
      await signInForeman(page);
      await page.getByRole("button", { name: "Добавить время" }).click();
      await pickObject(page, "ОБ-101");
      // Уже внесённое — серая строка над полем, не запрет
      await expect(page.getByTestId("busy-line")).toContainText("уже внесено: 08:10–11:40, ОБ-101");
      await page.getByLabel("Время работы").fill("8:00–17:00");
      await expect(page.getByTestId("time-decoded")).toHaveText("08:00–17:00 · 9 ч 00 мин");
      await page.getByRole("button", { name: "Проверить" }).click();
      const marks = page.getByRole("list", { name: "Пометки для менеджера" });
      await expect(marks).toContainText("Пересечение времени: ГЗ-00095 08:10–11:40");
      await expect(marks).toContainText("Повторный выезд");
      await page.getByRole("button", { name: "Отправить" }).click();
      await expect(page.getByText("Принято сервером")).toBeVisible();
      const heading = await page
        .getByRole("heading", { name: /Запись ГЗ-\d+ принята/ })
        .textContent();
      const number = /ГЗ-\d+/.exec(heading ?? "")![0];

      // Менеджер видит запись в очереди с признаком пересечения
      await gasRole(page, "Менеджер");
      await expect(page).toHaveURL(/\/gas\/moderation$/);
      const card = page.locator("[data-queue-card]").filter({ hasText: number });
      await expect(card).toContainText("Пересечение времени");
    });

    test("«с 13 до 17» — 13:00–17:00, полный дубль не отправляется", async ({ page }) => {
      await signInForeman(page);
      await page.getByRole("button", { name: "Добавить время" }).click();
      await page.getByLabel("Время работы").fill("с 13 до 17");
      await expect(page.getByTestId("time-decoded")).toHaveText("13:00–17:00 · 4 ч 00 мин");
      await page.getByLabel("Время работы").fill("с 22 до 6");
      await expect(page.getByTestId("time-decoded")).toContainText("Работа через полночь?");

      // Полный дубль ГЗ-00095: тот же объект, день и интервал
      await pickObject(page, "ОБ-101");
      await page.getByLabel("Время работы").fill("8:10-11:40");
      await page.getByRole("button", { name: "Проверить" }).click();
      await expect(page.getByRole("alert")).toContainText("Такая запись уже есть: ГЗ-00095");
      await expect(page.getByRole("button", { name: "Отправить" })).toHaveCount(0);
      await page.getByRole("button", { name: "Открыть существующую запись" }).click();
      await expect(page.locator('[data-focused="true"]')).toContainText("ГЗ-00095");
    });
  });
}
