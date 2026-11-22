import { expect, expectA11y, test } from "./fixtures";
import { gasRole } from "./gas-helpers";
import type { Page } from "@playwright/test";

/**
 * Окна документов «как в 1С» (ADR-084): акт открывается окном поверх списка, правки копятся
 * до «Записать», закрытие с незаписанным спрашивает, окно двигается и меняет размер,
 * несколько окон и полоса открытых окон. Телефон: акт страницей, как раньше.
 */
const ACT1 = /АОСР №\s1(?!\d)/;
const ACT2 = /АОСР №\s2(?!\d)/;

async function docsAsPto(page: Page) {
  await page.goto("/gas", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("html[data-booted]", { timeout: 60_000 });
  await gasRole(page, "ПТО");
  await expect(page).toHaveURL(/\/gas\/docs$/);
  const create = page.getByRole("button", { name: "Создать черновики актов" });
  if (await create.isEnabled()) {
    await create.click();
    await expect(page.getByText("Черновиков создано: 2")).toBeVisible();
  }
}

test.describe("окна документов 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("правка в окне: звёздочка, вопрос при закрытии, «Записать и закрыть», источник «Исправил»", async ({
    page,
  }) => {
    await docsAsPto(page);
    await page.getByRole("button", { name: ACT1 }).first().click();
    const win = page.getByRole("dialog", { name: ACT1 });
    await expect(win).toBeVisible();
    // Список остаётся на месте: окно поверх, адрес тот же
    await expect(page).toHaveURL(/\/gas\/docs$/);
    await expect(page.getByRole("table", { name: "Акты объекта" })).toBeVisible();
    await expectA11y(page, "окно акта");

    const field = win.getByRole("textbox").first();
    const before = await field.inputValue();
    await field.fill(`${before} (уточнено)`);
    await expect(win.locator(".gas-window-dirty")).toContainText("не записано");
    await expect(win.getByText("Будет: Исправил, после «Записать»")).toBeVisible();

    // Escape спрашивает, «Отмена» оставляет правку
    await field.press("Escape");
    const ask = win.getByRole("alertdialog", { name: "Изменения не записаны" });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Отмена" }).click();
    await expect(ask).toHaveCount(0);
    await expect(field).toHaveValue(`${before} (уточнено)`);

    await win.getByRole("button", { name: "Закрыть окно" }).click();
    await ask.getByRole("button", { name: "Записать и закрыть" }).click();
    await expect(win).toHaveCount(0);
    await expect(page.getByText(/Записано: 1 поле/)).toBeVisible();

    // Повторное открытие: значение записано, источник «Исправил»
    await page.getByRole("button", { name: ACT1 }).first().click();
    await expect(win.getByRole("textbox").first()).toHaveValue(`${before} (уточнено)`);
    await expect(win.getByText(/Источник: Исправил/).first()).toBeVisible();
  });

  test("окно двигается за заголовок, меняет размер, разворачивается; два окна и полоса", async ({
    page,
  }) => {
    await docsAsPto(page);
    await page.getByRole("button", { name: ACT1 }).first().click();
    const one = page.getByRole("dialog", { name: ACT1 });
    const start = (await one.boundingBox())!;
    const head = one.locator(".gas-window-head");
    await head.hover({ position: { x: 80, y: 18 } });
    await page.mouse.down();
    await page.mouse.move(start.x + 80 - 120, start.y + 18 + 40, { steps: 6 });
    await page.mouse.up();
    const moved = (await one.boundingBox())!;
    expect(Math.round(moved.x)).toBe(Math.round(start.x - 120));
    expect(Math.round(moved.y)).toBe(Math.round(start.y + 40));

    // Размер за угол
    const grip = one.locator(".gas-window-grip");
    const g = (await grip.boundingBox())!;
    await page.mouse.move(g.x + 8, g.y + 8);
    await page.mouse.down();
    await page.mouse.move(g.x + 8 - 100, g.y + 8 - 60, { steps: 6 });
    await page.mouse.up();
    const resized = (await one.boundingBox())!;
    expect(Math.round(resized.width)).toBe(Math.round(moved.width - 100));

    // Второе окно поверх, полоса открытых окон с двумя
    await page.getByRole("button", { name: ACT2 }).first().click({ force: true });
    const two = page.getByRole("dialog", { name: ACT2 });
    await expect(two).toBeVisible();
    const bar = page.getByRole("navigation", { name: "Открытые окна" });
    await expect(bar.getByRole("button")).toHaveCount(2);
    await expect(bar.getByRole("button", { name: ACT2 })).toHaveAttribute("aria-current", "true");

    // Свернуть второе, вернуть из полосы
    await two.getByRole("button", { name: "Свернуть окно" }).click();
    await expect(two).toBeHidden();
    await bar.getByRole("button", { name: ACT2 }).click();
    await expect(two).toBeVisible();

    // Развернуть: окно на рабочую область, двойной щелчок по заголовку возвращает
    await two.getByRole("button", { name: "Развернуть окно" }).click();
    const max = (await two.boundingBox())!;
    expect(max.width).toBeGreaterThan(1100);
    await two.locator(".gas-window-head").dblclick({ position: { x: 60, y: 18 } });
    expect((await two.boundingBox())!.width).toBeLessThan(1000);

    // Смена роли закрывает окна
    await gasRole(page, "Прораб");
    await expect(page.getByRole("dialog", { name: ACT1 })).toHaveCount(0);
    await expect(bar).toHaveCount(0);
  });
});

test.describe("окна документов 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("на телефоне акт открывается страницей @mobile", async ({ page }) => {
    await docsAsPto(page);
    await page.getByRole("button", { name: ACT1 }).first().click();
    await expect(page).toHaveURL(/\/gas\/docs\/[^/]+$/);
    await expect(page.getByRole("dialog", { name: ACT1 })).toHaveCount(0);
  });
});
