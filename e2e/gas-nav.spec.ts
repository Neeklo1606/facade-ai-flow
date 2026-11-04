import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Меню ролей по сценарию дня (финальный промт, 2.3–2.4; ADR-064): у менеджера Проверка,
 * Табель, Неделя, Справочники, у руководителя одна «Неделя», остальное в «Ещё». Справочники
 * одним экраном вкладками.
 */
test.describe("меню ролей 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("менеджер: четыре раздела дня, журнал и каталоги в «Ещё»", async ({ page }) => {
    await open(page, "/gas");
    await gasRole(page, "Менеджер");
    const nav = page.getByRole("navigation", { name: "Разделы" }).filter({ visible: true });
    const groups = nav.locator(":scope > div");
    // У «Проверки» счётчик ждущих решения: сверяем начало подписи
    await expect(groups.first().getByRole("link")).toHaveText([
      /^Проверка/,
      /^Табель/,
      /^Неделя/,
      /^Справочники/,
    ]);
    await expect(groups.nth(1)).toContainText("Ещё");
    await expect(groups.nth(1).getByRole("link", { name: "Журнал" })).toBeVisible();
  });

  test("руководитель: одна «Неделя», табель и журнал в «Ещё»", async ({ page }) => {
    await open(page, "/gas");
    await gasRole(page, "Руководитель");
    const nav = page.getByRole("navigation", { name: "Разделы" }).filter({ visible: true });
    const groups = nav.locator(":scope > div");
    await expect(groups.first().getByRole("link")).toHaveText([/^Неделя/]);
    await expect(groups.nth(1).getByRole("link", { name: "Табель" })).toBeVisible();
  });

  test("справочники вкладками, у каждой первое действие из Excel", async ({ page }) => {
    await open(page, "/gas");
    await gasRole(page, "Менеджер");
    await open(page, "/gas/directory");
    for (const [tab, action] of [
      ["Сметы", /Загрузить смету/],
      ["Бригады", /Бригады из Excel/],
      ["Сотрудники", /Сотрудники из Excel/],
      ["Объекты", /Загрузить график/],
      ["Ставки и состав", /из Excel/],
    ] as const) {
      await page
        .getByRole("navigation", { name: "Справочники" })
        .getByRole("link", { name: tab })
        .click();
      await expect(
        page.getByRole("navigation", { name: "Справочники" }).getByRole("link", { name: tab }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("button", { name: action }).first()).toBeVisible();
    }
  });
});

test.describe("меню ролей 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("менеджер: нижние вкладки Проверка, Табель, Неделя, Справочники и «Ещё»", async ({
    page,
  }) => {
    await open(page, "/gas");
    await gasRole(page, "Менеджер");
    const tabs = page.getByRole("navigation", { name: "Основные разделы" });
    // На узкой панели длинная подпись сокращается: «Справочн.»
    await expect(tabs.getByRole("link")).toHaveText([
      /^Проверка/,
      /^Табель/,
      /^Неделя/,
      /^Справочн/,
      /^Ещё/,
    ]);
  });
});
