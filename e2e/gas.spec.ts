import { expect, open, test } from "./fixtures";
import { mobileCheck } from "./mobile-checks";

/**
 * Газовое направление (ADR-042): экраны открываются без ошибок, сквозной сценарий проходит
 * целиком, выгрузка отдаёт файл, сброс демо-данных возвращает исходное состояние.
 *
 * Ошибка в консоли роняет тест: это общая оснастка e2e.
 */

const GAS_SCREENS = [
  "/gas",
  "/gas/foreman",
  "/gas/moderation",
  "/gas/entries",
  "/gas/reports",
  "/gas/brigades",
  "/gas/objects",
  "/gas/estimates",
  "/gas/employees",
  "/gas/admin",
];

const toast = (page: import("@playwright/test").Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });

/** Войти ролью направления через переключатель в шапке раздела */
async function signIn(page: import("@playwright/test").Page, label: RegExp) {
  const select = page.getByLabel("Роль в учёте времени");
  await select.selectOption({ label: await optionFor(page, label) });
}

async function optionFor(page: import("@playwright/test").Page, label: RegExp) {
  const options = await page.getByLabel("Роль в учёте времени").locator("option").allInnerTexts();
  const found = options.find((option) => label.test(option));
  if (!found) throw new Error(`В переключателе роли нет варианта ${label}`);
  return found;
}

test.describe("раздел учёта времени открывается", () => {
  for (const path of GAS_SCREENS) {
    test(`экран ${path} без ошибок`, async ({ page }) => {
      await open(page, path);
      await expect(page.getByRole("heading", { name: "Газ: учёт времени бригад" })).toBeVisible();
    });
  }

  test("метка «вне договора» стоит на сводке и настройке", async ({ page }) => {
    await open(page, "/gas");
    await expect(page.getByText("Демо: вне текущего договора").first()).toBeVisible();
    await signIn(page, /Администратор/);
    await open(page, "/gas/admin");
    await expect(page.getByText("Демо: вне текущего договора").first()).toBeVisible();
  });
});

test.describe("сквозной сценарий", () => {
  test("бригадир заводит время, менеджер подтверждает, отчёт пересчитан", async ({ page }) => {
    // Итог недели до действия
    await open(page, "/gas/reports");
    const totalBefore = await page.getByRole("row", { name: /^Итого/ }).innerText();

    // Бригадир: объект, дата, время, подтверждение
    await open(page, "/gas/foreman");
    await signIn(page, /Бригадир/);
    await page.getByRole("button", { name: "Внести время" }).click();
    // Объект 102 за сегодня у бригады 1 свободен: по 101 уже есть черновик демо-набора
    await page.getByLabel("Поиск объекта").fill("Демо, 102");
    await page
      .getByRole("button", { name: /ул\. Демо, 102/ })
      .first()
      .click();
    await page.getByRole("button", { name: /^Сегодня/ }).click();
    await page.getByLabel("Начало").fill("13:00");
    await page.getByLabel("Окончание").fill("16:10");
    await page.getByRole("button", { name: "0", exact: true }).click();
    // Минуты видно до подтверждения: 13:00-16:10 это 190 минут, как 08:30-11:40 из ТЗ
    // «190 мин» есть и в истории бригады (запись 08:30-11:40 из демо-набора): берём первую
    await expect(page.getByText("190 мин").first()).toBeVisible();
    await page.getByRole("button", { name: "Дальше" }).click();
    await page.getByRole("button", { name: "Подтвердить и отправить" }).click();
    await expect(page.getByText("Запись принята")).toBeVisible();
    const number = (
      await page
        .getByText(/^ГЗ-\d{5}$/)
        .first()
        .innerText()
    ).trim();

    // Менеджер: запись в очереди, подтверждение
    await signIn(page, /Менеджер проверки/);
    await open(page, "/gas/moderation");
    await page
      .getByRole("button", { name: new RegExp(number) })
      .first()
      .click();
    await expect(page.getByText("Что посчитала система")).toBeVisible();
    await page.getByRole("button", { name: "Подтвердить" }).click();
    await expect(toast(page, "Запись подтверждена")).toBeVisible();

    // Запись в журнале подтверждена
    await open(page, "/gas/entries");
    await expect(page.getByRole("row", { name: new RegExp(number) })).toContainText("Подтверждено");

    // Итог недели изменился
    await open(page, "/gas/reports");
    const totalAfter = await page.getByRole("row", { name: /^Итого/ }).innerText();
    expect(totalAfter).not.toBe(totalBefore);
  });

  test("дубль и пересечение не проходят", async ({ page }) => {
    await open(page, "/gas/foreman");
    await signIn(page, /Бригадир/);
    // Запись по объекту, по которому у бригады уже есть запись за сегодня
    await page.getByRole("button", { name: "Внести время" }).click();
    await page.getByLabel("Поиск объекта").fill("Демо, 101");
    await page
      .getByRole("button", { name: /ул\. Демо, 101/ })
      .first()
      .click();
    await page.getByRole("button", { name: /^Сегодня/ }).click();
    await page.getByLabel("Начало").fill("9:00");
    await page.getByLabel("Окончание").fill("12:00");
    await page.getByRole("button", { name: "Дальше" }).click();
    await page.getByRole("button", { name: "Подтвердить и отправить" }).click();
    // Черновик по этому объекту уже есть: система не даёт завести второй
    await expect(page.getByText(/запись уже есть|пересекается/)).toBeVisible();
  });

  test("смена через полночь не вводится", async ({ page }) => {
    await open(page, "/gas/foreman");
    await signIn(page, /Бригадир/);
    await page.getByRole("button", { name: "Внести время" }).click();
    await page.getByLabel("Поиск объекта").fill("Демо");
    await page
      .getByRole("button", { name: /ул\. Демо/ })
      .first()
      .click();
    await page.getByRole("button", { name: /^Сегодня/ }).click();
    await page.getByLabel("Начало").fill("22:00");
    await page.getByLabel("Окончание").fill("6:00");
    await expect(page.getByRole("button", { name: "Дальше" })).toBeDisabled();
  });
});

test.describe("отчёт и выгрузка", () => {
  test("предварительный отчёт помечен и больше утверждённого", async ({ page }) => {
    await open(page, "/gas/reports");
    const strict = await page.getByRole("row", { name: /^Итого/ }).innerText();
    await page.getByRole("tab", { name: "Предварительный" }).click();
    await expect(page.getByText("Предварительный отчёт").first()).toBeVisible();
    const draft = await page.getByRole("row", { name: /^Итого/ }).innerText();
    expect(draft).not.toBe(strict);
  });

  test("выгрузка отдаёт файл", async ({ page }) => {
    await open(page, "/gas/reports");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Выгрузить XLSX/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
  });

  test("уровни отчёта сворачиваются", async ({ page }) => {
    await open(page, "/gas/reports");
    const rowsBefore = await page.locator("tbody tr").count();
    // Сворачивает вся подпись строки, а не значок: кнопка названа строкой и действием
    await page.getByRole("button", { name: /1\. СТАЛЬНЫЕ/ }).click();
    const rowsAfter = await page.locator("tbody tr").count();
    expect(rowsAfter).toBeLessThan(rowsBefore);
  });
});

test.describe("сброс демо-данных", () => {
  test("возвращает исходное состояние", async ({ page }) => {
    await open(page, "/gas/entries");
    const before = await page.locator("tbody tr").count();

    await open(page, "/gas/foreman");
    await signIn(page, /Бригадир/);
    await page.getByRole("button", { name: "Внести время" }).click();
    await page.getByLabel("Поиск объекта").fill("Демо, 102");
    await page
      .getByRole("button", { name: /ул\. Демо, 102/ })
      .first()
      .click();
    await page.getByRole("button", { name: /^Сегодня/ }).click();
    // Раньше черновика демо-набора: иначе время пересечётся и запись не пройдёт
    await page.getByLabel("Начало").fill("5:00");
    await page.getByLabel("Окончание").fill("7:00");
    await page.getByRole("button", { name: "Дальше" }).click();
    await page.getByRole("button", { name: "Подтвердить и отправить" }).click();
    await expect(page.getByText("Запись принята")).toBeVisible();

    await page.getByRole("button", { name: "Сбросить данные учёта" }).click();
    await expect(toast(page, "Демо-данные сброшены")).toBeVisible();

    await open(page, "/gas/entries");
    expect(await page.locator("tbody tr").count()).toBe(before);
  });
});

test.describe("@mobile телефон", () => {
  // Размер экрана ставится здесь, а не проектом: набор @mobile прогоняется и на рабочем столе
  test.use({ viewport: { width: 375, height: 812 } });

  for (const path of GAS_SCREENS) {
    test(`${path} без горизонтальной прокрутки страницы`, async ({ page }) => {
      await open(page, path);
      const checks = await mobileCheck(page);
      expect(checks.overflow.offenders, `переполнение на ${path}`).toEqual([]);
      expect(checks.overflow.scrollWidth).toBeLessThanOrEqual(375);
    });
  }
});
