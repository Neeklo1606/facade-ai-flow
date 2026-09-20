import { expect, open, test } from "./fixtures";

/**
 * Показанный статус меняется действием на экране (Q8, п. 1; ADR-015, п. 7): статус объекта,
 * контрольная точка, изменение документации. Каждое действие видно в истории объекта.
 */

const toast = (page: import("@playwright/test").Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });

test.describe("руководитель меняет статусы", () => {
  test.use({ persona: "e-sokolov" });

  test("статус объекта из карточки — в реестре и в истории", async ({ page }) => {
    await open(page, "/projects/p-korona");
    await page
      .getByRole("button", { name: /Статус объекта: Под риском/ })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "В работе" }).click();
    await expect(toast(page, "Статус объекта: «В работе»")).toBeVisible();

    await open(page, "/projects");
    await expect(page.getByRole("row", { name: /Северная Корона/ })).toContainText("В работе");
    await open(page, "/projects/p-korona/timeline");
    await expect(page.getByText(/«Под риском» → «В работе»/).first()).toBeVisible();
  });

  test("контрольная точка отмечается выполненной и уходит из «ближайшей»", async ({ page }) => {
    await open(page, "/projects/p-korona?tab=progress");
    const next = page.getByRole("button", {
      name: "Ближайшая контрольная точка",
      exact: true,
    });
    await next.click();
    const drawer = page.getByRole("dialog");
    const name = (await drawer.getByRole("heading").first().innerText()).trim();
    await drawer.getByRole("button", { name: "Отметить выполненной" }).click();
    await expect(toast(page, "Контрольная точка выполнена")).toBeVisible();
    await expect(drawer.getByText("Выполнено")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Отметить выполненной" })).toHaveCount(0);

    await open(page, "/projects/p-korona/timeline");
    await expect(page.getByText(`Контрольная точка выполнена: ${name}`).first()).toBeVisible();
  });

  test("изменение документации разбирается на экране документации — счётчики сходятся", async ({
    page,
  }) => {
    await open(page, "/projects/p-korona");
    const card = async () =>
      Number(
        (
          await page
            .locator("main")
            .getByText("Изменения документации без разбора")
            .locator("xpath=ancestor::*[self::a or self::button or self::li][1]")
            .innerText()
        ).match(/(\d+)\s*$/)?.[1] ?? NaN,
      );
    const before = await card();
    expect(before).toBeGreaterThan(0);

    await open(page, "/projects/p-korona/documents");
    const panel = page.getByRole("region", { name: "Изменения документации" });
    await expect(panel).toContainText(`без разбора: ${before}`);
    await panel.getByRole("button", { name: "Разобрано" }).first().click();
    await expect(toast(page, "Изменение разобрано")).toBeVisible();
    await expect(panel).toContainText(`без разбора: ${before - 1}`);

    await open(page, "/projects/p-korona");
    expect(await card()).toBe(before - 1);
    await open(page, "/projects/p-korona/timeline");
    await expect(page.getByText("Изменение документации разобрано").first()).toBeVisible();
  });
});

test.describe("без права записи — статус только показан", () => {
  test.use({ persona: "e-belyaev" });

  test("директор видит статус объекта, но не меняет его", async ({ page }) => {
    await open(page, "/projects/p-korona");
    await expect(page.getByRole("button", { name: /Статус объекта/ })).toHaveCount(0);
    await expect(page.getByText("Под риском").first()).toBeVisible();
  });
});
