import { expect, open, test } from "./fixtures";

/*
 * Навигация телефона (ADR-048 заменяет ADR-046 до 767 px). Выдвижного меню больше нет:
 * его проверки доступности (фокус в окне, Escape, возврат фокуса, переход к разделу)
 * перенесены на шторку ролей из аватара и на экран «Ещё». Файл из Lovable сохранён:
 * проверки по-прежнему нужны, поменялось только место, где они живут.
 */
test.describe("навигация телефона @mobile", () => {
  test.use({ viewport: { width: 375, height: 812 }, persona: "e-sokolov" });

  test("шторка ролей: Escape закрывает и возвращает фокус, «Ещё» открывает раздел @mobile", async ({
    page,
  }) => {
    await open(page, "/check");
    // Бургера нет: одна навигация, вкладки и «Ещё»
    await expect(page.getByRole("button", { name: "Открыть меню", exact: true })).toHaveCount(0);
    const avatar = page.getByRole("button", { name: /^Вы смотрите как .*Сменить роль$/ });
    const sheet = page.getByRole("dialog", { name: "Вы смотрите как", exact: true });
    await avatar.click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(avatar).toBeFocused();

    await page
      .getByRole("navigation", { name: "Основная навигация" })
      .getByRole("link", { name: "Ещё" })
      .click();
    await expect(page).toHaveURL(/\/more$/);
    await page.getByRole("link", { name: "Справка", exact: true }).click();
    await expect(page).toHaveURL(/\/help/);
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page).toHaveURL(/\/more$/);
  });
});
