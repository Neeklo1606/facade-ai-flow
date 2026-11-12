import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Сквозной показ заказчику (ADR-068): весь путь учёта выработки на одной вкладке, как на встрече.
 *
 * 1. Администратор загружает бригады и сотрудников из Excel.
 * 2. Менеджер добавляет объект ОБ-300 и загружает график недели: бригада 1 на ОБ-300 сегодня.
 * 3. Смета из Excel: колонки определены автоматически, видны примеры, итоги сходятся. Привязка
 *    к ОБ-300 и подтверждение: 100 000,23 ₽ по правилу «Всего без НДС минус материалы».
 * 4. Формула: «Технадзор» ниже «ВСЕГО» плюсом даёт 105 000,23 ₽, правило подтверждается.
 * 5. Бригадир в боте: ОБ-300 среди объектов на сегодня, «с 8 до 17», перерыв 60 мин, 480 мин.
 * 6. Менеджер видит долю сметы и источник, принимает запись.
 * 7. Руководитель выгружает Excel: в ячейках 105 000 ₽ (целые рубли), 8 ч, 13 125 ₽/ч, запись в листе
 *    «Записи». Этот же файл в «Сверке» сходится до рубля.
 *
 * Файлы синтетические, их собирает bun: файлов заказчика в репозитории нет.
 */

const xlsxRows = (name: string, rows: (string | number | null)[][]) => {
  const path = join(tmpdir(), `gas-flow-${name}-${process.pid}.xlsx`);
  execFileSync("bun", ["run", "e2e/xlsx-rows.cli.ts", path, JSON.stringify(rows)]);
  return path;
};

const estimateFile = () => {
  const path = join(tmpdir(), `gas-flow-estimate-${process.pid}.xlsx`);
  execFileSync("bun", ["run", "e2e/gas-estimate-file.cli.ts", path, "--extras"]);
  return path;
};

const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });

const ADDRESS = "ст. Демо-Северная, ул. Демо, 300";
/** Стоимость работ в целых рублях, округление в конце (workCostRub): 105 000,23 → 105 000 */
const COST = 105_000;
const MINUTES = 480;

const WIDTHS = [
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
] as const;

test.describe.configure({ timeout: 180_000 });

for (const width of WIDTHS) {
  test.describe(`показ заказчику ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("справочники, объект, график, смета, формула, бот, проверка, Excel, сверка", async ({
      page,
    }) => {
      // 1. Справочники из Excel
      await open(page, "/gas");
      await gasRole(page, "Администратор");
      await open(page, "/gas/directory");
      await page.getByRole("button", { name: "Бригады из Excel" }).click();
      await page.getByTestId("directory-file-brigades").setInputFiles(
        xlsxRows("brigades", [
          ["Бригада", "Бригадир", "Телефон"],
          ["Бригада 81", "Демо Семён Ильич", "+7 900 000-00-81"],
        ]),
      );
      await expect(page.getByTestId("import-check")).toContainText("Добавится 1", {
        timeout: 15_000,
      });
      await page.getByRole("button", { name: "Всё верно, применить" }).click();
      await expect(page.getByText("Бригады: добавлено 1")).toBeVisible();
      await page.getByRole("button", { name: "Сотрудники из Excel" }).click();
      await page.getByTestId("directory-file-employees").setInputFiles(
        xlsxRows("employees", [
          ["ФИО", "Бригада", "Дата начала"],
          ["Демо Анна Сергеевна", "Бригада 81", "03.10.2026"],
        ]),
      );
      await expect(page.getByTestId("import-check")).toContainText("Добавится 1", {
        timeout: 15_000,
      });
      await page.getByRole("button", { name: "Всё верно, применить" }).click();
      await expect(page.getByText("Сотрудники: добавлено 1")).toBeVisible();

      // 2. Объект и график недели
      await gasRole(page, "Менеджер");
      await open(page, "/gas/objects");
      await page.getByRole("button", { name: "Добавить объект" }).click();
      const sheet = page.getByRole("dialog", { name: "Новый объект" });
      await sheet.getByLabel("Адрес").fill(ADDRESS);
      await sheet.getByLabel("Номер объекта").fill("ОБ-300");
      await sheet.getByLabel("Вид работ").fill("котел");
      await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
      await expect(page.getByText("Объект добавлен: ОБ-300").first()).toBeVisible();
      await page.getByRole("button", { name: "Загрузить график недели" }).click();
      await page.getByTestId("schedule-file").setInputFiles(
        xlsxRows("schedule", [
          ["Объект", "Номер", "Бригада", "Дата"],
          [ADDRESS, "ОБ-300", "Бригада 1", "03.10.2026"],
        ]),
      );
      await expect(page.getByTestId("import-check")).toContainText("Все строки прочитаны: 1");
      await page.getByRole("button", { name: "Всё верно, применить" }).click();
      await expect(toast(page, "График применён: строк 1")).toBeVisible();

      // 3. Смета: колонки, примеры, сходимость, привязка и подтверждение
      await open(page, "/gas/estimates");
      await page.getByRole("button", { name: "Загрузить смету" }).click();
      await page.getByTestId("estimate-file").setInputFiles(estimateFile());
      await expect(page.getByTestId("columns-auto")).toContainText(
        "Колонки определены автоматически",
      );
      await page.getByTestId("columns-auto").getByRole("button", { name: "Изменить" }).click();
      await expect(page.getByTestId("sample-amount")).toContainText("Пример:");
      // Сходимость разделов с итогом; строка ниже «ВСЕГО» даёт жёлтую плашку до проверки человеком
      await expect(page.getByTestId("import-check")).toContainText(
        /Разделы сходятся с итог без НДС: 120\s000,24\s₽ \(строка 519\)/,
      );
      await page.getByRole("button", { name: "Всё верно, применить" }).click();
      const parsed = page.getByTestId("estimate-parsed");
      await expect(parsed).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("estimate-candidate")).toHaveText(/100\s000,23\s₽/);
      await parsed.getByRole("button", { name: "Выбрать объект" }).click();
      await page
        .getByRole("dialog")
        .last()
        .getByRole("button")
        .filter({ hasText: "ОБ-300" })
        .first()
        .click();
      await parsed.getByRole("button", { name: "Замечания проверены" }).click();
      await page.getByRole("button", { name: "Подтвердить смету" }).click();
      await expect(toast(page, /Смета подтверждена: 100\s000\s₽/)).toBeVisible();

      // 4. Формула стоимости: технадзор плюсом
      await page.getByRole("button", { name: "Настроить", exact: true }).click();
      await page
        .getByTestId("rule-term-extra:Технадзор")
        .getByRole("radio", { name: "плюс" })
        .click();
      await expect(page.getByTestId("rule-total")).toHaveText(/105\s000,23\s₽/);
      await page.getByRole("button", { name: "Сохранить редакцию" }).click();
      await expect(page.getByTestId("cost-rule-formula")).toHaveText(
        "Всего без НДС плюс технадзор минус материалы",
      );
      await page.getByRole("button", { name: "Подтвердить правило" }).click();
      await expect(page.getByText("Согласовано").first()).toBeVisible();

      // 5. Бригадир в боте: объект по графику, время фразой, перерыв кнопкой
      await gasRole(page, "Бригадир");
      await open(page, "/gas/foreman");
      const bot = page.locator('[data-tour="bot"]');
      const current = bot.locator("[data-stage]");
      await current.getByRole("button", { name: "Внести время" }).click();
      await expect(current).toContainText("Объекты бригады на сегодня, 03.10.");
      await current.getByRole("button", { name: /ул\. Демо, 300/ }).click();
      await current.getByRole("button", { name: /^Сегодня/ }).click();
      const message = page.getByLabel("Сообщение боту: объект, день и время одной фразой");
      await message.fill("с 8 до 17");
      await message.press("Enter");
      await expect(current).toContainText("Понял: 08:00–17:00, 9 ч. Верно?");
      await current.getByRole("button", { name: "Верно" }).click();
      await current.getByRole("button", { name: /^60 мин/ }).click();
      await expect(current.getByTestId("bot-total")).toHaveText("480 мин = 8,00 ч");
      await expect(bot).not.toContainText("₽");
      await current.getByRole("button", { name: "Отправить", exact: true }).click();
      await expect(current).toContainText(/Отправлено\. Запись ГЗ-\d{5} ждёт проверки/);
      const number = /ГЗ-\d{5}/.exec(await current.innerText())![0];

      // 6. Менеджер: доля сметы с источником, принять
      await gasRole(page, "Менеджер");
      await expect(page).toHaveURL(/\/gas\/moderation$/);
      const card = page.locator("[data-queue-card]").filter({ hasText: number });
      await expect(card).toContainText(ADDRESS);
      await card.click();
      const cost = page.getByRole("region", { name: "Стоимость" }).filter({ visible: true });
      await expect(cost).toContainText(/105\s000\s₽/);
      await expect(cost).toContainText("смета объекта, версия 1");
      await expect(cost).toContainText(/13\s125\s₽/);
      await expect(
        page.getByRole("region", { name: "Расчёт" }).filter({ visible: true }),
      ).toContainText(`${MINUTES} мин`);
      await page.locator('[data-tour="review-confirm"]:visible').click();
      await expect(toast(page, "Принято")).toBeVisible();
      // На телефоне после решения открывается следующая запись: закрыть её, как сделал бы человек
      if (width.hasTouch) {
        await page.keyboard.press("Escape");
        await expect(page.locator("[data-review-sheet]")).toBeHidden();
      }

      // 7. Руководитель: Excel и сверка этого файла
      await gasRole(page, "Руководитель");
      await open(page, "/gas/tabel");
      // На компьютере меню выгрузки в шапке, на телефоне кнопка под табелем
      if (!width.hasTouch) await page.locator('[data-tour="export"]').click();
      const exportApproved = width.hasTouch
        ? page.getByRole("button", { name: "Выгрузить Excel", exact: true })
        : page.getByRole("menuitem", { name: /Excel утверждённый/ });
      await expect(exportApproved).toBeVisible();
      const [download] = await Promise.all([page.waitForEvent("download"), exportApproved.click()]);
      expect(download.suggestedFilename()).toBe("Выработка_бригад_28.09-03.10.2026.xlsx");
      const path = join(tmpdir(), `gas-flow-out-${width.name}-${process.pid}.xlsx`);
      await download.saveAs(path);

      const book = XLSX.read(readFileSync(path));
      expect(book.SheetNames).toEqual(expect.arrayContaining(["Отчёт", "Записи"]));
      const records = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets["Записи"]!, {
        header: 1,
        raw: true,
      });
      const head = records[0]!.map(String);
      const row = records.find((r) => r[0] === number);
      expect(row, `строка ${number} в листе «Записи»`).toBeTruthy();
      const cell = (title: string) => row![head.indexOf(title)];
      expect(cell("Объект")).toBe(ADDRESS);
      expect(cell("Минуты")).toBe(MINUTES);
      expect(Number(cell("Часы"))).toBeCloseTo(8, 6);
      expect(Number(cell("Сумма начислений"))).toBeCloseTo(COST, 2);
      expect(Number(cell("Доходность часа"))).toBeCloseTo(COST / (MINUTES / 60), 2);

      const report = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets["Отчёт"]!, {
        header: 1,
        raw: true,
      });
      const objectRow = report.find((r) => r[0] === ADDRESS);
      expect(objectRow, "строка объекта в листе «Отчёт»").toBeTruthy();
      const day = report[0]!.findIndex((v) => v === "03.10.2026");
      expect(Number(objectRow![day])).toBeCloseTo(COST, 2);
      expect(Number(objectRow![day + 1])).toBeCloseTo(8, 6);

      await open(page, "/gas/week");
      const reconcile = page.getByTestId("reconcile-upload");
      await reconcile.getByTestId("reconcile-file").setInputFiles(path);
      await expect(reconcile.getByTestId("reconcile-result")).toContainText(/Расхождений нет: \d+/);
    });
  });
}
