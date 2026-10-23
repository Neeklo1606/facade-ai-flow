import { expect, open, test } from "./fixtures";
import { enterClientContour } from "./gas-helpers";

/**
 * Стартовый экран, инструкция и вопросы контура газа (ADR-044, F2, F7) на 390 и 1440.
 * Ошибка в консоли роняет тест: это общая оснастка e2e.
 */

const ROLE_HOME: Record<string, RegExp> = {
  foreman: /\/gas\/foreman$/,
  manager: /\/gas\/moderation$/,
  director: /\/gas\/reports$/,
  admin: /\/gas\/moderation$/,
};

const TABS = ["Бригадир", "Менеджер", "Руководитель"] as const;
const TAB_KEY: Record<(typeof TABS)[number], string> = {
  Бригадир: "foreman",
  Менеджер: "manager",
  Руководитель: "director",
};

for (const [name, viewport] of [
  ["390", { width: 390, height: 844 }],
  ["1440", { width: 1440, height: 900 }],
] as const) {
  test.describe(`старт контура газа, ${name}`, () => {
    test.use({ viewport });

    test("новичок: с /gas за одно касание до экрана любой роли", async ({ page }) => {
      for (const role of Object.keys(ROLE_HOME)) {
        await open(page, "/gas");
        // Заголовок старта: на телефоне в шапке контура (h1), с планшета в герое (ADR-048, 5)
        await expect(
          page
            .getByRole("heading", { name: /^Учёт выработки бригад/ })
            .filter({ visible: true })
            .first(),
        ).toBeVisible();
        await page.getByTestId(`gas-role-${role}`).click();
        await expect(page).toHaveURL(ROLE_HOME[role]!);
      }
    });

    test("схема шагов ведёт на экраны", async ({ page }) => {
      // Пример расчёта берётся из недели заказчика: 395 мин и 44 847 ₽ (ADR-047)
      await enterClientContour(page);
      await open(page, "/gas");
      await page.getByTestId("gas-flow-3").click();
      await expect(page).toHaveURL(/\/gas\/guide\?tab=calc/);
      await expect(page.getByText("6 812 ₽/ч").first()).toBeVisible();
    });

    test("инструкция: каждая «Показать на экране» открывается без ошибок", async ({ page }) => {
      // 24 перехода со сменой роли: на dev-сервере дольше общего лимита
      test.setTimeout(300_000);
      for (const tab of TABS) {
        await open(page, `/gas/guide?tab=${TAB_KEY[tab]}`);
        const count = await page
          .locator(`#guide-panel-${TAB_KEY[tab]} [data-testid='guide-show']`)
          .count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
          if (i > 0) await open(page, `/gas/guide?tab=${TAB_KEY[tab]}`);
          await page
            .locator(`#guide-panel-${TAB_KEY[tab]} [data-testid='guide-show']`)
            .nth(i)
            .click();
          await expect(page).toHaveURL(/\?tour=/);
          await page.locator("main").waitFor();
        }
      }
    });

    test("вопросы сохраняют ответ после перезагрузки", async ({ page }) => {
      // Вопросы к согласованию только в личном контуре заказчика (ADR-047)
      await enterClientContour(page);
      await open(page, "/gas/questions");
      await expect(page.locator("[data-testid^='question-']")).toHaveCount(10);
      // Вопрос открывается деталью: ответ и статус в ней (ADR-045, 5.11)
      await page.getByTestId("question-1").click();
      await page.getByTestId("answer-1").fill("Делим по дням поровну");
      await page.getByTestId("status-1-answered").click();
      await expect(page.getByTestId("questions-progress")).toContainText("1");
      await page.reload();
      await page.locator("main").waitFor();
      await page.getByTestId("question-1").click();
      await expect(page.getByTestId("answer-1")).toHaveValue("Делим по дням поровну");
      await expect(page.getByTestId("status-1-answered")).toHaveAttribute("aria-checked", "true");
      await expect(page.getByTestId("questions-progress")).toContainText("1");
    });
  });
}

test("печать инструкции: все вкладки подряд, без оболочки", async ({ page }) => {
  await open(page, "/gas/guide");
  await page.emulateMedia({ media: "print" });
  for (const key of ["foreman", "manager", "director", "calc"]) {
    await expect(page.locator(`#guide-panel-${key}`)).toBeVisible();
  }
  await expect(page.locator(".gas-shell > aside")).toBeHidden();
  await expect(page.getByRole("button", { name: "Сохранить инструкцию в PDF" })).toBeHidden();
});

test("финал без показа ведёт на старт", async ({ page }) => {
  await open(page, "/gas/finish");
  await page.getByRole("link", { name: "Начать показ" }).click();
  await expect(page).toHaveURL(/\/gas$/);
});
