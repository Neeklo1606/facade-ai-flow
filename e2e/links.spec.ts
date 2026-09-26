import { expect, open, test } from "./fixtures";

/**
 * Связность цепочки (ADR-018): от материала к запросу, от поставки к материалам,
 * от отчёта к захватке — нажатием, а не через меню. И загрузка документа как процесс.
 */

test.describe("связи между сущностями", () => {
  test.use({ persona: "e-sokolov" });

  test("из карточки материала можно перейти к запросу поставщикам", async ({ page }) => {
    await open(page, "/projects/p-korona/materials?purchase=ordered");
    // Строка реестра открывает карточку материала (первая строка группы — её заголовок)
    await page
      .getByRole("row", { name: /Мембрана ветрогидрозащитная/ })
      .first()
      .click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Связано")).toBeVisible();

    const request = drawer.getByRole("link", { name: /Запрос поставщикам/ }).first();
    await expect(request).toBeVisible();
    await request.click();
    await expect(page).toHaveURL(/\/procurement\/sr-/);
    await expect(page.getByText("Сравнение предложений").first()).toBeVisible();
  });

  test("из поставки можно перейти к материалам её состава", async ({ page }) => {
    await open(page, "/projects/p-korona/deliveries?delivery=dl-502");
    const material = page.getByRole("link", { name: /Материал в реестре/ });
    await expect(material).toBeVisible();
    await material.click();
    await expect(page).toHaveURL(/\/materials/);
    await expect(page.getByRole("table").first()).toBeVisible();
  });

  test("из отчёта с площадки можно перейти к захватке в ходе работ", async ({ page }) => {
    await open(page, "/projects/p-korona/field-reports");
    await page
      .getByRole("link", { name: /Захватка 2/ })
      .first()
      .click();
    await expect(page).toHaveURL(/tab=progress/);
    await expect(page.getByText("Захватка 2, оси Г–К").first()).toBeVisible();
  });

  test("связи, которой нет в данных, в блоке нет", async ({ page }) => {
    // Позиция, которая ещё не уходила в закупку: связям взяться неоткуда, и блока нет
    await open(page, "/projects/p-korona/materials?purchase=none");
    await page
      .getByRole("row", { name: /Крышка парапетная/ })
      .first()
      .click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Связано")).toHaveCount(0);
    await expect(drawer.getByText("Позиция ещё не входила в запросы поставщикам")).toBeVisible();
  });
});

test.describe("загрузка документа", () => {
  test.use({ persona: "e-volkova" });

  test("окно загрузки показывает файл, раздел и стадии, а в конце — куда идти", async ({
    page,
  }) => {
    await open(page, "/projects/p-korona/documents");

    await page.locator("input[type=file]").setInputFiles({
      name: "Смета_Корпус_5.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(2048),
    });

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Смета_Корпус_5.pdf")).toBeVisible();
    // Название предложено, но его видно и можно поправить
    await expect(dialog.getByRole("textbox")).toHaveValue("Смета Корпус 5");
    await expect(dialog.getByLabel("Раздел проекта")).toBeVisible();
    // Честность: в демонстрации результат подготовлен заранее, и это сказано до загрузки
    await expect(dialog.getByText(/содержимое файла не распознаётся/)).toBeVisible();

    await dialog.getByRole("button", { name: "Загрузить и разобрать" }).click();

    // Стадии словами, а не безымянный кружок
    for (const stage of ["Загружен", "Распознан текст", "Найдены таблицы", "Готов к проверке"]) {
      await expect(dialog.getByText(stage, { exact: true })).toBeVisible();
    }

    const toReview = dialog.getByRole("link", { name: /Перейти к проверке/ });
    await expect(toReview).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText(/Найдено позиций/)).toBeVisible();

    await toReview.click();
    await expect(page).toHaveURL(/\/documents\/pd-/);
    // Под результатом разбора — пометка, что он подготовлен заранее (ADR-018, п. 6)
    await expect(page.locator("[data-demo-extraction]")).toBeVisible();
  });
});

test.describe("счётчики — это фильтры", () => {
  test.use({ persona: "e-dorohov" });

  test("«готовы к запросу» в шапке материалов применяет фильтр", async ({ page }) => {
    await open(page, "/projects/p-korona/materials");
    const counter = page.getByRole("button", { name: /готовы к запросу/ });
    await expect(counter).toHaveAttribute("aria-pressed", "false");
    await counter.click();
    await expect(page).toHaveURL(/ready=true/);
    await expect(counter).toHaveAttribute("aria-pressed", "true");
    // Повторное нажатие снимает фильтр: цифра и список остаются об одном
    await counter.click();
    await expect(page).not.toHaveURL(/ready=true/);
  });
});

test.describe("счётчик документации ведёт к проверке", () => {
  test.use({ persona: "e-volkova" });

  test("«Извлечено позиций» открывает документ с позициями", async ({ page }) => {
    await open(page, "/projects/p-korona/documents");
    await page.getByRole("button", { name: /Извлечено позиций/ }).click();
    await expect(page).toHaveURL(/\/documents\/pd-korona-spec/);
  });

  test("ПТО не остаётся без действия, когда передавать нечего", async ({ page }) => {
    await open(page, "/projects/p-korona/documents/pd-korona-spec");
    await expect(page.getByRole("link", { name: /к документации/i })).toBeVisible();
  });
});
