import { expect, expectA11y, open, test } from "./fixtures";

/**
 * Раздел «Снабжение» (ADR-031). Проверяется то, ради чего задача делалась: контур от
 * спецификации до приёмки проходится одной полосой вкладок, без возврата в меню. И то, что
 * слиянием легко сломать: вкладка закрытого раздела роли не показывается.
 */

const TABS = ["Спецификация", "Запросы", "Поставщики", "Поставки"];

test.describe("снабжение", () => {
  test.use({ persona: "e-dorohov" });

  test("четыре вкладки раздела на каждом его экране @mobile", async ({ page }) => {
    for (const path of ["/materials", "/procurement", "/deliveries"]) {
      await open(page, `/projects/p-korona${path}`);
      const strip = page.getByRole("tablist", { name: "Разделы снабжения" });
      await expect(strip).toBeVisible();
      for (const label of TABS) {
        await expect(strip.getByRole("tab", { name: new RegExp(label) })).toBeVisible();
      }
    }
  });

  test("от спецификации до приёмки — по вкладкам, без возврата в меню @mobile", async ({
    page,
  }) => {
    await open(page, "/projects/p-korona/materials");
    const strip = page.getByRole("tablist", { name: "Разделы снабжения" });

    await strip.getByRole("tab", { name: /Запросы/ }).click();
    await expect(page).toHaveURL(/\/projects\/p-korona\/procurement/);

    await strip.getByRole("tab", { name: /Поставщики/ }).click();
    await expect(page).toHaveURL(/view=suppliers/);

    await strip.getByRole("tab", { name: /Поставки/ }).click();
    await expect(page).toHaveURL(/\/projects\/p-korona\/deliveries/);

    // Вкладка, на которой человек стоит, отмечена — и это та, куда он нажал
    await expect(strip.getByRole("tab", { selected: true })).toHaveText(/Поставки/);
    await expectA11y(page, "вкладки снабжения");
  });

  test("шапка называет раздел, вкладку называет полоса @mobile", async ({ page }) => {
    await open(page, "/projects/p-korona/materials");
    await expect(page.locator("header").getByText("Снабжение", { exact: true })).toBeVisible();
  });

  test("в меню один пункт раздела вместо четырёх", async ({ page }) => {
    await open(page, "/projects/p-korona/procurement");
    // Сайдбар отрисован дважды: боковой на десктопе и шторка меню на телефоне
    await expect(page.locator('[data-tour="nav-supply"]').first()).toBeVisible();
    for (const key of ["materials", "procurement", "deliveries", "suppliers"]) {
      await expect(page.locator(`[data-tour="nav-${key}"]`)).toHaveCount(0);
    }
  });
});

test.describe("вкладки собираются из прав роли", () => {
  test.use({ persona: "e-volkova" });

  test("у ПТО раздел — один экран запросов: полосы нет @mobile", async ({ page }) => {
    await open(page, "/projects/p-korona/procurement");
    // Выбор из одной вкладки обещает выбор, которого нет (ADR-031, п. 2)
    await expect(page.getByRole("tablist", { name: "Разделы снабжения" })).toHaveCount(0);
    // И экран запросов при этом цел: на телефоне список рисуется карточками, таблица скрыта
    await expect(page.getByText("З-2026/323").filter({ visible: true }).first()).toBeVisible();
  });
});

test.describe("прораб участвует в контуре двумя вкладками", () => {
  test.use({ persona: "e-gareev" });

  test("спецификация и поставки — есть, запросы и поставщики — нет @mobile", async ({ page }) => {
    await open(page, "/projects/p-korona/deliveries");
    const strip = page.getByRole("tablist", { name: "Разделы снабжения" });
    await expect(strip.getByRole("tab", { name: /Спецификация/ })).toBeVisible();
    await expect(strip.getByRole("tab", { name: /Поставки/ })).toBeVisible();
    await expect(strip.getByRole("tab", { name: /Запросы/ })).toHaveCount(0);
    await expect(strip.getByRole("tab", { name: /Поставщики/ })).toHaveCount(0);
  });
});
