import { expect, expectA11y, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * «Спросить ГАЙКУ» (ADR-052): руководителю первой вкладкой, ответ с числами и сносками,
 * сноска ведёт на источник, непонятый вопрос честно предлагает другие.
 */
for (const run of [
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
] as const) {
  test.describe(`Спросить ГАЙКУ ${run.name}`, () => {
    test.use({ viewport: run.viewport, hasTouch: run.hasTouch });

    test("руководитель: подсказка → ответ с источниками → сноска ведёт в журнал", async ({
      page,
    }) => {
      await open(page, "/gas");
      await gasRole(page, "Руководитель");
      if (run.name === "390") {
        const tabs = page.getByRole("navigation", { name: "Основные разделы" });
        await expect(tabs.getByRole("link").first()).toHaveText(/Спросить/);
        await tabs.getByRole("link", { name: /Спросить/ }).click();
      } else {
        await open(page, "/gas/ask");
      }
      await expect(page.getByRole("heading", { name: "Спросите о неделе" })).toBeVisible();
      await expectA11y(page, `ask пусто ${run.name}`);

      await page.getByRole("button", { name: "Покажи бригаду 1" }).click();
      const answer = page.getByTestId("ask-answer").last();
      await expect(answer).toHaveAttribute("data-intent", "brigade");
      await expect(answer.getByRole("heading", { name: "Бригада 1" })).toBeVisible();
      await expect(answer).toContainText("Демо: ответ собрало правило по данным недели");
      await expectA11y(page, `ask ответ ${run.name}`);

      // Сноска строки ведёт на источник: объект бригады открывается в журнале поиском
      await answer.getByRole("link", { name: /^Источник 2:/ }).click();
      await expect(page).toHaveURL(/\/gas\/entries\?q=/);
      await page.goBack();

      // Следующий вопрос из ответа, затем вопрос текстом с Enter
      await page.getByRole("button", { name: "Сколько заработали за неделю?" }).first().click();
      await expect(page.getByTestId("ask-answer").last()).toHaveAttribute("data-intent", "week");
      await page.getByRole("textbox", { name: "Вопрос" }).fill("ОБ-200");
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("ask-answer").last()).toHaveAttribute("data-intent", "object");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    });

    test("непонятый вопрос: честный ответ и вопросы, которые правило понимает", async ({
      page,
    }) => {
      await open(page, "/gas/ask");
      await page.getByRole("textbox", { name: "Вопрос" }).fill("расскажи анекдот");
      await page.getByRole("button", { name: "Спросить", exact: true }).click();
      const answer = page.getByTestId("ask-answer").last();
      await expect(answer).toHaveAttribute("data-intent", "unknown");
      await expect(answer).toContainText("Пока не понимаю такой вопрос");
      await expect(answer.getByRole("button")).toHaveCount(4);
    });
  });
}

test.describe("вопрос из поля в шапке", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("одно поле: «Найти» ведёт в журнал, «Спросить ГАЙКУ» сразу отвечает", async ({ page }) => {
    await open(page, "/gas/moderation");
    await page.getByRole("button", { name: "Поиск записи" }).click();
    await page.getByRole("textbox", { name: "Что найти" }).fill("что ждёт проверки");
    await page.getByRole("button", { name: /^Спросить ГАЙКУ: «что ждёт проверки»/ }).click();
    await expect(page).toHaveURL(/\/gas\/ask$/);
    const answer = page.getByTestId("ask-answer").last();
    await expect(answer).toHaveAttribute("data-intent", "review");
    await expect(answer.getByRole("heading", { name: /^Ждут проверки: \d+$/ })).toBeVisible();
  });
});

test.describe("бригадиру «Спросить» нет", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("на старте нет ссылки, в меню нет раздела", async ({ page }) => {
    await open(page, "/gas");
    await expect(page.getByRole("link", { name: "Спросить о неделе" })).toBeVisible();
    await gasRole(page, "Бригадир");
    await open(page, "/gas");
    await expect(page.getByRole("link", { name: "Спросить о неделе" })).toHaveCount(0);
  });
});
