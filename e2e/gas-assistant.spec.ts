import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Помощник и напоминания (ADR-061, 13; разделы 4.8 и 5). Помощник отвечает по данным недели
 * со ссылками, черновик действия выполняется только кнопкой человека, без модели свободный
 * вопрос получает список вопросов. Напоминания уходят через порт: в демо — в колокольчик
 * и ленту бота, с пометкой, что в MAX ничего не ушло.
 */

const panel = (page: Page) => page.getByRole("dialog", { name: "Помощник" });
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });

test.describe("помощник 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("подсказанные вопросы, ответ со ссылками, черновик только по кнопке, история", async ({
    page,
  }) => {
    await open(page, "/gas/moderation");
    const button = page.getByTestId("assistant-open");
    const size = await button.boundingBox();
    expect(Math.round(size!.width)).toBe(52);
    await button.click();
    const box = await panel(page).boundingBox();
    expect(Math.round(box!.width)).toBe(420);

    const questions = panel(page).getByRole("list", { name: "Подсказанные вопросы" });
    await expect(questions.getByRole("button")).toHaveCount(5);
    await questions.getByRole("button", { name: "Записи с пересечением за неделю" }).click();
    const answer = panel(page).getByTestId("assistant-answer").last();
    await expect(answer).toContainText("ГЗ-00097");
    await expect(answer).toContainText("По данным недели 28.09–03.10");

    // Черновик не выполнен, пока человек не нажал: обе записи ещё в очереди
    const queue = page.getByRole("list", { name: "Очередь проверки" });
    await expect(queue).toContainText("ГЗ-00097");
    await answer.getByRole("button", { name: "Вернуть 2 записи на уточнение" }).click();
    await expect(toast(page, "Вернули на уточнение: 2")).toBeVisible();
    await expect(answer.getByRole("button", { name: "Выполнено" })).toBeDisabled();
    await expect(queue).not.toContainText("ГЗ-00097");

    // Свободный вопрос без модели
    await panel(page).getByLabel("Вопрос помощнику").fill("Какая погода завтра?");
    await panel(page).getByRole("button", { name: "Спросить" }).click();
    await expect(panel(page).getByTestId("assistant-answer").last()).toContainText(
      "Без подключённой модели помощник отвечает только на эти вопросы",
    );

    // История переживает перезагрузку
    await page.reload();
    await page.locator("main").waitFor();
    await page.getByTestId("assistant-open").click();
    await expect(panel(page).getByTestId("assistant-answer")).toHaveCount(2);
    await panel(page).getByRole("button", { name: "История чатов" }).click();
    await expect(
      panel(page).getByRole("navigation", { name: "История чатов" }).getByRole("button"),
    ).toHaveCount(1);
  });

  test("ссылка ответа ведёт в журнал на запись, бригадиру помощника нет", async ({ page }) => {
    await open(page, "/gas/moderation");
    await page.getByTestId("assistant-open").click();
    await panel(page)
      .getByRole("button", { name: /^Почему у записи ГЗ-\d{5} нет суммы\?$/ })
      .click();
    const answer = panel(page).getByTestId("assistant-answer").last();
    await expect(answer).toContainText("нет подтверждённой стоимости объекта");
    await answer.getByRole("link", { name: /^Открыть ГЗ-\d{5}$/ }).click();
    await expect(page).toHaveURL(/\/gas\/entries\?q=/);
    await expect(panel(page)).toHaveCount(0);

    await gasRole(page, "Бригадир");
    await expect(page.getByTestId("assistant-open")).toHaveCount(0);
  });
});

test.describe("помощник 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("кнопка над нижней панелью, панель во всю ширину", async ({ page }) => {
    await open(page, "/gas/moderation");
    const button = page.getByTestId("assistant-open");
    const nav = await page.getByRole("navigation", { name: "Основные разделы" }).boundingBox();
    const box = await button.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
    await button.click();
    const sheet = await panel(page).boundingBox();
    expect(Math.round(sheet!.width)).toBe(390);
    await panel(page).getByRole("button", { name: "Что мешает закрыть неделю?" }).click();
    await expect(panel(page).getByTestId("assistant-answer")).toContainText(
      /Закрыть неделю мешает причин: \d+/,
    );
  });
});

test.describe("напоминания 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("«Проверить сейчас»: бригадиру в ленту бота, менеджеру сводка, повтор не уходит", async ({
    page,
  }) => {
    await open(page, "/gas/admin");
    await gasRole(page, "Администратор");
    await open(page, "/gas/admin");
    const check = page.getByRole("button", { name: "Проверить напоминания сейчас" });
    await check.click();
    await expect(toast(page, /Отправлено напоминаний: \d+/)).toBeVisible();
    await check.click();
    await expect(toast(page, "Напоминать некому")).toBeVisible();

    await gasRole(page, "Менеджер");
    await page.getByRole("button", { name: /^Требует внимания/ }).click();
    const message = page.getByTestId("bell-message").first();
    await expect(message).toContainText("Сводка за 03.10");
    await expect(message).toContainText("Демо: показано здесь, в MAX не отправлено");

    await open(page, "/gas/foreman");
    await expect(page.getByTestId("bot-reminder").first()).toContainText(
      "Нет записи времени за 03.10",
    );
  });
});
