import { expect, open, test } from "./fixtures";

test.describe("выдвижная навигация @mobile", () => {
  test.use({ viewport: { width: 375, height: 812 }, persona: "e-sokolov" });

  test("закрытие возвращает фокус, переход открывает выбранный раздел @mobile", async ({
    page,
  }) => {
    await open(page, "/check");
    const trigger = page.getByRole("button", { name: "Открыть меню", exact: true });
    const panel = page.getByRole("dialog", { name: "Главное меню", exact: true });
    await trigger.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await panel.getByRole("link", { name: "Объекты", exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(/\/projects$/);
    await trigger.click();
    await panel.getByRole("button", { name: "Закрыть меню", exact: true }).click();
    await expect(panel).toBeHidden();
  });
});
