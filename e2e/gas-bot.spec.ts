import { expect, open, test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

/**
 * Бот бригадира (ADR-044, F4): честный диалог мессенджера MAX.
 *
 * - полный проход ОБ-200, 12:00–14:30, без перерыва: не больше 6 касаний от «Внести время»
 *   до «Отправить», номер записи приходит сообщением бота;
 * - пересечение 08:30–11:40 с ГЗ-00095 видно сразу на шаге времени, есть «Изменить»;
 * - на 390 и 1440.
 */

const WIDTHS = [
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
] as const;

/** Войти бригадиром через переключатель роли оболочки: аватар на телефоне, строка в сайдбаре */
async function signInForeman(page: Page) {
  const width = page.viewportSize()?.width ?? 1440;
  if (width < 1024) {
    await page.getByRole("button", { name: /^Вы: / }).click();
  } else {
    await page.getByRole("button", { name: /Вы смотрите как/ }).click();
  }
  // На стартовом экране есть и карточка роли «Бригадир»: выбираем в списке переключателя
  await page
    .getByRole("list", { name: "Роли" })
    .getByRole("button", { name: /^Бригадир/ })
    .click();
  await expect(page).toHaveURL(/\/gas\/foreman/);
}

async function openBot(page: Page): Promise<Locator> {
  await open(page, "/gas");
  await signInForeman(page);
  const bot = page.locator('[data-tour="bot"]');
  await expect(bot.getByText("Добрый день, Бригадир 1.")).toBeVisible();
  return bot;
}

/** Последнее сообщение бота с кнопками: на него и отвечаем */
const current = (bot: Locator) => bot.locator("[data-stage]");

for (const width of WIDTHS) {
  test.describe(`бот бригадира ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("полный проход ОБ-200 12:00–14:30 за 6 касаний", async ({ page }) => {
      const bot = await openBot(page);
      let taps = 0;
      const tap = async (name: string | RegExp, exact = true) => {
        await current(bot)
          .getByRole("button", typeof name === "string" ? { name, exact } : { name })
          .click();
        taps += 1;
      };

      await current(bot).getByRole("button", { name: "Внести время" }).click();
      await expect(current(bot)).toContainText("Выберите объект.");
      await tap(/ул\. Демо, 200/);
      await expect(current(bot)).toContainText("За какой день?");
      await tap(/^Сегодня, 03\.10/);
      await expect(current(bot)).toContainText("Во сколько начали?");
      // Занятые кнопки видны и недоступны, подписаны «занято»
      await expect(current(bot).getByRole("button", { name: /^08:30, занято/ })).toBeDisabled();
      await tap("12:00");
      await expect(current(bot)).toContainText("Во сколько закончили?");
      await tap("14:30");
      await expect(current(bot)).toContainText("Был перерыв?");
      await tap(/^0 мин/);
      await expect(current(bot).getByTestId("bot-total")).toHaveText("150 мин = 2,50 ч");
      // Сумма и доходность бригадиру не показываются
      await expect(bot).not.toContainText("₽");
      await tap("Отправить");
      expect(taps, "касаний от «Внести время» до «Отправить»").toBeLessThanOrEqual(6);

      const done = current(bot);
      await expect(done).toContainText(/Запись ГЗ-\d{5} принята, ждёт проверки/);
      const number = (await done.innerText()).match(/ГЗ-\d{5}/)?.[0];
      expect(number).toBeTruthy();
      // Выбранные ответы остались в ленте
      await expect(bot.getByText("ст. Петровская, ул. Демо, 200 - котел").first()).toBeVisible();
      await expect(done.getByRole("button", { name: "Внести ещё адрес" })).toBeVisible();

      if (width.name === "1440") {
        await expect(page.getByTestId("bot-system-status")).toContainText(
          `${number} создана, ждёт проверки`,
        );
        await expect(page.getByRole("link", { name: "Открыть в проверке" })).toHaveAttribute(
          "href",
          /\/gas\/moderation\?open=/,
        );
        await expect(
          page.getByText("Так будет выглядеть бот в MAX. Канал не подключён."),
        ).toBeVisible();
      }

      // Запись видна в «Моих записях» со статусом
      await done.getByRole("button", { name: "Мои записи" }).click();
      await expect(current(bot)).toContainText(number!);
      await expect(current(bot)).toContainText("Ожидает проверки");

      // Кнопки ленты не мельче 48 px и без горизонтальной прокрутки страницы
      const small = await bot
        .locator("button")
        .evaluateAll(
          (list) =>
            list
              .map((b) => b.getBoundingClientRect())
              .filter((r) => r.width > 0 && r.height > 0 && r.height < 47.5).length,
        );
      expect(small, "кнопки ниже 48 px").toBe(0);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test("пересечение 08:30–11:40 видно сразу и есть «Изменить»", async ({ page }) => {
      const bot = await openBot(page);
      await current(bot).getByRole("button", { name: "Внести время" }).click();
      await current(bot)
        .getByRole("button", { name: /ул\. Демо, 200/ })
        .click();
      await current(bot)
        .getByRole("button", { name: /^Сегодня/ })
        .click();

      // Начало сообщением: «0830» маска понимает как 08:30, и это время занято
      await current(bot).getByRole("button", { name: "Другое время" }).click();
      await page.getByLabel("Время начала").fill("0830");
      await page.getByLabel("Время начала").press("Enter");
      await expect(current(bot)).toContainText("пересекается с записью ГЗ-00095");
      await current(bot).getByRole("button", { name: "Изменить" }).click();
      await expect(current(bot)).toContainText("Во сколько начали?");

      // Начало 07:00 свободно, окончание 11:40 сообщением заходит на ГЗ-00095
      await current(bot).getByRole("button", { name: "07:00", exact: true }).click();
      await current(bot).getByRole("button", { name: "Другое время" }).click();
      await page.getByLabel("Время окончания").fill("11.40");
      await page.getByLabel("Время окончания").press("Enter");
      await expect(current(bot)).toContainText("пересекается с записью ГЗ-00095");
      await expect(current(bot).getByRole("button", { name: "Изменить" })).toBeVisible();
      // Ничего не отправлено: шаг «Отправить» не наступил
      await expect(bot.getByRole("button", { name: "Отправить", exact: true })).toHaveCount(0);
    });
  });
}
