import { expect, open, test } from "./fixtures";
import { mobileCheck } from "./mobile-checks";
import { enterClientContour, gasRole } from "./gas-helpers";

/**
 * Рабочий контур газа (ADR-043, ADR-044, F1): экраны открываются в своей оболочке без
 * элементов ГАЙКИ, роль меняет стартовый экран и меню, сброс демо возвращает исходный набор.
 * Сценарии экранов живут рядом: gas-bot, gas-review, gas-report, gas-start, gas-show.
 *
 * Ошибка в консоли роняет тест: это общая оснастка e2e.
 */

const GAS_SCREENS = [
  "/gas",
  "/gas/foreman",
  "/gas/moderation",
  "/gas/entries",
  "/gas/reports",
  "/gas/brigades",
  "/gas/objects",
  "/gas/estimates",
  "/gas/employees",
  "/gas/summary",
  "/gas/overview",
  "/gas/admin",
  "/gas/guide",
  "/gas/questions",
  "/gas/finish",
];

/** Тексты и кнопки ГАЙКИ, которых в контуре газа быть не должно (F1, проверка) */
const GAIKA_MARKERS = ["Фасад-Проект", "Входящие", "Отчёты с площадки"];

const toast = (page: import("@playwright/test").Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });

test.describe("контур газа открывается в своей оболочке", () => {
  for (const path of GAS_SCREENS) {
    test(`экран ${path} без ошибок и без ГАЙКИ`, async ({ page }) => {
      await open(page, path);
      // Один видимый заголовок на экран, его ставит оболочка (ADR-055, 2.1 и 2.5): на телефоне
      // в шапке 56, на компьютере заголовком экрана 44/48 над контентом
      const headings = page.locator("h1").filter({ visible: true });
      await expect(headings).toHaveCount(1);
      await expect(
        page.locator("header h1, h1[data-screen-title], main > div > h1").filter({ visible: true }),
      ).toHaveCount(1);
      const text = await page.locator("body").innerText();
      for (const marker of GAIKA_MARKERS)
        expect(text, `${marker} на ${path}`).not.toContain(marker);
      await expect(page.getByRole("button", { name: /Говорить/ })).toHaveCount(0);
    });
  }

  test("граница договора подписана в меню один раз", async ({ page }) => {
    // Договор газового заказчика: граница видна в его личном контуре, в публичном её нет (L3).
    // В «Монохроме» группы разделов живут в «Ещё» меню-таблетки (ADR-055, 2.4)
    const moreMenu = async () => {
      await page
        .getByRole("navigation", { name: "Разделы", exact: true })
        .getByRole("button", { name: "Ещё" })
        .click();
      return page.getByRole("dialog", { name: "Остальные разделы" });
    };
    await open(page, "/gas/moderation");
    await expect((await moreMenu()).getByText("Вне договора v1.0")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await enterClientContour(page);
    await open(page, "/gas/moderation");
    await expect((await moreMenu()).getByText("Вне договора v1.0", { exact: false })).toHaveCount(
      1,
    );
    await expect(page.getByText("Демо: вне текущего договора")).toHaveCount(0);
  });
});

test.describe("роль", () => {
  test("смена роли ведёт на стартовый экран роли и прячет пункты", async ({ page }) => {
    await open(page, "/gas/moderation");
    await gasRole(page, "Руководитель");
    // ADR-056: руководитель начинает с «Недели»
    await expect(page).toHaveURL(/\/gas\/week/);
    await expect(toast(page, /Вы смотрите как руководитель/)).toBeVisible();
    // Проверку ведёт менеджер: у руководителя пункта нет вовсе, а не серый
    const menu = page.getByRole("navigation", { name: "Разделы", exact: true });
    await expect(menu.getByRole("link", { name: "Проверка" })).toHaveCount(0);

    await gasRole(page, "Бригадир");
    await expect(page).toHaveURL(/\/gas\/brigade/);
  });

  test("ГАЙКА живёт в своей оболочке: меню газа на её экранах нет", async ({ page }) => {
    await open(page, "/today");
    await expect(page.getByRole("navigation", { name: "Разделы", exact: true })).toHaveCount(0);
  });
});

test.describe("сброс демо", () => {
  test("возвращает исходную роль", async ({ page }) => {
    await open(page, "/gas/moderation");
    await gasRole(page, "Руководитель");
    // «Сбросить демо» живёт в меню аватара (ADR-055, 2.1)
    await page.getByRole("button", { name: /^Вы: Руководитель.*Сменить роль/ }).click();
    await page.getByRole("button", { name: "Сбросить демо" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Сбросить" }).click();
    await expect(toast(page, "Демо сброшено")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Вы: Менеджер проверки\. Сменить роль/ }),
    ).toBeVisible();
  });
});

test.describe("@mobile телефон", () => {
  // Размер экрана ставится здесь, а не проектом: набор @mobile прогоняется и на рабочем столе
  test.use({ viewport: { width: 375, height: 812 } });

  for (const path of GAS_SCREENS) {
    test(`${path} без горизонтальной прокрутки страницы`, async ({ page }) => {
      await open(page, path);
      const checks = await mobileCheck(page);
      expect(checks.overflow.offenders, `переполнение на ${path}`).toEqual([]);
      expect(checks.overflow.scrollWidth).toBeLessThanOrEqual(375);
    });
  }

  test("нижняя панель по роли: четыре раздела и «Ещё» с остальным", async ({ page }) => {
    await open(page, "/gas/moderation");
    const nav = page.getByRole("navigation", { name: "Основные разделы" });
    // Четыре раздела роли и «Ещё» вкладкой-экраном (ADR-055, 2.5; ADR-048)
    await expect(nav.getByRole("link")).toHaveCount(5);
    await nav.getByRole("link", { name: "Ещё" }).click();
    await expect(page).toHaveURL(/\/gas\/more$/);
    await expect(page.getByRole("main").getByRole("link", { name: "Инструкция" })).toBeVisible();
  });
});
