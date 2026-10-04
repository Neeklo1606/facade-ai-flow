import { expect, expectA11y, open, test } from "./fixtures";

/**
 * Шторка ввода «+» (ADR-029). Проверяется то, ради чего задача делалась: прораб записывает
 * смену, не уходя с экрана, подставленное помечено источником, а карточка подтверждения
 * говорит, откуда взялось каждое значение.
 */

test.describe("шторка ввода", () => {
  // Панель и «+» живут до 1024 px (ADR-026)
  test.skip(({ viewport }) => (viewport?.width ?? 1440) >= 1024, "от 1024 px панели нет");

  test.describe("прораб", () => {
    test.use({ persona: "e-gareev" });

    test("факт записывается в самой шторке @mobile", async ({ page }) => {
      await open(page, "/today");
      await page.locator('[data-tour="nav-plus"]').click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      // Канал роли открыт сразу: форма, а не список
      await expect(sheet.getByRole("heading", { name: "Зафиксировать работу" })).toBeVisible();
      await expect(sheet.getByLabel("Вид работ")).toBeVisible();
      // Подставленная дата названа источником
      await expect(sheet.getByText("сегодня")).toBeVisible();
      await expectA11y(page, "шторка ввода");

      await sheet.getByLabel("Вид работ").fill("Монтаж нащельников");
      await sheet.getByLabel("Объём за смену").fill("42");
      await sheet.getByLabel("Что сделали").fill("Захватка 2, оси Г–К, нащельники по контуру");
      await sheet.getByRole("button", { name: /Записать работу/ }).click();

      // Карточка подтверждения: что записано и откуда взялось
      await expect(sheet.getByRole("heading", { name: "Записано" })).toBeVisible();
      const card = sheet.locator("dl");
      await expect(card).toContainText("Монтаж нащельников");
      await expect(card).toContainText("введено вами");
      await expect(card).toContainText("часы объекта");
      // У прораба один объект, и шторка не выдаёт его за выбор в шапке
      await expect(card).toContainText("единственный ваш объект");

      await sheet.getByRole("button", { name: "Верно" }).click();
      await expect(sheet).toBeHidden();
      // Запись видна на экране смены
      await expect(page.locator("main")).toContainText("Монтаж нащельников");
    });
  });

  test.describe("руководитель", () => {
    test.use({ persona: "e-sokolov" });

    test("объект спрашивается после выбора канала @mobile", async ({ page }) => {
      await open(page, "/attention");
      await page.locator('[data-tour="nav-plus"]').click();
      const sheet = page.getByRole("dialog");
      // Сначала каналы: объект не спрашивают, пока не сказано, что записывают
      await expect(sheet.getByRole("heading", { name: "Создать" })).toBeVisible();
      await sheet.getByText("Отчёт с площадки").click();
      await expect(sheet.getByRole("heading", { name: "На каком объекте" })).toBeVisible();
      await sheet.getByText("ТЦ «Галактика»").click();
      await expect(sheet.getByRole("heading", { name: "Зафиксировать работу" })).toBeVisible();
    });
  });

  test.describe("снабжение", () => {
    test.use({ persona: "e-dorohov" });

    test("первым стоит канал роли, неработающих нет @mobile", async ({ page }) => {
      await open(page, "/attention");
      await page.locator('[data-tour="nav-plus"]').click();
      const sheet = page.getByRole("dialog");
      await expect(sheet.getByRole("heading", { name: "Создать" })).toBeVisible();
      const rows = await sheet.getByRole("button").allInnerTexts();
      // Первым стоит канал роли: снабжение заводит запрос
      expect(rows.filter(Boolean)[0]).toContain("Запрос поставщикам");
      const text = rows.join(" ").toLowerCase();
      // Голоса и бота в продукте нет — в шторке их тоже быть не должно
      expect(text).not.toContain("голос");
      expect(text).not.toContain("telegram");
    });
  });
});
