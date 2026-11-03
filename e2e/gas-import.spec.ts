import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Мастер импорта Excel (ADR-061, 12; раздел 4.7) на синтетических файлах: лист, строка
 * заголовка, колонки с примером, «файл как есть», плашка проверки, предпросмотр и отмена.
 * Плюс «Сотрудники» (приглашение, деактивация, роль) и «Настройка» (доступы, выгрузка).
 */
function file(script: string, name: string): string {
  const path = join(tmpdir(), `${name}-${process.pid}-${Date.now()}.xlsx`);
  execFileSync("bun", ["run", script, path]);
  return path;
}

const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });

test.describe("мастер импорта 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("график: лист, колонки с примером, жёлтая плашка, применить и отменить", async ({
    page,
  }) => {
    await open(page, "/gas/objects");
    await page.getByRole("button", { name: "Загрузить график недели" }).click();
    await page
      .getByTestId("schedule-file")
      .setInputFiles(file("e2e/gas-schedule-file.cli.ts", "schedule"));
    // Первый лист — пояснения: мастер сам берёт первый непустой, его можно сменить
    const sheet = page.getByLabel("Лист");
    await expect(sheet).toBeVisible();
    await sheet.selectOption({ label: "График" });
    await expect(page.getByTestId("sample-brigade")).toHaveText("Пример: Бригада 1");
    await expect(page.getByTestId("sample-day")).toHaveText("Пример: 03.10.2026");

    const check = page.getByTestId("import-check");
    await expect(check).toHaveAttribute("data-level", "warn");
    await expect(check).toContainText("Строка 4: день не распознан");
    await expect(page.getByTestId("import-preview")).toContainText("Добавится");

    await page.getByRole("button", { name: "Показать файл как есть" }).click();
    await expect(page.getByRole("table", { name: "Файл как есть" })).toContainText("ОБ-002");

    await page.getByRole("button", { name: "Всё верно, применить" }).click();
    const done = toast(page, "График применён: строк 2");
    await expect(done).toBeVisible();
    // Даты графика в таблице объектов
    await expect(page.getByRole("row", { name: /ОБ-001/ })).toContainText("03.10");
    await done.getByRole("button", { name: "Отменить" }).click();
    await expect(page.getByRole("row", { name: /ОБ-001/ })).toContainText("графика нет");
  });

  test("смета: колонка сумм, цены с НДС и без, применить и отменить версию", async ({ page }) => {
    await open(page, "/gas/estimates");
    await page.getByRole("button", { name: "Загрузить смету" }).click();
    await page
      .getByTestId("estimate-file")
      .setInputFiles(file("e2e/gas-estimate-file.cli.ts", "estimate"));
    // Формат распознан: колонки свёрнуты в строку, «Изменить» раскрывает выбор (ADR-062, F4)
    await expect(page.getByTestId("columns-auto")).toContainText(
      "Колонки определены автоматически",
    );
    await expect(page.getByTestId("sample-amount")).toBeHidden();
    await page.getByTestId("columns-auto").getByRole("button", { name: "Изменить" }).click();
    await expect(page.getByTestId("columns-auto")).toHaveCount(0);
    await expect(page.getByTestId("sample-amount")).toContainText("Пример:");
    const check = page.getByTestId("import-check");
    await expect(check).toHaveAttribute("data-level", "ok");
    await expect(check).toContainText("Разделы сходятся с итог без НДС");
    // «Цены с НДС»: сверка с «ВСЕГО по смете» не сходится — жёлтая плашка
    await page.getByRole("radio", { name: "Цены с НДС" }).click();
    await expect(check).toHaveAttribute("data-level", "warn");
    await expect(check).toContainText("Проверьте колонки");
    await page.getByRole("radio", { name: "Цены без НДС" }).click();
    await expect(page.getByTestId("import-preview")).toContainText("строка 519");

    await page.getByRole("button", { name: "Всё верно, применить" }).click();
    const done = toast(page, /Смета загружена: версия \d+/);
    await expect(done).toBeVisible();
    await expect(page.getByTestId("estimate-parsed")).toBeVisible();
    await done.getByRole("button", { name: "Отменить" }).click();
    await expect(page.getByTestId("estimate-pending")).toHaveCount(0);
  });
});

test.describe("сотрудники и настройка 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("таблица, приглашение с кодом, деактивация и смена роли", async ({ page }) => {
    await open(page, "/gas/employees");
    const table = page.getByRole("table", { name: "Сотрудники" });
    for (const title of [
      "Фамилия, имя",
      "Должность",
      "Телефон",
      "Бригада",
      "Роль в системе",
      "MAX",
    ])
      await expect(table.getByRole("columnheader", { name: title })).toBeVisible();
    const lead = table.getByRole("row", { name: /Бригадир 1/ }).first();
    await expect(lead).toContainText("Бригадир");

    const worker = table.getByRole("row", { name: /Монтажник 1/ }).first();
    await worker.getByRole("button", { name: "Отправить приглашение" }).click();
    await expect(page.getByTestId("invite-code")).toHaveText(/^\d{6}$/);
    await expect(page.getByRole("dialog")).toContainText("канал MAX не подключён");
    await page.keyboard.press("Escape");

    await worker.getByRole("button", { name: /^Действия:/ }).click();
    await page.getByRole("menuitem", { name: "Деактивировать" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Деактивировать" }).click();
    await expect(worker).toContainText("деактивирован");

    // Роль меняет администратор
    await gasRole(page, "Администратор");
    await open(page, "/gas/employees");
    const row = page
      .getByRole("table", { name: "Сотрудники" })
      .getByRole("row", { name: /Бригадир 1/ })
      .first();
    await row.getByRole("button", { name: /^Действия:/ }).click();
    await page.getByRole("menuitem", { name: /Изменить роль/ }).click();
    await page.getByRole("radio", { name: "Менеджер проверки" }).click();
    await page.getByRole("button", { name: "Сохранить роль" }).click();
    await expect(toast(page, "Роль изменена")).toBeVisible();
    await expect(row).toContainText("Менеджер проверки");
  });

  test("настройка: доступы, профиль выгрузки, подключения честно не подключены", async ({
    page,
  }) => {
    await open(page, "/gas/admin");
    const access = page.getByRole("table", { name: "Доступы по ролям" });
    await expect(access).toContainText("Закрывать и переоткрывать неделю");
    await expect(page.getByTestId("export-profile-check")).toContainText(
      "Обязательные столбцы на месте",
    );
    await expect(page.getByRole("region", { name: "Подключения" })).toContainText("не подключён");
    await page.getByRole("radio", { name: "Яндекс Таблицы" }).click();
    await expect(page.getByRole("radio", { name: "Яндекс Таблицы" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByRole("region", { name: /^Журнал действий/ })).toBeVisible();
  });
});
