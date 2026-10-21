import type { Locator, Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";

/**
 * Полный показ «gas-week» (ADR-044, F3) одной сессией: стартовый экран → бот бригадира →
 * проверка менеджером → строка в недельном отчёте → Excel → «Готово». Роль переключается
 * кнопкой полосы показа. Итог шага 4 в отчёте: 14 700 ₽, 2,50 ч, 5 880 ₽/ч.
 */

const WIDTHS = [
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
] as const;

const FILE = "Выработка_бригад_28.09-03.10.2026.xlsx";

test.describe.configure({ timeout: 180_000 });

/*
 * Полоса показа: под шапкой экрана, а пока открыта карточка записи — строкой под шапкой
 * карточки (ADR-045, 4.4). Берётся та, что видна сейчас.
 */
const dock = (page: Page) =>
  page.locator("[data-gas-show-dock], [data-gas-show-inline]").filter({ visible: true }).first();
const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");

/** Ответ на последнее сообщение бота */
async function answer(bot: Locator, name: string | RegExp) {
  await bot
    .locator("[data-stage]")
    .getByRole("button", typeof name === "string" ? { name, exact: true } : { name })
    .click();
}

for (const width of WIDTHS) {
  test.describe(`полный показ ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("от стартового экрана до файла и «Готово»", async ({ page }) => {
      await open(page, "/gas");
      await page.getByRole("button", { name: /Пройти показ/ }).click();
      await expect(page).toHaveURL(/\/gas\/foreman/);
      await expect(dock(page)).toContainText("1/6");

      // 1–2. Бригадир: ОБ-200, сегодня, 12:00–14:30, без перерыва, отправить
      const bot = page.locator('[data-tour="bot"]');
      await answer(bot, "Внести время");
      await answer(bot, /ул\. Демо, 200/);
      await answer(bot, /^Сегодня, 03\.10/);
      await answer(bot, /^12:00/);
      await answer(bot, /^14:30/);
      await answer(bot, /^0 мин/);
      await expect(bot.getByTestId("bot-total")).toHaveText("150 мин = 2,50 ч");
      await answer(bot, "Отправить");
      await expect(bot).toContainText(/Запись ГЗ-\d{5} принята, ждёт проверки/);
      await expect(dock(page)).toContainText("3/6");

      // 3. Менеджер: полоса переключает роль и открывает запись
      await dock(page)
        .getByRole("button", { name: /Как менеджер проверки/ })
        .click();
      await expect(page).toHaveURL(/\/gas\/moderation\?open=/);
      const confirm = page.locator('[data-tour="review-confirm"]:visible').first();
      await expect(confirm).toBeVisible();
      await confirm.click();
      await expect(page.locator("[data-sonner-toast]", { hasText: "Подтверждено" })).toBeVisible();
      await expect(dock(page)).toContainText("4/6");

      // 4. Руководитель: строка объекта подсвечена, цифры посчитаны от минут
      await dock(page)
        .getByRole("button", { name: /Как руководитель/ })
        .click();
      await expect(page).toHaveURL(/\/gas\/reports\?highlight=/);
      const row = page.locator('[data-tour="report-row"]:visible').first();
      await expect(row).toBeVisible();
      const text = plain(await row.innerText());
      expect(text).toContain("14 700 ₽");
      expect(text).toContain("2,50");
      expect(text).toContain("5 880");
      await expect(dock(page)).toContainText("5/6");

      // 5. Excel: шаг засчитывается событием download
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.locator('[data-tour="export"]').click(),
      ]);
      expect(download.suggestedFilename()).toBe(FILE);

      // 6. Финал: что создано за показ
      await dock(page)
        .getByRole("button", { name: /Итог показа/ })
        .click();
      await expect(page).toHaveURL(/\/gas\/finish/);
      const main = page.locator("main");
      await expect(main).toContainText(/ГЗ-\d{5}/);
      await expect(main).toContainText("14 700");
      await expect(main).toContainText(FILE);
    });
  });
}

/*
 * Дефекты показа V4 (ADR-045; refs/01, refs/10): зритель посреди показа подтверждает чужую
 * запись. Шаг не засчитывается, цепочка не переписывается, финал показывает его запись
 * по ОБ-200: 150 мин = 2,50 ч, 14 700 ₽, 5 880 ₽/ч.
 */
test.describe("показ ведёт по записи зрителя 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("подтверждение заготовки не подменяет запись зрителя в финале", async ({ page }) => {
    await open(page, "/gas");
    await page.getByRole("button", { name: /Пройти показ/ }).click();
    const bot = page.locator('[data-tour="bot"]');
    await answer(bot, "Внести время");
    await answer(bot, /ул\. Демо, 200/);
    await answer(bot, /^Сегодня, 03\.10/);
    await answer(bot, /^12:00/);
    await answer(bot, /^14:30/);
    await answer(bot, /^0 мин/);
    await answer(bot, "Отправить");
    const accepted = bot.getByText(/Запись ГЗ-\d{5} принята, ждёт проверки/);
    await expect(accepted).toBeVisible();
    const number = (await accepted.innerText()).match(/ГЗ-\d{5}/)![0];

    await dock(page)
      .getByRole("button", { name: /Как менеджер проверки/ })
      .click();
    await expect(page).toHaveURL(/\/gas\/moderation\?open=/);
    // Карточка открыта на записи зрителя; закрываем и подтверждаем чужую ГЗ-00096
    await expect(page.locator("[data-review-sheet]")).toContainText(number);
    await page.getByRole("button", { name: "Закрыть" }).first().click();
    await page.locator("[data-queue-card]", { hasText: "ГЗ-00096" }).click();
    await page.locator('[data-tour="review-confirm"]:visible').first().click();
    await expect(page.locator("[data-sonner-toast]", { hasText: "Подтверждено" })).toBeVisible();
    await expect(dock(page)).toContainText("3/6");

    // Своя запись: подтверждение засчитывает шаг
    if (await page.locator("[data-review-sheet]").count()) {
      await page.getByRole("button", { name: "Закрыть" }).first().click();
    }
    await page.locator("[data-queue-card]", { hasText: number }).click();
    await page.locator('[data-tour="review-confirm"]:visible').first().click();
    await expect(dock(page)).toContainText("4/6");

    await open(page, "/gas/finish");
    const main = page.locator("main");
    await expect(main).toContainText(number);
    await expect(main).not.toContainText("ГЗ-00096");
    await expect(main).toContainText("ст. Петровская, ул. Демо, 200 - котел");
    const text = plain(await main.innerText());
    expect(text).toContain("150 мин · 2,50 ч");
    expect(text).toContain("14 700 ₽");
    expect(plain(await page.getByTestId("finish-rate").innerText())).toBe("5 880 ₽/ч");
  });
});
