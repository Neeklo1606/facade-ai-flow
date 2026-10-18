import { expect, expectA11y, expectEmber, expectMobile, open, test } from "./fixtures";

/**
 * Экран записи (ADR-036, ADR-040). Проверяется то, из-за чего факт теряется или показ врёт:
 * без микрофона путь не обрывается, подготовленное помечено, «Верно» не плодит дублей,
 * «Отменить» снимает созданное.
 *
 * Микрофон в обычном прогоне не разрешён намеренно: браузер Playwright отказывает, и это
 * ровно случай «Показать без микрофона». Путь с микрофоном — в проекте `mic` (флаги
 * фальшивого устройства Chromium).
 */

test.describe("вход из панели", () => {
  // Панель живёт до 1024 px (ADR-026, п. 1): на десктопе её место занимает боковая
  test.skip(({ viewport }) => (viewport?.width ?? 1440) >= 1024, "от 1024 px панели нет");
  test.use({ persona: "e-gareev" });

  test("экран открывается кнопкой «Говорить» и начинается с подсказки @mobile", async ({
    page,
  }) => {
    await open(page, "/today");
    await page.locator('[data-tour="nav-plus"]').click();
    await expect(page).toHaveURL(/\/capture$/);
    await expect(page.getByRole("heading", { name: "Запись", level: 1 })).toBeVisible();
    // В покое — подсказка сценария и капсула, без таймера и абзацев пояснений
    await expect(page.getByText("Скажите, например")).toBeVisible();
    await expect(page.getByRole("button", { name: /Удерживайте, чтобы говорить/ })).toBeVisible();
    await expect(page.getByText("00:00")).toHaveCount(0);
    // Отложенный сценарий «Замечание» в показ не выходит (ADR-038)
    await expect(page.getByRole("button", { name: "Замечание" })).toHaveCount(0);
    await expectEmber(page, "запись");
    await expectMobile(page, "запись");
    await expectA11y(page, "запись");
  });
});

test.describe("путь без микрофона", () => {
  test.use({ persona: "e-gareev" });

  test("«Показать без микрофона» проходит до «Верно» и «Готово» @mobile", async ({ page }) => {
    await open(page, "/capture");
    await page.getByRole("button", { name: /Удерживайте, чтобы говорить/ }).click();
    await expect(
      page.getByText(/Доступ к микрофону запрещён|не записывает звук|не включился/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Показать без микрофона" }).click();
    await expect(page.getByText("Демо: имитация записи")).toBeVisible();
    // Имитация идёт 7 секунд; «Готово» заканчивает раньше
    await page.getByRole("button", { name: "Готово" }).click();
    await expect(page.getByText("Демо: расшифровка подготовлена заранее")).toBeVisible();
    await page.getByRole("button", { name: "Показать сразу" }).click();

    // Разбор: этапы, затем карточки; источник — касанием значения
    await expect(page.getByText("Демо: разбор подготовлен заранее")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /Объём: 96 м²/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.locator("mark")).toHaveText(/девяносто шесть/);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Верно" }).last().click();
    await expect(page.getByRole("heading", { name: "Готово" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Отчёт на проверку/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Отменить/ })).toBeVisible();
    await expectA11y(page, "готово");

    await open(page, "/today");
    await expect(page.locator("main")).toContainText(/96\s*м²/u);
  });

  test("«Отменить» в течение 6 секунд снимает отчёт @mobile", async ({ page }) => {
    await open(page, "/capture");
    await page.getByRole("button", { name: "или напишите текстом" }).click();
    await page.getByRole("button", { name: /Удерживайте/ }).waitFor();
    const shift = await page.getByText(/^«Стилобат/).innerText();
    await page.getByLabel("Что произошло на объекте").fill(shift.replace(/^«|»$/gu, ""));
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText("Демо: разбор подготовлен заранее")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Верно" }).last().click();
    await expect(page.getByRole("heading", { name: "Готово" })).toBeVisible();
    await page.getByRole("button", { name: /Отменить/ }).click();
    // Отмена возвращает к проверке: созданное снято, разбор остался
    await expect(page.getByRole("button", { name: "Верно" }).last()).toBeVisible();
    await open(page, "/today");
    // Строка примера (96 м²) снята; «Стилобат» на экране есть и раньше — в возвращённом отчёте
    await expect(page.locator("main")).not.toContainText(/96\s*м²/u);
  });
});

test.describe("текст", () => {
  test.use({ persona: "e-gareev" });

  test("свой текст без ключа: честный ответ одной строкой и кнопки примеров @mobile", async ({
    page,
  }) => {
    await open(page, "/capture");
    await page.getByRole("button", { name: "или напишите текстом" }).click();
    await page
      .getByLabel("Что произошло на объекте")
      .fill("Секция Б, смонтировали двадцать четыре метра лотка, работали втроём");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByRole("button", { name: "Пример: Смена" })).toBeVisible({
      timeout: 15_000,
    });
    // Пример из ошибки идёт тем же путём, что и голос, с этапа разбора
    await page.getByRole("button", { name: "Пример: Нехватка материала" }).click();
    await expect(page.getByText(/Заявка снабжению: Нащельника углового/)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("нехватка: «Верно» создаёт заявку сразу, без формы @mobile", async ({ page }) => {
    await open(page, "/capture");
    await page.getByRole("button", { name: "Нехватка материала" }).click();
    await page.getByRole("button", { name: "или напишите текстом" }).click();
    const sample = await page.getByText(/^«Нащельника/).innerText();
    await page.getByLabel("Что произошло на объекте").fill(sample.replace(/^«|»$/gu, ""));
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText(/12 шт · к /)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Верно" }).last().click();
    await expect(page.getByRole("link", { name: /Заявка снабжению/ })).toBeVisible();
  });
});

test.describe("путь с микрофоном", () => {
  test.use({ persona: "e-gareev" });

  test("запись идёт, ставится на паузу и уходит в расшифровку @mic", async ({ page }) => {
    await open(page, "/capture");
    await page.getByRole("button", { name: /Удерживайте, чтобы говорить/ }).click();
    // Запись: таймер, живая волна, «Пауза», «Фото», «Готово»
    await expect(page.getByRole("button", { name: "Пауза" })).toBeVisible();
    await expect(page.getByText(/осталось \d+ с из 180/)).toBeVisible();
    await page.waitForTimeout(1_200);
    await page.getByRole("button", { name: "Пауза" }).click();
    await expect(page.getByRole("button", { name: "Продолжить" })).toBeVisible();
    await page.getByRole("button", { name: "Продолжить" }).click();
    await page.getByRole("button", { name: "Фото" }).click();
    await expect(page.getByText(/Фото: 1/)).toBeVisible();
    await page.getByRole("button", { name: "Готово" }).click();
    // Демо-распознаватель отдаёт расшифровку сценария и честно говорит об этом
    await expect(page.getByText("Демо: расшифровка подготовлена заранее")).toBeVisible();
    await expect(page.getByText("Демо: разбор подготовлен заранее")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Верно" }).last()).toBeVisible();
  });
});
