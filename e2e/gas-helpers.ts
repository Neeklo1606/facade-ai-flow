import type { Page } from "@playwright/test";

/**
 * Сменить роль через переключатель оболочки газа (ADR-044, F1): на десктопе кнопка
 * в сайдбаре «Вы смотрите как», на телефоне аватар в шапке. Ведёт на стартовый экран роли.
 */
export async function gasRole(page: Page, label: string) {
  const wide = page.getByRole("button", { name: /Вы смотрите как/ });
  if (await wide.isVisible()) await wide.click();
  else await page.getByRole("button", { name: /^Вы: .*Сменить роль/ }).click();
  await page
    .getByRole("list", { name: "Роли" })
    .getByRole("button", { name: new RegExp(`^${label}`) })
    .click();
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
