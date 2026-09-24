import { expect, open, test } from "./fixtures";

/**
 * Справка (ADR-019): открывается из меню, ищет, ведёт на живой экран, и подсказка экрана
 * приводит в нужную статью.
 */

test.describe("справка", () => {
  test.use({ persona: "e-gareev" });

  test("открывается из меню и показывает статьи роли первыми @mobile", async ({ page }) => {
    await open(page, "/help");
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
    // Прорабу первой нужна приёмка, а не права доступа. Статьи — ссылки: у каждой свой адрес
    const first = page
      .getByRole("navigation", { name: "Статьи справки" })
      .getByRole("link")
      .first();
    await expect(first).toContainText(/начать работу|принять поставку|отчитаться/);
  });

  test("поиск находит статью и говорит, когда не нашёл", async ({ page }) => {
    await open(page, "/help");
    const search = page.getByRole("textbox", { name: "Поиск по справке" });

    await search.fill("приёмка");
    await expect(page.getByRole("heading", { name: /принять поставку/ })).toBeVisible();

    await search.fill("квазар");
    await expect(page.getByText("По этому запросу статей нет")).toBeVisible();
    await page.getByRole("button", { name: "Показать все статьи" }).click();
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
  });

  test("шаг статьи ведёт на живой экран", async ({ page }) => {
    await open(page, "/help?article=delivery");
    await page.getByRole("link", { name: "Открыть экран" }).first().click();
    await expect(page).toHaveURL(/\/deliveries/);
    await expect(page.getByText("Поставки").first()).toBeVisible();
  });
});

test.describe("шаг в закрытый роли раздел", () => {
  test.describe("прораб", () => {
    test.use({ persona: "e-gareev" });

    test("вместо ссылки — причина, а не стена", async ({ page }) => {
      await open(page, "/help?article=start");
      const article = page.locator("article");
      // Шаг остаётся: прорабу полезно знать, как устроена работа целиком
      await expect(article.getByText("Откройте дашборд", { exact: false })).toBeVisible();
      await expect(article.getByText(/Экран «Дашборд» вашей роли закрыт/)).toBeVisible();
      await expect(article.locator('a[href="/"]')).toHaveCount(0);
    });
  });

  test.describe("руководитель проекта", () => {
    test.use({ persona: "e-sokolov" });

    test("тот же шаг даёт живой экран", async ({ page }) => {
      await open(page, "/help?article=start");
      const article = page.locator("article");
      await expect(article.getByRole("link", { name: "Открыть экран" }).first()).toBeVisible();
      await expect(article.getByText(/вашей роли закрыт/)).toHaveCount(0);
    });
  });
});

test.describe("сравнение с альтернативами", () => {
  test.use({ persona: "e-sokolov" });

  test("статья показывает пять параметров и честную пометку «не проверено»", async ({ page }) => {
    await open(page, "/help?article=alternatives");
    const section = page.getByRole("region", { name: "Сравнение с другими системами" });
    await expect(section).toBeVisible();
    // Пять параметров, о которых договорились: больше на встрече не обсуждают
    await expect(section.getByRole("heading", { level: 3 })).toHaveCount(5);
    await expect(section.getByText("не проверено").first()).toBeVisible();
    // Наружу из показа не уводим: ссылок на чужие сайты в статье нет
    await expect(section.locator('a[href^="http"]')).toHaveCount(0);
  });
});

test.describe("подсказка экрана ведёт в справку", () => {
  test.use({ persona: "e-sokolov" });

  test("с экрана поставок — в статью о приёмке", async ({ page }) => {
    await open(page, "/projects/p-korona/deliveries");
    await page.getByRole("button", { name: /Что это за экран/ }).click();
    const link = page.getByRole("link", { name: /в справке/ });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/help\?article=delivery/);
    await expect(page.getByRole("heading", { name: /принять поставку/ })).toBeVisible();
  });
});
