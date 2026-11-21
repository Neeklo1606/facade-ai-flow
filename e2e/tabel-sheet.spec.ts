import type { Page } from "@playwright/test";
import { expect, expectA11y, open, test } from "./fixtures";

/**
 * Табель на компьютере как таблица (ADR-081): строка ячейки с адресом и значением, буквы
 * столбцов и номера строк, клавиши Home, End, PageDown, Tab, F2, нижняя полоса одной строкой.
 */

const grid = (page: Page) => page.getByRole("grid", { name: "Табель в формате заказчика" });

test.describe("табель как таблица 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("строка ячейки, буквы, номера строк, сетка с прежней геометрией", async ({ page }) => {
    await open(page, "/gas/tabel");
    const bar = page.getByTestId("cell-bar");
    await expect(bar).toBeVisible();
    await expect(page.getByTestId("cell-ref")).toHaveText("–");
    await expect(page.getByTestId("column-letters")).toContainText("B");

    // Ячейка: адрес «B1», что за ячейка и значение
    const first = grid(page).locator('[data-cell="0:0"]');
    await first.click();
    await expect(page.getByTestId("cell-ref")).toHaveText("B1");
    const label = (await grid(page).getByRole("rowheader").first().textContent()) ?? "";
    await expect(bar).toContainText(label.replace(/^\d+/, "").trim().slice(0, 12));

    // Геометрия ADR-061 прежняя: сетка начинается не ниже 260 и идёт до низа окна
    const box = (await grid(page).boundingBox())!;
    expect(box.y).toBeLessThanOrEqual(260);
    expect(box.y + box.height).toBeGreaterThan(900 - 140);
    await expectA11y(page, "табель как таблица");
  });

  test("клавиши: End, Home, Shift+End, PageDown, Tab, F2", async ({ page }) => {
    await open(page, "/gas/tabel");
    const ref = page.getByTestId("cell-ref");
    await grid(page).locator('[data-cell="0:0"]').click();
    await page.keyboard.press("End");
    await expect(ref).not.toHaveText("B1");
    const last = (await ref.textContent()) ?? "";
    expect(last).toMatch(/^[A-Z]+1$/);
    await page.keyboard.press("Home");
    await expect(ref).toHaveText("B1");
    await page.keyboard.press("Shift+End");
    await expect(ref).toHaveText(`B1:${last}`);
    await page.keyboard.press("Home");
    await page.keyboard.press("Tab");
    await expect(ref).toHaveText("C1");
    await page.keyboard.press("Shift+Tab");
    await expect(ref).toHaveText("B1");
    await page.keyboard.press("PageDown");
    await expect(ref).not.toHaveText("B1");
    expect((await ref.textContent()) ?? "").toMatch(/^B\d+$/);
    // F2 открывает записи ячейки, как Enter
    await page.keyboard.press("ControlOrMeta+Home");
    await expect(ref).toHaveText("B1");
    await grid(page).locator('[data-status="draft"]').first().click();
    await page.keyboard.press("F2");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("буква столбца выделяет столбец, итоги и пометки одной строкой", async ({ page }) => {
    await open(page, "/gas/tabel");
    await page.getByTestId("column-letters").getByRole("columnheader").nth(1).click();
    await expect(page.getByTestId("cell-ref")).toHaveText(/^B1:B\d+$/);
    const stats = page.getByTestId("selection-stats");
    await expect(stats).toContainText("Сумма:");
    const marks = page.getByRole("group", { name: "Цвет выделенных ячеек" });
    const a = (await stats.boundingBox())!;
    const b = (await marks.boundingBox())!;
    // Итоги внутри полосы пометок: одна строка
    expect(a.y).toBeGreaterThanOrEqual(b.y - 1);
    expect(a.y + a.height).toBeLessThanOrEqual(b.y + b.height + 1);
  });
});
