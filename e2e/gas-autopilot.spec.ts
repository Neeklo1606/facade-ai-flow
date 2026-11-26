import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Автопилот проверки (ADR-070, бриф GAIKA_GAS_AUTOPILOT, разделы 3 и 7):
 * 1. Менеджер видит счётчик совпадения и включает «Автопилот» вторым нажатием ниже порога.
 * 2. Демо-время 18:00: бригадиру без записи по графику уходит напоминание (колокольчик и бот).
 * 3. Чистая запись бригадира принимается сама; в карточке правило и версия правил.
 * 4. Запись с пересечением не блокируется, а ждёт менеджера с причиной.
 */

const WIDTHS = [
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
] as const;

const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });

async function sendTime(page: Page, time: string, object?: string) {
  await page.getByRole("button", { name: "Добавить время" }).click();
  if (object) {
    await page.getByRole("button", { name: /^Объект/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(object) })
      .first()
      .click();
  }
  await page.getByLabel("Время работы").fill(time);
  await page.getByRole("button", { name: "Проверить" }).click();
  await page.getByRole("button", { name: "Отправить" }).click();
  const heading = page.getByRole("heading", { name: /Запись ГЗ-\d+ (принята|отправлена)/ });
  await expect(heading).toBeVisible();
  return /ГЗ-\d+/.exec((await heading.textContent()) ?? "")![0];
}

for (const width of WIDTHS) {
  test.describe(`автопилот ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("счётчик, включение ниже порога, напоминание в 18:00, авто-приём с правилом, спорная в очереди", async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await open(page, "/gas/admin");
      await gasRole(page, "Менеджер");
      await open(page, "/gas/admin");

      // 1. Счётчик совпадения виден до решения; по умолчанию «Проверять всё»
      await expect(page.getByTestId("agreement")).toContainText(
        "Совпадение авто-решений с решениями менеджера",
      );
      await expect(page.getByRole("radio", { name: /^Проверять всё/ })).toBeChecked();
      const pilot = page.getByRole("radio", { name: /^Автопилот/ });
      await pilot.click();
      // Ниже порога – отдельное подтверждение с числом
      const confirm = page.getByRole("alertdialog", { name: "Включить автопилот ниже порога" });
      await expect(confirm).toContainText("Совпадение");
      await confirm.getByRole("button", { name: "Включить автопилот" }).click();
      await expect(pilot).toBeChecked();

      // 2. Демо-время 18:00: у бригады 1 по графику ОБ-200 без записи
      await page.getByRole("button", { name: /^Сдвинуть время на 18:00/ }).click();
      await expect(toast(page, /Бригадиру: Нет записи времени/)).toBeVisible();

      // 3. Бригадир: чистая запись принимается сама
      await gasRole(page, "Бригадир");
      await expect(page).toHaveURL(/\/gas\/brigade/);
      const clean = await sendTime(page, "18:00–21:00");
      await expect(
        page.getByText("Замечаний нет: запись принята и учтена в отчёте недели."),
      ).toBeVisible();
      await page.getByRole("button", { name: "Готово" }).click();

      // 4. С пересечением: 08:00–17:00 рядом с 08:10–11:40 (ГЗ-00095) – не блок, а очередь
      const flagged = await sendTime(page, "8:00–17:00", "ОБ-101");
      await expect(page.getByText(/Ждёт проверки/)).toBeVisible();

      await gasRole(page, "Менеджер");
      await open(page, `/gas/entries?open=${encodeURIComponent(clean)}`);
      await page.getByText(clean).first().click();
      await expect(page.getByTestId("auto-decision")).toHaveText(
        "Принято автоматически: нет замечаний (правило clean-entry, версия 1)",
      );

      await open(page, "/gas/moderation");
      const card = page.locator("[data-queue-card]").filter({ hasText: flagged });
      await expect(card).toHaveCount(1);
      await card.click();
      await expect(page.getByTestId("auto-decision")).toContainText(
        "В очередь: пересечение времени",
      );
    });
  });
}
