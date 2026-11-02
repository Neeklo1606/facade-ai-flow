import type { Page } from "@playwright/test";

/**
 * Сменить роль через меню профиля оболочки газа (ADR-061, 3.1): на компьютере всплывающее
 * меню, на телефоне шторка из аватара. Ведёт на стартовый экран роли.
 */
export async function gasRole(page: Page, label: string) {
  // Профиль в шапке (ADR-061): на компьютере всплывающее меню, на телефоне шторка
  await page.getByRole("button", { name: /^Вы: / }).filter({ visible: true }).first().click();
  const list = page.getByRole("list", { name: "Роли" });
  if (!(await list.isVisible())) await page.getByRole("button", { name: /^Сменить роль/ }).click();
  await list.getByRole("button", { name: new RegExp(`^${label}`) }).click();
}

/** Тестовый ключ личной ссылки: им запущен сервер сквозных тестов (playwright.config.ts) */
export const CLIENT_LINK_KEY = "e2e-client-key";

/**
 * Войти в личный контур заказчика (ADR-047): личная ссылка ставит куку на вкладку.
 * Нужен проверкам, которые сверяют экраны с цифрами и файлом заказчика.
 */
export async function enterClientContour(page: Page) {
  await page.goto(`/gas?c=${CLIENT_LINK_KEY}`, { waitUntil: "domcontentloaded" });
}
