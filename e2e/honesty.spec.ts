import { expect, open, test } from "./fixtures";

/**
 * Честность (Q8, п. 3): каждое извлечённое значение показывает источник и метку уверенности,
 * а имитация названа имитацией там, где показан её результат. Пометку демонстрации на каждом
 * экране проверяет expectMobile в тестах экранов. Роли — те, кому раздел открыт (ADR-012).
 */

const CONFIDENCE = /Проверено|Требует внимания|Не удалось определить/;

test.describe("ПТО: позиции спецификации и загрузка документа", () => {
  test.use({ persona: "e-volkova" });

  test("у каждой позиции метка уверенности и ссылка на лист", async ({ page }) => {
    await open(page, "/projects/p-korona/documents/pd-korona-spec");
    const rows = page.locator("[data-position-id]");
    const count = await rows.count();
    expect(count).toBeGreaterThan(10);
    for (let index = 0; index < count; index++) {
      const row = rows.nth(index);
      await expect(row, `строка ${index + 1}: метка уверенности`).toContainText(CONFIDENCE);
      await expect(
        row.getByRole("button", { name: /^л\. \d+/ }),
        `строка ${index + 1}: ссылка на лист`,
      ).toHaveCount(1);
    }
  });

  test("загрузка документа говорит, что содержимое не распознаётся", async ({ page }) => {
    await open(page, "/projects/p-korona/documents");
    await expect(page.getByText(/В демонстрации содержимое файла не распознаётся/)).toBeVisible();
  });
});

test.describe("снабжение: материалы и запросы", () => {
  test.use({ persona: "e-dorohov" });

  test("у каждой позиции материалов лист-источник и уверенность или решение проверки", async ({
    page,
  }) => {
    await open(page, "/projects/p-korona/materials");
    // Строка позиции — строка со ссылкой на позицию в документе; строки разделов её не имеют
    const source = "a[title='Открыть позицию в документе']";
    const positions = page.locator("main table tbody tr").filter({ has: page.locator(source) });
    const count = await positions.count();
    expect(count).toBeGreaterThan(10);
    for (let index = 0; index < count; index++) {
      const row = positions.nth(index);
      await expect(row.locator(source), `строка ${index + 1}: лист-источник`).toHaveText(
        /л\.\s*\d+/,
      );
      await expect(row, `строка ${index + 1}: уверенность или решение проверки`).toContainText(
        /Проверено|Требует внимания|Не удалось определить|Подтверждено|Исправлено/,
      );
    }
  });

  test("запрос, ждущий ответов, говорит, что письма не отправляются", async ({ page }) => {
    await open(page, "/projects/p-korona/procurement/sr-319");
    await expect(page.getByText(/В демонстрации письма не отправляются/).first()).toBeVisible();
  });
});

test.describe("руководитель: голосовой отчёт с площадки", () => {
  test.use({ persona: "e-sokolov" });

  test("у каждого распознанного поля место в записи и уверенность словом", async ({ page }) => {
    await open(page, "/projects/p-korona/field-reports");
    const fields = page.locator("[data-extracted-fields]").first();
    await expect(fields).toBeVisible();
    await expect(page.getByText(/Аудио в демонстрации не воспроизводится/).first()).toBeVisible();
    const items = fields.locator("li");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index++) {
      await expect(items.nth(index), `поле ${index + 1}: уверенность словом`).toContainText(
        CONFIDENCE,
      );
      await expect(items.nth(index), `поле ${index + 1}: место в записи`).toContainText(/\d/);
    }
  });
});

test.describe("отчёт с площадки заводится вручную", () => {
  test.use({ persona: "e-gareev" });

  test("прораб заводит отчёт, и он помечен как внесённый вручную", async ({ page }) => {
    await open(page, "/projects/p-korona/field-reports");
    await page.getByRole("button", { name: "Завести отчёт" }).click();
    await page.getByLabel("Вид работ").fill("Монтаж примыканий");
    await page.getByLabel("Объём за смену").fill("42");
    await page.getByLabel("Что сделали").fill("Примыкания на захватке 2, этаж 9.");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Завести отчёт/ })
      .click();
    const card = page.locator("[id^=report-]", { hasText: "Монтаж примыканий" }).first();
    await expect(card).toBeVisible();
    // Честность: такой отчёт не притворяется сообщением из Telegram
    await expect(card.getByText("внесён вручную")).toBeVisible();
    await expect(card.getByText("На проверке").first()).toBeVisible();
  });
});
