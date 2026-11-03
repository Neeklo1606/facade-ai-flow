import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Page } from "@playwright/test";
import { expect, expectA11y, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Импорт справочников из Excel (ADR-062, F3) и «Добавить объект». Файлы синтетические,
 * их собирает bun (xlsx-rows.cli.ts). Отчёт «добавится, обновится, пропущено» с причинами.
 */
function xlsx(name: string, rows: (string | number | null)[][]): string {
  const path = join(tmpdir(), `gas-dir-${name}-${process.pid}.xlsx`);
  execFileSync("bun", ["run", "e2e/xlsx-rows.cli.ts", path, JSON.stringify(rows)]);
  return path;
}

const WIDTHS = [
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
] as const;

async function wizard(page: Page, button: string, testId: string, file: string) {
  await page.getByRole("button", { name: button }).click();
  await page.getByTestId(testId).setInputFiles(file);
  await expect(page.getByTestId("import-check")).toBeVisible({ timeout: 15_000 });
}

test.describe.configure({ timeout: 120_000 });

for (const width of WIDTHS) {
  test.describe(`справочники из Excel ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("бригады и сотрудники: отчёт с причинами, применение, повтор пропускается", async ({
      page,
    }) => {
      await open(page, "/gas/directory");
      await gasRole(page, "Администратор");
      await page.goto("/gas/directory");
      await page.locator("main").waitFor();

      const brigades = xlsx("brigades", [
        ["Бригада", "Бригадир", "Телефон"],
        ["Бригада 81", "Демо Семён Ильич", "+7 900 000-00-81"],
        ["Бригада 82", "Демо Глеб Олегович", "8 900 000 00 82"],
        ["Бригада 81", "Демо Семён Ильич", ""],
        ["Бригада 83", "", "123"],
      ]);
      await wizard(page, "Бригады из Excel", "directory-file-brigades", brigades);
      const check = page.getByTestId("import-check");
      await expect(check).toHaveAttribute("data-level", "warn");
      await expect(check).toContainText("Добавится 2, обновится 0, пропущено 2");
      const skipped = page.getByTestId("directory-skipped");
      await expect(skipped).toContainText("Строка 4: повтор строки 2");
      await expect(skipped).toContainText("Строка 5: телефон «123» короче 10 цифр");
      await expectA11y(page, `импорт бригад ${width.name}`);
      await page.getByRole("button", { name: "Всё верно, применить" }).click();
      await expect(page.getByText("Бригады: добавлено 2, обновлено 0, пропущено 2")).toBeVisible();

      const employees = xlsx("employees", [
        ["ФИО", "Бригада", "Дата начала"],
        ["Демо Анна Сергеевна", "Бригада 81", "03.10.2026"],
        ["Демо Вера Павловна", "Бригада 99", "03.10.2026"],
      ]);
      await wizard(page, "Сотрудники из Excel", "directory-file-employees", employees);
      await expect(page.getByTestId("import-check")).toContainText(
        "Добавится 1, обновится 0, пропущено 1",
      );
      await expect(page.getByTestId("directory-skipped")).toContainText(
        "нет бригады «Бригада 99» в справочнике",
      );
      await page.getByRole("button", { name: "Всё верно, применить" }).click();
      await expect(page.getByText("Сотрудники: добавлено 1")).toBeVisible();

      // Повторная загрузка того же файла: добавлять нечего, применить нельзя
      await wizard(page, "Сотрудники из Excel", "directory-file-employees", employees);
      await expect(page.getByTestId("import-check")).toHaveAttribute("data-level", "error");
      await expect(page.getByTestId("directory-skipped")).toContainText(
        "уже в составе «Бригада 81»",
      );
      await expect(page.getByRole("button", { name: "Всё верно, применить" })).toBeDisabled();
    });

    test("«Добавить объект»: объект в списке, повтор номера отклонён", async ({ page }) => {
      await open(page, "/gas/objects");
      await page.getByRole("button", { name: "Добавить объект" }).click();
      const sheet = page.getByRole("dialog", { name: "Новый объект" });
      await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
      await expect(sheet.getByText("Укажите адрес")).toBeVisible();
      await sheet.getByLabel("Адрес").fill("ст. Демо-Северная, ул. Демо, 300");
      await sheet.getByLabel("Номер объекта").fill("ОБ-300");
      await sheet.getByLabel("Вид работ").fill("котел");
      await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
      await expect(page.getByText("Объект добавлен: ОБ-300")).toBeVisible();
      await page.getByRole("searchbox", { name: "Поиск объекта" }).fill("ОБ-300");
      await expect(page.locator("main")).toContainText("ул. Демо, 300");

      await page.getByRole("button", { name: "Добавить объект" }).click();
      await sheet.getByLabel("Адрес").fill("другой адрес");
      await sheet.getByLabel("Номер объекта").fill("об-300");
      await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
      await expect(page.getByText(/Номер об-300 уже у объекта/)).toBeVisible();
    });
  });
}
