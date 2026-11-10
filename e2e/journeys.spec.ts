import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import jsQR from "jsqr";
import { expect, open, test } from "./fixtures";
import { CLIENT_LINK_KEY, gasRole } from "./gas-helpers";

/**
 * Приёмка путей (шаг L9, 01_SPEC 14): семь путей на телефоне 390 в тёмной и светлой теме,
 * каждый одной сессией. J1 печатает время сценария и число касаний: они идут в таблицу
 * порогов отчёта L9.
 *
 * Сервер тестов без приёма заявок (адаптер none): J1 и J6 заканчиваются честным переходом
 * в Telegram. Путь с вебхуком и ответом 204 проверяет leads.spec.ts на втором сервере.
 */

test.describe.configure({ timeout: 240_000 });

const FILE = "Выработка_бригад_28.09-03.10.2026.xlsx";
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });
const clientShort = readFileSync("src/server/customer-data.ts", "utf8").match(
  /clientShort: "([^"]+)"/,
)![1]!;

/** Касание с подсчётом: число касаний пути J1 идёт в отчёт */
function tapper() {
  let taps = 0;
  return {
    tap: async (target: Locator) => {
      await target.click();
      taps += 1;
    },
    get count() {
      return taps;
    },
  };
}

async function fillLead(page: Page) {
  await page.getByLabel("Имя").fill("Иван");
  await page.getByLabel("Компания").fill("ООО Пример");
  await page.getByLabel("Телефон").fill("9181234567");
  await page.getByRole("button", { name: "4-10" }).click();
  await page.getByRole("checkbox").check();
}

const stage = (bot: Locator) => bot.locator("[data-stage]");

for (const theme of ["dark", "light"] as const) {
  test.describe(`пути 390 ${theme}`, () => {
    test.use({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      theme,
      colorScheme: theme,
      // 501 от сервера без приёма заявок браузер пишет в консоль сам
      expectedConsole: /^Failed to load resource: .*status of 501\b/,
    });

    test("J1 холодный ЛПР: сайт → демо → тур показа → финал → разбор → заявка", async ({
      page,
    }) => {
      const t = tapper();
      const started = Date.now();
      await page.goto("/", { waitUntil: "load" });
      await page.waitForSelector("html[data-booted]");
      await t.tap(page.getByRole("main").getByRole("link", { name: "Посмотреть демо" }).first());
      await expect(page).toHaveURL(/\/demo$/);
      await t.tap(page.getByRole("link", { name: /Начать показ/ }));
      // Показ за 3 минуты (ADR-061, 13): тур менеджера → бригадира → руководителя, действия
      // зрителя не обязательны. Запись в боте и файл по пути показа проверяет gas-tour.spec.ts
      await expect(page).toHaveURL(/\/gas\/moderation$/);
      const tour = page.getByTestId("tour-card");
      await expect(tour.getByTestId("tour-step")).toHaveText("Шаг 1 из 9");
      for (let i = 0; i < 8; i++) await t.tap(tour.getByRole("button", { name: "Далее" }));
      await expect(page).toHaveURL(/\/gas\/finish/);
      await t.tap(tour.getByRole("button", { name: "Готово" }));
      await t.tap(page.getByTestId("finish-razbor"));
      await expect(page).toHaveURL(/\/razbor\?from=demo-final$/);
      const seconds = Math.round((Date.now() - started) / 1000);

      await fillLead(page);
      const response = page.waitForResponse("**/api/leads");
      await page.getByRole("button", { name: "Отправить заявку" }).click();
      const answer = await response;
      expect(JSON.parse(answer.request().postData()!)).toMatchObject({ source: "demo-final" });
      // Без приёма заявок: честный переход, «отправлено» не пишется
      expect(answer.status()).toBe(501);
      await expect(page.getByRole("status")).toContainText("Заявки с сайта пока не подключены");
      await expect(page.locator("body")).not.toContainText("Заявка отправлена");

      console.log(`J1 ${theme}: от сайта до разбора ${seconds} с, касаний ${t.count}`);
      test.info().annotations.push({ type: "J1", description: `${seconds} с, ${t.count} касаний` });
      expect(t.count).toBeLessThanOrEqual(16);
    });

    test("J2 бригадир: голосом 3 касания, кнопками 6", async ({ page }) => {
      await open(page, "/gas");
      await gasRole(page, "Бригадир");
      // ADR-056: бригадир начинает с «Сегодня»; путь J2 идёт через бот, второй канал
      await expect(page).toHaveURL(/\/gas\/brigade/);
      await open(page, "/gas/foreman");
      const bot = page.locator('[data-tour="bot"]');
      await stage(bot).getByRole("button", { name: "Внести время", exact: true }).click();

      // Голосом: «Сказать голосом» → «Готово» → «Отправить»
      const voice = tapper();
      await voice.tap(stage(bot).getByRole("button", { name: "Сказать голосом" }));
      await voice.tap(bot.getByRole("button", { name: "Готово" }));
      const send = stage(bot).getByRole("button", { name: "Отправить", exact: true });
      await expect(send).toBeVisible({ timeout: 15_000 });
      await expect(bot).toContainText("Демо: фраза подготовлена заранее");
      await voice.tap(send);
      await expect(bot).toContainText(/Отправлено\. Запись ГЗ-\d{5} ждёт проверки/);
      expect(voice.count).toBe(3);

      // Сброс демо в «Ещё» той же вкладки: кнопками та же запись ОБ-200, иначе бот честно
      // скажет о дубле. Сброс возвращает роль менеджера, бригадир выбирается снова
      await open(page, "/gas/more");
      await page.getByRole("button", { name: "Сбросить демо" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Сбросить" }).click();
      await expect(toast(page, "Демо сброшено")).toBeVisible();
      await gasRole(page, "Бригадир");
      await expect(page).toHaveURL(/\/gas\/brigade/);
      await open(page, "/gas/foreman");

      const buttons = tapper();
      await buttons.tap(stage(bot).getByRole("button", { name: "Внести время", exact: true }));
      await buttons.tap(stage(bot).getByRole("button", { name: /ул\. Демо, 200/ }));
      await buttons.tap(stage(bot).getByRole("button", { name: /^Сегодня, 03\.10/ }));
      await buttons.tap(stage(bot).getByRole("button", { name: /^12:00/ }));
      await buttons.tap(stage(bot).getByRole("button", { name: /^14:30/ }));
      await buttons.tap(stage(bot).getByRole("button", { name: /^0 мин/ }));
      expect(buttons.count).toBe(6);
      await expect(bot.getByTestId("bot-total")).toHaveText("150 мин = 2,50 ч");
      await stage(bot).getByRole("button", { name: "Отправить", exact: true }).click();
      await expect(bot).toContainText(/Отправлено\. Запись ГЗ-\d{5} ждёт проверки/);
    });

    test("J3 менеджер: подтверждение в 2 касания, пачка, отмена", async ({ page }) => {
      await open(page, "/gas/moderation");
      const card = page.locator("[data-queue-card]", { hasText: "ГЗ-00096" });
      await card.click();
      await page.locator('[data-tour="review-confirm"]:visible').first().click();
      await expect(toast(page, "Принято")).toBeVisible();
      await expect(card).toHaveCount(0);
      await toast(page, "Принято").getByRole("button", { name: "Отменить" }).click();
      await expect(card).toBeVisible();

      await page.keyboard.press("Escape");
      await open(page, "/gas/moderation");
      const batch = page.getByRole("button", { name: /Принять \d+ без замечаний/ });
      const count = Number((await batch.innerText()).match(/(\d+)/)![1]);
      await batch.click();
      const done = toast(page, new RegExp(`Принято ${count} запис`));
      await expect(done).toBeVisible();
      await done.getByRole("button", { name: "Отменить" }).click();
      await expect(
        page.getByRole("button", { name: `Принять ${count} без замечаний` }),
      ).toBeVisible();
    });

    /*
     * «Табель» на телефоне (ADR-061, 11; раздел 4.5): список «бригада → объект → день»
     * с тремя числами, «Открыть как таблицу» и выгрузка утверждённого Excel
     */
    test("J4 руководитель: табель списком, таблицей и выгрузка", async ({ page }) => {
      await open(page, "/gas/tabel");
      const list = page.getByRole("list", { name: "Табель по бригадам" });
      await expect(list).toBeVisible();
      await list.locator("summary").first().click();
      await expect(list.locator("li li").first()).toContainText("₽");
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.locator('[data-tour="export"]').click(),
      ]);
      expect(download.suggestedFilename()).toBe(FILE);
      await page.getByRole("button", { name: "Открыть как таблицу" }).click();
      await expect(page.getByRole("grid", { name: "Табель в формате заказчика" })).toBeVisible();
      expect(
        await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0);
    });

    test("J5 ГАЙКА: канон до финала и переход на разбор", async ({ page }) => {
      await page.addInitScript(() => {
        try {
          sessionStorage.removeItem("neeklo-fieldops-legacy");
        } catch {
          // Приватный режим
        }
      });
      const strip = page.getByRole("region", { name: "Подсказки по сценарию" });
      const instant = page.getByRole("button", { name: "Показать сразу" });
      await page.goto("/demo", { waitUntil: "load" });
      await page.waitForSelector("html[data-booted]");
      await page.getByRole("link", { name: /Смена → учёт/ }).click();
      await expect(page).toHaveURL(/\/capture/);
      await page.getByRole("button", { name: /Удерживайте, чтобы говорить/ }).click();
      await page.getByRole("button", { name: "Показать без микрофона" }).click();
      await page.getByRole("button", { name: "Готово" }).click();
      if (await instant.isVisible().catch(() => false))
        await instant.click().catch(() => undefined);
      await expect(page.getByText("Демо: разбор подготовлен заранее")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("button", { name: "Верно" }).last().click();
      await page.getByRole("button", { name: "Дальше по сценарию" }).click();
      await expect(page).toHaveURL(/\/today/);

      await strip.getByRole("button", { name: /Дальше: ПТО → документ/ }).click();
      await expect(page).toHaveURL(/\/check/);
      await page.locator("main article").first().getByRole("button", { name: "Принять" }).click();
      // Шаг ПТО закрывается выпуском файлов: сводка и черновик ведомости
      const shift = page.waitForEvent("download");
      await page.getByRole("button", { name: "Скачать сводку смены" }).click();
      expect((await shift).suggestedFilename()).toMatch(/Сводка/u);
      const statement = page.waitForEvent("download");
      await page.getByRole("button", { name: "Скачать черновик ведомости" }).click();
      expect((await statement).suggestedFilename()).toMatch(/Ведомость-черновик/u);

      await strip.getByRole("button", { name: /Дальше: Объект → снабжение/ }).click();
      await page.getByRole("button", { name: /Удерживайте, чтобы говорить/ }).click();
      await page.getByRole("button", { name: "Показать без микрофона" }).click();
      await page.getByRole("button", { name: "Готово" }).click();
      if (await instant.isVisible().catch(() => false))
        await instant.click().catch(() => undefined);
      await expect(page.getByText(/40 шт · к /)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Верно" }).last().click();
      await page.getByRole("button", { name: "Дальше по сценарию" }).click();
      await expect(page).toHaveURL(/\/inbox/);
      const request = page.getByRole("listitem").filter({ hasText: "Кронштейн несущий" }).first();
      await request.getByRole("slider", { name: "Сдвиньте, чтобы принять" }).press("End");
      await expect(request.getByText("Принята").first()).toBeVisible();
      await strip.getByRole("button", { name: /Глазами: прораб/ }).click();
      await strip.getByRole("button", { name: "Итоги показа" }).click();
      await expect(page.getByRole("heading", { name: "Вы прошли три сценария" })).toBeVisible();

      await page.getByTestId("finish-razbor").click();
      await expect(page).toHaveURL(/\/razbor\?from=demo-final$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Покажем на ваших данных");
    });

    test("J6 партнёр: код, копирование, QR, ссылка с ?src= доходит до заявки", async ({
      page,
      context,
    }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.goto("/kit", { waitUntil: "load" });
      await page.waitForSelector("html[data-booted]");
      await page.getByTestId("kit-code").fill("vasya");
      const card = page.getByTestId("kit-link").filter({ hasText: "Экспресс-разбор" });
      await card.getByRole("button", { name: "Скопировать" }).click();
      const link = await page.evaluate(() => navigator.clipboard.readText());
      expect(link).toMatch(/\/razbor\?src=vasya$/);

      const pixels = await card.getByTestId("kit-qr").evaluate((canvas: HTMLCanvasElement) => {
        const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
        return { data: Array.from(data.data), width: canvas.width, height: canvas.height };
      });
      expect(jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)?.data).toBe(
        link,
      );

      // Человек открыл ссылку партнёра: тот же путь и параметр на этом сервере
      const url = new URL(link);
      await page.goto(url.pathname + url.search, { waitUntil: "load" });
      await page.waitForSelector("html[data-booted]");
      await fillLead(page);
      const response = page.waitForResponse("**/api/leads");
      await page.getByRole("button", { name: "Отправить заявку" }).click();
      expect(JSON.parse((await response).request().postData()!)).toMatchObject({
        src: "vasya",
        source: "razbor",
      });
    });

    test("J7 заказчик: личная ссылка показывает бренд и сверку, без ключа нет", async ({
      page,
    }) => {
      await page.goto("/gas/tabel", { waitUntil: "domcontentloaded" });
      await page.locator("main").waitFor();
      await expect(page.locator("body")).not.toContainText(clientShort);
      await expect(page.getByText("Сверка с вашим файлом")).toHaveCount(0);

      await page.goto(`/gas/tabel?c=${CLIENT_LINK_KEY}`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/gas\/tabel$/);
      await expect(page.getByText("Сверка с вашим файлом")).toBeVisible();
      await expect(page.locator("body")).toContainText(clientShort);
    });
  });
}
