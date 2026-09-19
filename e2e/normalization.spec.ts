import { expect, expectA11y, expectEmber, open, test } from "./fixtures";

/**
 * Нормализация и справочники (Q5, ADR-014): сопоставление с подтверждением, неподтверждённое
 * не уходит в запрос, подбор поставщиков по категории и региону, справочник с историей.
 */

test.describe("ПТО: сопоставление позиции с материалом", () => {
  test.use({ persona: "e-volkova" });

  test("система предлагает материал, человек подтверждает — видно кто и когда", async ({
    page,
  }) => {
    await open(page, "/projects/p-korona/documents/pd-korona-spec");
    await page
      .getByRole("button", { name: /Требуют внимания/ })
      .first()
      .click();
    await page.locator("[data-position-id]").first().click();
    const match = page.locator("[data-match]").first();
    await expect(match).toHaveAttribute("data-match", "suggested");
    await expect(match).toContainText("Предложено системой");
    await expect(match).toContainText("в запрос не уйдёт");

    await match.getByRole("button", { name: "Подтвердить сопоставление" }).click();
    await expect(
      page.locator("[data-sonner-toast]", { hasText: "Сопоставление подтверждено" }),
    ).toBeVisible();
    await expect(match).toHaveAttribute("data-match", "confirmed");
    await expect(match).toContainText("подтвердил Волкова");
  });
});

test.describe("снабжение: неподтверждённое не уходит в запрос, поставщики по категории и региону", () => {
  test.use({ persona: "e-dorohov" });

  test("позиция без подтверждённого материала не попадает в запрос, после подтверждения — попадает", async ({
    page,
  }) => {
    await open(page, "/projects/p-korona/materials?purchase=none");
    // Позиции без подтверждения помечены
    const marked = page.locator("main table tr", { hasText: "Сопоставление не подтверждено" });
    await expect(marked.first()).toBeVisible();
    // Номер позиции — моноширинная метка перед проектным названием
    const position = (
      await marked.first().locator("td").nth(2).locator(".mono").innerText()
    ).trim();

    // В мастере запроса такой позиции нет
    await page.getByRole("button", { name: "Создать запрос поставщикам" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/поз\. \d+\.\d+/).first()).toBeVisible();
    await expect(dialog.getByText(`поз. ${position} `, { exact: false })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Подтверждаем в карточке материала — теперь она в мастере
    await marked.first().click();
    await page.getByRole("button", { name: "Подтвердить сопоставление" }).click();
    await expect(
      page.locator("[data-sonner-toast]", { hasText: "Сопоставление подтверждено" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Создать запрос поставщикам" }).click();
    await expect(
      page.getByRole("dialog").getByText(`поз. ${position} `, { exact: false }),
    ).toHaveCount(1);
  });

  test("поставщики подобраны по категории материалов, регион объекта — первым", async ({
    page,
  }) => {
    await open(page, "/projects/p-korona/materials?purchase=none");
    await page.getByRole("button", { name: "Создать запрос поставщикам" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Далее/ }).click();
    await expect(dialog.getByText(/Подобраны по категориям материалов/)).toContainText(
      "Доборные элементы",
    );
    await expect(dialog.getByText(/Подобраны по категориям материалов/)).toContainText("Москва");
    // В основном списке — только Москва; другие регионы — отдельно, по кнопке
    const inRegion = await dialog.locator("ul").first().innerText();
    expect(inRegion).toContain("Москва");
    expect(inRegion).not.toContain("Санкт-Петербург");
    await dialog.getByRole("button", { name: /Показать поставщиков из других регионов/ }).click();
    await expect(dialog.getByText("Санкт-Петербург").first()).toBeVisible();
  });

  test("карточка поставщика: показатели по фактам, история запросов", async ({ page }) => {
    await open(page, "/projects/p-korona/procurement?view=suppliers");
    await page.locator("main table").getByRole("button", { name: "Фасад-Комплект" }).click();
    const card = page.getByRole("dialog");
    await expect(card.getByText("Как работает с нами")).toBeVisible();
    await expect(card.getByText("История запросов")).toBeVisible();
    await expect(card.getByText(/З-2026\/\d+/).first()).toBeVisible();
    await expectA11y(page, "карточка поставщика");
  });
});

test.describe("справочник номенклатуры", () => {
  test.use({ persona: "e-dorohov" });

  test("добавить материал: категория по правилу, запись в истории @mobile", async ({ page }) => {
    await open(page, "/catalogs");
    await expectEmber(page, "справочники");
    await expectA11y(page, "справочники");
    await page.getByRole("button", { name: "Добавить материал" }).first().click();
    const form = page.getByRole("dialog");
    await form
      .getByLabel("Нормализованное наименование")
      .fill("Кронштейн усиленный КУ-200, сталь оцинкованная");
    await form.getByLabel("Единица").fill("шт");
    await form.getByRole("button", { name: "Выбрать", exact: true }).click();
    await expect(form.getByLabel("Категория")).toHaveValue("cat-brackets");
    await form.getByLabel("Синонимы — по строке").fill("Кронштейн КУ-200");
    await form.getByRole("button", { name: "Добавить", exact: true }).click();
    await expect(
      page.locator("[data-sonner-toast]", { hasText: "Материал добавлен" }),
    ).toBeVisible();

    await page.getByPlaceholder("Название, синоним или написание в проекте").fill("КУ-200");
    await page
      .getByRole("button", { name: /Кронштейн усиленный КУ-200/ })
      .first()
      .click();
    await expect(page.getByRole("dialog").getByText("Материал создан")).toBeVisible();
    await expect(page.getByRole("dialog").getByText(/Дорохов/)).toBeVisible();
  });
});

test.describe("директор видит справочник без правки", () => {
  test.use({ persona: "e-belyaev" });
  test("кнопки добавления и правки нет", async ({ page }) => {
    await open(page, "/catalogs");
    await expect(page.getByRole("button", { name: "Добавить материал" })).toHaveCount(0);
    await page.locator("main table button").first().click();
    await expect(page.getByRole("dialog").getByText("История изменений")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Изменить" })).toHaveCount(0);
    await expectA11y(page, "карточка материала");
  });
});
