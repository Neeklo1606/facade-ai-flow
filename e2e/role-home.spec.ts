import { expect, open, test } from "./fixtures";

/**
 * Рабочий экран роли (ADR-028). Проверяется то, ради чего задача делалась: корень адреса
 * ведёт туда, где у человека работа, а очередь ПТО принимает решение и умеет его отменить.
 */

test.describe("корень ведёт на рабочий экран роли", () => {
  const cases: [string, string, RegExp][] = [
    ["e-gareev", "прораб", /\/today$/],
    ["e-volkova", "ПТО", /\/check$/],
    ["e-sokolov", "руководитель", /\/attention$/],
    ["e-dorohov", "снабжение", /\/attention$/],
  ];
  for (const [persona, role, url] of cases) {
    test(`${role} @mobile`, async ({ page, browser }) => {
      const context = await browser.newContext();
      await context.addInitScript((id) => {
        try {
          sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
          sessionStorage.setItem("neeklo-fieldops-persona", id);
        } catch {
          // Приватный режим: тест увидит экран выбора роли
        }
      }, persona);
      const tab = await context.newPage();
      await tab.goto("/", { waitUntil: "domcontentloaded" });
      await expect(tab).toHaveURL(url);
      await context.close();
      void page;
    });
  }
});

test.describe("очередь проверки", () => {
  test.use({ persona: "e-volkova" });

  test("приёмка факта с отменой @mobile", async ({ page }) => {
    await open(page, "/check");
    const first = page.locator("article").first();
    const title = (await first.locator("h3").innerText()).trim();
    const before = await page.locator("article").count();

    await first.getByRole("button", { name: "Принять" }).click();

    // Решение применилось сразу: карточка ушла из очереди
    await expect(page.locator("article")).toHaveCount(before - 1);
    // И его можно отменить шесть секунд
    const undo = page.getByRole("button", { name: "Отменить" });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(page.locator("article")).toHaveCount(before);
    await expect(page.locator("article").filter({ hasText: title })).toHaveCount(1);
  });

  test("возврат на уточнение тоже отменяется @mobile", async ({ page }) => {
    await open(page, "/check");
    const before = await page.locator("article").count();
    await page.locator("article").first().getByRole("button", { name: "Вернуть" }).click();
    await expect(page.locator("article")).toHaveCount(before - 1);
    await page.getByRole("button", { name: "Отменить" }).click();
    await expect(page.locator("article")).toHaveCount(before);
  });
});

test.describe("«Сегодня» показывает факт, а не план", () => {
  test.use({ persona: "e-gareev" });

  test("блоки смены на месте, обещаний плана нет @mobile", async ({ page }) => {
    await open(page, "/today");
    await expect(page.getByRole("heading", { name: "Зафиксировано сегодня" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ожидаются поставки" })).toBeVisible();
    // Плана в данных нет — и слова «план» на экране тоже нет
    await expect(page.locator("main")).not.toContainText(/план/iu);
    // На телефоне действие закреплено над панелью, на десктопе — в шапке экрана
    await expect(page.getByRole("link", { name: /Зафиксировать работу/ }).first()).toBeVisible();
  });
});
