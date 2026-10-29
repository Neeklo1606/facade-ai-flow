import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Одна модель навигации телефона (ADR-048, шаг L2): вкладки и экран «Ещё», без выдвижного меню;
 * у вкладки своя история, повторное касание ведёт наверх и к корню; «Назад» на вложенных;
 * системный «назад» закрывает шторку; каждый раздел роли достижим за 2 касания.
 */

const tabbar = (page: Page) => page.getByRole("navigation", { name: "Основная навигация" });
const gasTabbar = (page: Page) => page.getByRole("navigation", { name: "Основные разделы" });

const GAIKA = [
  { persona: "e-gareev", role: "прораб", tabs: ["Сегодня", "Объекты", "Входящие", "Ещё"] },
  { persona: "e-volkova", role: "ПТО", tabs: ["Проверка", "Объекты", "Входящие", "Ещё"] },
  { persona: "e-dorohov", role: "снабжение", tabs: ["Входящие", "Объекты", "Ещё"] },
  { persona: "e-sokolov", role: "руководитель", tabs: ["Обзор", "Объекты", "Входящие", "Ещё"] },
] as const;

for (const item of GAIKA) {
  test.describe(`ГАЙКА, ${item.role} 390`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, persona: item.persona });

    test("одна навигация: вкладки роли, голос по центру, каждый раздел за 2 касания", async ({
      page,
    }) => {
      // Канон показа: как видит зритель, без флага legacy_modules
      await page.addInitScript(() => {
        try {
          sessionStorage.removeItem("neeklo-fieldops-legacy");
        } catch {
          // Приватный режим
        }
      });
      await open(page, "/app");
      await expect(page.getByRole("button", { name: "Открыть меню" })).toHaveCount(0);
      const links = tabbar(page).getByRole("link");
      await expect(links).toHaveText(item.tabs.map((label) => new RegExp(label)));
      // Голосовая кнопка 56 строго по центру экрана
      const mic = await tabbar(page)
        .getByRole("button", { name: /^Говорить/ })
        .boundingBox();
      expect(mic && Math.abs(mic.x + mic.width / 2 - 195)).toBeLessThanOrEqual(1);
      expect(mic?.width).toBe(56);

      // «Ещё»: экран, а не шторка; каждый раздел роли открывается вторым касанием
      await tabbar(page).getByRole("link", { name: "Ещё" }).click();
      await expect(page).toHaveURL(/\/more$/);
      const sections = page.getByRole("region", { name: "Разделы" }).getByRole("link");
      const count = await sections.count();
      for (let i = 0; i < count; i++) {
        const row = page.getByRole("region", { name: "Разделы" }).getByRole("link").nth(i);
        const label = (await row.innerText()).trim();
        await row.click();
        await expect(page.locator("main"), label).not.toContainText("Раздел не найден");
        await expect(page.locator("[data-screen=no-access]"), label).toHaveCount(0);
        await open(page, "/more");
      }
    });
  });
}

test.describe("история вкладок и повторное касание 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, persona: "e-sokolov" });

  test("возврат на вкладку сохраняет экран и прокрутку; повторное касание наверх и к корню", async ({
    page,
  }) => {
    await open(page, "/more");
    const main = page.locator("main[data-scroll-root]");
    const scroll = () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLElement>("main[data-scroll-root]")!;
        return el.scrollHeight > el.clientHeight + 1 ? el.scrollTop : window.scrollY;
      });
    const scrollTo = (top: number) =>
      page.evaluate((y) => {
        const el = document.querySelector<HTMLElement>("main[data-scroll-root]")!;
        if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = y;
        else window.scrollTo(0, y);
      }, top);

    // Вложенный экран вкладки «Ещё»: справка с «Назад»
    await page.getByRole("link", { name: "Справка", exact: true }).click();
    await expect(page).toHaveURL(/\/help/);
    await expect(page.getByRole("button", { name: "Назад", exact: true })).toBeVisible();
    await scrollTo(400);
    await expect.poll(scroll).toBeGreaterThan(300);

    // Другая вкладка и обратно: тот же экран и та же прокрутка
    await tabbar(page).getByRole("link", { name: "Входящие" }).click();
    await expect(page).toHaveURL(/\/inbox/);
    await tabbar(page).getByRole("link", { name: "Ещё" }).click();
    await expect(page).toHaveURL(/\/help/);
    await expect.poll(scroll).toBeGreaterThan(300);

    // Повторное касание: сначала наверх, затем к корню вкладки
    await tabbar(page).getByRole("link", { name: "Ещё" }).click();
    await expect.poll(scroll).toBeLessThanOrEqual(4);
    await expect(page).toHaveURL(/\/help/);
    await tabbar(page).getByRole("link", { name: "Ещё" }).click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(main).toBeVisible();
  });

  test("системный «назад» закрывает шторку, а не уводит с экрана", async ({ page }) => {
    await open(page, "/attention");
    await page.getByRole("button", { name: /^Вы смотрите как .*Сменить роль$/ }).click();
    const sheet = page.getByRole("dialog", { name: "Вы смотрите как", exact: true });
    await expect(sheet).toBeVisible();
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/attention$/);
  });
});

// ADR-055, 2.5: четыре пункта роли и «Ещё»; руководитель начинает с «Обзора» (ADR-052)
const GAS = [
  { role: "Менеджер", tabs: ["Проверка", "Журнал", "Отчёт", "Объекты", "Ещё"] },
  { role: "Руководитель", tabs: ["Обзор", "Отчёт", "Журнал", "Объекты", "Ещё"] },
  { role: "Администратор", tabs: ["Проверка", "Объекты", "Стоимость", "Люди", "Ещё"] },
] as const;

test.describe("учёт выработки 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const item of GAS) {
    test(`${item.role}: вкладки по 01_SPEC 4.3 и «Ещё» экраном`, async ({ page }) => {
      await open(page, "/gas");
      await gasRole(page, item.role);
      await expect(gasTabbar(page).getByRole("link")).toHaveText(
        item.tabs.map((label) => new RegExp(label)),
      );
      await gasTabbar(page).getByRole("link", { name: "Ещё" }).click();
      await expect(page).toHaveURL(/\/gas\/more$/);
      await expect(page.getByRole("button", { name: "Сменить роль", exact: true })).toBeVisible();
    });
  }

  test("бригадир: бот на весь экран, одна шапка, «Мои записи» сверху", async ({ page }) => {
    await open(page, "/gas/moderation");
    await gasRole(page, "Бригадир");
    await expect(page).toHaveURL(/\/gas\/foreman/);
    await expect(gasTabbar(page)).toHaveCount(0);
    // Одна шапка: шапка чата, без шапки контура и плашки «Так выглядит бот»
    await expect(page.locator("header.shell-header").filter({ visible: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Мои записи" }).click();
    await expect(page).toHaveURL(/\/gas\/entries/);
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page).toHaveURL(/\/gas\/foreman/);
  });

  test("вложенный экран: «Назад» возвращает в «Ещё»", async ({ page }) => {
    await open(page, "/gas/more");
    await page.getByRole("link", { name: "Инструкция" }).click();
    await expect(page).toHaveURL(/\/gas\/guide/);
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page).toHaveURL(/\/gas\/more$/);
  });
});
