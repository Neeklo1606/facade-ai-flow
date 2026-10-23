import { expect, expectA11y, open, test } from "./fixtures";

/**
 * Быстрая форма отчёта (ADR-029). Проверяется то, ради чего задача делалась: прораб записывает
 * смену, не уходя с экрана, подставленное помечено источником, а карточка подтверждения
 * говорит, откуда взялось каждое значение.
 *
 * С G4 вход другой: центральная кнопка панели стала «Говорить» и ведёт на экран записи,
 * а быстрая форма открывается из «Ещё» (ADR-036). Поведение самой формы не менялось.
 */

/**
 * Быстрая форма отчёта (ADR-029) открывается из «Ещё»: центральная кнопка панели стала
 * «Говорить» и ведёт на экран записи (ADR-036). С ADR-048 «Ещё» это вкладка-экран.
 */
async function openQuickReport(page: import("@playwright/test").Page) {
  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Ещё" })
    .click();
  await page.getByRole("button", { name: /Отчёт с площадки/ }).click();
}

test.describe("шторка ввода", () => {
  // Панель и «+» живут до 1024 px (ADR-026)
  test.skip(({ viewport }) => (viewport?.width ?? 1440) >= 1024, "от 1024 px панели нет");

  test.describe("прораб", () => {
    test.use({ persona: "e-gareev" });

    test("факт записывается в самой шторке @mobile", async ({ page }) => {
      await open(page, "/today");
      await openQuickReport(page);
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
      // Дата не тронута — источник «сегодня»; будь она изменена, подпись сказала бы иначе
      await expect(card).toContainText("сегодня");
      // У прораба один объект, и шторка не выдаёт его за выбор в шапке
      await expect(card).toContainText("единственный ваш объект");

      await sheet.getByRole("button", { name: "Верно" }).click();
      await expect(sheet).toBeHidden();
      // Запись видна на экране смены: форма открыта из «Ещё», смена одной вкладкой (ADR-048)
      await page
        .getByRole("navigation", { name: "Основная навигация" })
        .getByRole("link", { name: "Сегодня" })
        .click();
      await expect(page.locator("main")).toContainText("Монтаж нащельников");
    });
  });

  test.describe("прораб меняет подставленное", () => {
    test.use({ persona: "e-gareev" });

    test("исправленная дата не выдаётся за часы объекта @mobile", async ({ page }) => {
      await open(page, "/today");
      await openQuickReport(page);
      const sheet = page.getByRole("dialog");
      await sheet.getByLabel("Вид работ").fill("Монтаж отливов");
      await sheet.getByLabel("Объём за смену").fill("18");
      await sheet.getByLabel("Что сделали").fill("Захватка 1, отливы по периметру");
      await sheet.getByLabel("Дата смены").fill("2026-09-04");
      await sheet.getByRole("button", { name: /Записать работу/ }).click();

      const card = sheet.locator("dl");
      await expect(card).toContainText("2026-09-04");
      // Значение ввёл человек — подпись обязана сказать именно это
      await expect(card).toContainText("введено вами");
      await expect(card).not.toContainText("часы объекта");
    });
  });

  test.describe("руководитель", () => {
    test.use({ persona: "e-sokolov" });

    test("объект спрашивается до формы @mobile", async ({ page }) => {
      await open(page, "/attention");
      await openQuickReport(page);
      const sheet = page.getByRole("dialog");
      // Объект не выбран в шапке: форма просит его первым шагом, а не подставляет молча
      await expect(sheet.getByRole("heading", { name: "На каком объекте" })).toBeVisible();
      await sheet.getByText("ТЦ «Галактика»").click();
      await expect(sheet.getByRole("heading", { name: "Зафиксировать работу" })).toBeVisible();
    });
  });

  test.describe("снабжение", () => {
    test.use({ persona: "e-dorohov" });

    test("создание роли живёт в «Ещё», неработающих каналов там нет @mobile", async ({ page }) => {
      await open(page, "/attention");
      // «Ещё» вкладка-экран (ADR-048): создание в группе «Создать»
      await page
        .getByRole("navigation", { name: "Основная навигация" })
        .getByRole("link", { name: "Ещё" })
        .click();
      const sheet = page.getByRole("region", { name: "Создать" });
      await expect(sheet).toBeVisible();
      const rows = (
        await sheet.getByRole("link").or(sheet.getByRole("button")).allInnerTexts()
      ).filter(Boolean);
      // Первым в создании стоит действие роли: снабжение заводит запрос
      expect(rows[0]).toContain("Запрос поставщикам");
      const text = rows.join(" ").toLowerCase();
      // Бота в продукте нет; голос теперь есть, но он живёт кнопкой «Говорить», а не строкой
      expect(text).not.toContain("telegram");
      expect(text).not.toContain("голосов");
    });
  });
});
