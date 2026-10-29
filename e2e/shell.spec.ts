import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Оболочка «Монохром» и поиск (ADR-055, разделы 2.1, 2.5, 2.6): навигация и палитра на 390,
 * 768 и 1440, без прокрутки вбок, клавиатура проходит оболочку, права роли в поиске.
 */

const palette = (page: Page) => page.getByRole("dialog", { name: "Поиск в системе" });

async function openSearch(page: Page) {
  const width = page.viewportSize()?.width ?? 1440;
  if (width >= 1024) await page.keyboard.press("ControlOrMeta+k");
  else await page.getByRole("button", { name: "Поиск", exact: true }).click();
  await expect(palette(page)).toBeVisible();
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test.describe(`учёт времени ${viewport.width}`, () => {
    test.use({ viewport });

    test("меню роли ведёт по разделам, без прокрутки вбок", async ({ page }) => {
      await open(page, "/gas/moderation");
      const desktop = viewport.width >= 1024;
      const nav = desktop
        ? page.getByRole("navigation", { name: "Разделы", exact: true })
        : page.getByRole("navigation", { name: "Основные разделы" });
      await expect(nav).toBeVisible();
      await nav.getByRole("link", { name: /Журнал/ }).click();
      await expect(page).toHaveURL(/\/gas\/entries/);
      await expect(nav.getByRole("link", { name: /Журнал/ })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    });

    test("поиск находит запись по номеру без нулей и ведёт в журнал", async ({ page }) => {
      await open(page, "/gas/moderation");
      await openSearch(page);
      await page.getByRole("combobox", { name: "Что найти" }).fill("100");
      const records = palette(page).getByRole("group", { name: "Записи" });
      await expect(records.getByRole("option").first()).toContainText("ГЗ-00100");
      // Совпадение подсвечено
      await expect(records.locator("mark").first()).toHaveText("100");
      await records.getByRole("option").first().click();
      await expect(page).toHaveURL(/\/gas\/entries\?q=/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    });
  });
}

test.describe("поиск и права роли", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("«ё» и «е» равны, пустой результат даёт совет", async ({ page }) => {
    await open(page, "/gas/moderation");
    await openSearch(page);
    const input = page.getByRole("combobox", { name: "Что найти" });
    await input.fill("тём");
    await expect(palette(page).getByRole("group", { name: "Действия" })).toContainText(
      "Сменить тему",
    );
    await input.fill("щщщ");
    await expect(palette(page)).toContainText("Ничего не найдено");
    await expect(palette(page)).toContainText("номер записи");
  });

  test("бригадир не находит сумм, смет и людей", async ({ page }) => {
    await open(page, "/gas/moderation");
    await gasRole(page, "Бригадир");
    await expect(page).toHaveURL(/\/gas\/brigade/);
    await openSearch(page);
    const input = page.getByRole("combobox", { name: "Что найти" });
    for (const query of ["гз", "демо", "бригада"]) {
      await input.fill(query);
      const text = await palette(page).innerText();
      expect(text, query).not.toMatch(/₽/u);
      await expect(palette(page).getByRole("group", { name: "Сметы" })).toHaveCount(0);
      await expect(palette(page).getByRole("group", { name: "Люди" })).toHaveCount(0);
      await expect(palette(page).getByRole("group", { name: "Бригады" })).toHaveCount(0);
    }
  });

  test("клавиатура проходит оболочку: знак, меню, колокольчик, аватар, капсула", async ({
    page,
  }) => {
    await open(page, "/gas/moderation");
    const seen = new Set<string>();
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press("Tab");
      const name = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el?.getAttribute("aria-label") ?? el?.textContent?.trim() ?? "";
      });
      seen.add(name);
    }
    const all = [...seen].join(" | ");
    expect(all).toMatch(/на старт/);
    expect(all).toMatch(/Журнал/);
    expect(all).toMatch(/Требует внимания/);
    expect(all).toMatch(/Сменить роль/);
    expect(all).toMatch(/Поиск/);
  });
});

test.describe("ГАЙКА 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 }, persona: "e-sokolov" });

  test("главное меню, капсула и палитра поиска", async ({ page }) => {
    await open(page, "/attention");
    const menu = page.getByRole("navigation", { name: "Главное меню" });
    await expect(menu.getByRole("link", { name: "Обзор" })).toHaveAttribute("aria-current", "page");
    await menu.getByRole("link", { name: "Входящие" }).click();
    await expect(page).toHaveURL(/\/inbox/);
    await page
      .getByRole("complementary", { name: "Панель действий" })
      .getByRole("button", { name: /Найти в системе/ })
      .click();
    await expect(page.getByRole("dialog", { name: "Поиск в системе" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  });
});
