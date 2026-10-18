import { expect, open, test } from "./fixtures";

/**
 * Три демо-сценария от ввода до результата (ADR-037). Это проверка показа целиком:
 * прораб говорит, ПТО проверяет и скачивает документ, снабжение решает по заявке.
 *
 * Проверяется то, ради чего демонстрация делается: что экран не врёт и что файл
 * действительно скачивается, а не рисуется кнопкой.
 */

test.describe("сценарий 1: объект → учёт", () => {
  test.use({ persona: "e-gareev" });

  test("пример смены разбирается и становится отчётом @mobile", async ({ page }) => {
    await open(page, "/capture");
    // Подготовленные примеры показа: нажатие ставит текст и прогоняет разбор
    await page.getByRole("button", { name: "Смена", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Что система услышала" })).toBeVisible();
    await expect(page.getByText("разбор подготовлен заранее")).toBeVisible();

    // Карточки разбора: работы, люди и часы, план на завтра
    await expect(page.getByRole("heading", { name: "Работы" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Люди и часы" })).toBeVisible();
    await expect(page.getByText("96 м²")).toBeVisible();

    // Источник значения виден по кнопке, а не прячется
    await page.getByRole("button", { name: "Показать источник" }).first().click();
    // Источник — это фраза из сообщения, а не пересказ
    await expect(page.getByText(/«облицовки из керамогранита»/)).toBeVisible();

    // «Верно» заводит отчёт: он уходит на проверку, а не в сводку
    await page.getByRole("button", { name: /Верно/ }).click();
    await expect(page.getByRole("button", { name: /Отчёт заведён/ })).toBeVisible();

    await open(page, "/today");
    // Новая строка видна именно как новая: захватка примера в демонстрации ещё не встречалась
    await expect(page.locator("main")).toContainText("Стилобат, оси А–Р");
    await expect(page.locator("main")).toContainText("96");
  });

  test("сводка смены скачивается файлом @mobile", async ({ page }) => {
    await open(page, "/today");
    await expect(page.getByRole("heading", { name: "Сводка смены" })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать Excel" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toContain(".xlsx");
    expect(file.suggestedFilename()).toContain("Сводка");
  });
});

test.describe("сценарий 2: ПТО → черновик документа", () => {
  test.use({ persona: "e-volkova" });

  test("ПТО принимает факт и скачивает черновик ведомости @mobile", async ({ page }) => {
    await open(page, "/check");
    // Дозаполнение недостающего: принятый объём вводит ПТО, а не подставляет система
    await page.getByRole("button", { name: "Исправить объём" }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("textbox").first().fill("180");
    await sheet
      .getByRole("button", { name: /^Принять/ })
      .first()
      .click();
    await expect(sheet).toBeHidden();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать черновик ведомости" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toContain(".xlsx");
    expect(file.suggestedFilename()).toContain("Ведомость-черновик");
  });
});

test.describe("сценарий 3: заявка с площадки", () => {
  test.use({ persona: "e-gareev" });

  test("прораб создаёт заявку из разбора @mobile", async ({ page }) => {
    await open(page, "/capture");
    await page.getByRole("button", { name: "Нехватка материала" }).click();
    await expect(page.getByRole("heading", { name: "Что система услышала" })).toBeVisible();
    await page.getByRole("button", { name: /Создать заявку/ }).click();

    // Количество и единица подставлены из фразы, дата — из срока ответа
    await expect(page.getByLabel("Количество")).toHaveValue("12");
    await expect(page.getByLabel("Единица измерения")).toHaveValue("шт");
    await page.getByRole("button", { name: "Отправить снабжению" }).click();
    await expect(page.getByRole("button", { name: "Заявка создана" })).toBeVisible();
  });
});

test.describe("сценарий 3: решение снабжения", () => {
  test.use({ persona: "e-dorohov" });

  test("снабжение видит заявку и меняет статус @mobile", async ({ page }) => {
    await open(page, "/inbox");
    await expect(page.getByRole("heading", { name: "Заявки на материал" })).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: "Нащельник угловой" }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Принять" }).click();
    await expect(row.getByText("Принята")).toBeVisible();
    // Ничего не заказывается автоматически: это сказано на экране
    await expect(page.getByText(/Ничего не заказывается автоматически/)).toBeVisible();
  });
});

test.describe("показ: сброс и пометка", () => {
  // Кнопка меню живёт до 1024 px: на десктопе боковая панель открыта всегда
  test.skip(({ viewport }) => (viewport?.width ?? 1440) >= 1024, "от 1024 px меню открыто");
  test.use({ persona: "e-gareev" });

  test("сброс демо-данных есть под рукой, а пометка видна всегда @mobile", async ({ page }) => {
    await open(page, "/today");
    // Пометка демонстрации в первом экране: её ищет и проверка честности
    await expect(page.getByText("Демо", { exact: true }).first()).toBeVisible();
    // Сброс живёт в меню: одно касание с любого экрана, и он спрашивает подтверждение
    await page.getByRole("button", { name: "Открыть меню" }).click();
    await expect(page.getByRole("button", { name: /Сбросить демо-данные/ })).toBeVisible();
  });
});
