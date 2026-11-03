import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * «Отчёт заполняется сам» (финальный промт, 1.2): в режиме «Проверять только с замечаниями»
 * запись бригадира без замечаний без единого действия менеджера попадает в журнал с меткой
 * «Принята автоматически», в табель и в черновик файла недели. Запись с пересечением ждёт
 * менеджера. Автоприём возвращается в очередь до закрытия недели.
 */

const WIDTHS = [
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
] as const;

async function flaggedMode(page: Page) {
  await open(page, "/gas/admin");
  await gasRole(page, "Менеджер");
  await open(page, "/gas/admin");
  const flagged = page.getByRole("radio", { name: /^Проверять только с замечаниями/ });
  await flagged.click();
  await expect(flagged).toBeChecked();
}

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
  const heading = page.getByRole("heading", { name: /Запись ГЗ-\d+ принята/ });
  await expect(heading).toBeVisible();
  return /ГЗ-\d+/.exec((await heading.textContent()) ?? "")![0];
}

for (const width of WIDTHS) {
  test.describe(`автоприём ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("без замечаний: в журнал, табель и черновик без менеджера; с пересечением в очередь", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await flaggedMode(page);

      // Бригадир: запись без замечаний на объект из графика, вечер без пересечений
      await gasRole(page, "Бригадир");
      await expect(page).toHaveURL(/\/gas\/brigade/);
      const clean = await sendTime(page, "18:00–21:00");
      await expect(
        page.getByText("Замечаний нет: запись принята и учтена в отчёте недели."),
      ).toBeVisible();
      await page.getByRole("button", { name: "Готово" }).click();

      // С пересечением: 08:00–17:00 рядом с 08:10–11:40 (ГЗ-00095) ждёт менеджера
      const flagged = await sendTime(page, "8:00–17:00", "ОБ-101");
      await expect(page.getByText(/Ждёт проверки/)).toBeVisible();

      // Менеджер: в очереди только запись с пересечением
      await gasRole(page, "Менеджер");
      await open(page, "/gas/moderation");
      await expect(page.locator("[data-queue-card]").filter({ hasText: flagged })).toHaveCount(1);
      await expect(page.locator("[data-queue-card]").filter({ hasText: clean })).toHaveCount(0);

      // Журнал: «Принята автоматически», вернуть можно до закрытия недели
      await open(page, `/gas/entries?open=${encodeURIComponent(clean)}`);
      await page.getByText(clean).first().click();
      const panel = page
        .locator("#review-title")
        .locator("xpath=ancestor::*[self::aside or @role='dialog'][1]");
      await expect(panel.getByText("Принята автоматически").first()).toBeVisible();

      // Черновик файла недели уже содержит запись
      if (!width.hasTouch) {
        await open(page, "/gas/tabel");
        await page.locator('[data-tour="export"]').click();
        const [draft] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("menuitem", { name: /Excel черновик/ }).click(),
        ]);
        const book = XLSX.read(readFileSync((await draft.path())!));
        const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["Записи"]!, { header: 1 });
        const numbers = rows.map((row) => String(row[0] ?? ""));
        expect(numbers).toContain(clean);
      }
    });

    test("автоприём возвращается в очередь кнопкой «Вернуть в проверку»", async ({ page }) => {
      test.setTimeout(120_000);
      await flaggedMode(page);
      await gasRole(page, "Бригадир");
      const clean = await sendTime(page, "18:00–21:00");
      await gasRole(page, "Менеджер");
      await open(page, "/gas/entries");
      await page.getByText(clean).first().click();
      await page.getByRole("button", { name: "Вернуть в проверку" }).click();
      await expect(page.getByText(`${clean} снова в очереди проверки`)).toBeVisible();
      await open(page, "/gas/moderation");
      await expect(page.locator("[data-queue-card]").filter({ hasText: clean })).toHaveCount(1);
    });
  });
}
