import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, expectA11y, open, test } from "./fixtures";

const file = () => {
  const path = join(tmpdir(), `gaika-workspace-${process.pid}.xlsx`);
  execFileSync("bun", ["run", "e2e/gas-estimate-file.cli.ts", path]);
  return path;
};

test("объект: создание, ручное назначение, редактирование и сохранение @mobile", async ({
  page,
}) => {
  await open(page, "/gas/demo");
  await page.getByRole("button", { name: "Добавить объект", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Адрес", { exact: true }).fill("Демо-адрес для показа 701");
  await dialog.getByLabel("Номер объекта", { exact: true }).fill("ПОКАЗ-701");
  await dialog.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const select = page.getByRole("combobox", { name: "Объект для демонстрации", exact: true });
  const value = await select
    .locator("option")
    .filter({ hasText: "ПОКАЗ-701" })
    .getAttribute("value");
  await select.selectOption(value!);
  await page.getByRole("button", { name: "Назначить бригаду", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Бригада", exact: true }).selectOption("brg-1");
  await dialog
    .getByRole("combobox", { name: "День работы", exact: true })
    .selectOption("2026-10-03");
  await dialog.getByRole("button", { name: "Сохранить назначение", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(select).toHaveValue(value!);
  await page.getByRole("button", { name: "Редактировать объект", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Адрес", { exact: true }).fill("Демо-адрес изменён 701");
  await dialog
    .getByRole("combobox", { name: "Статус объекта", exact: true })
    .selectOption("paused");
  await dialog.getByRole("button", { name: "Сохранить объект", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Демо-адрес изменён 701", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/ПОКАЗ-701 · .*Приостановлен/)).toBeVisible();
  await expectA11y(page, "Подготовка показа");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await open(page, "/gas/brigade");
  await page.getByRole("combobox", { name: "Ввод за бригаду", exact: true }).selectOption("brg-1");
  await page
    .getByRole("button", { name: /Добавить время/ })
    .first()
    .click();
  await page.getByLabel("Объект", { exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: /Демо-адрес изменён 701/ })
      .first(),
  ).toBeVisible();
});

test("разделы загруженного Excel: проект долей, остаток, сохранение, отдельная выгрузка @mobile", async ({
  page,
}) => {
  await open(page, "/gas/estimates");
  await page.getByRole("button", { name: "Загрузить смету", exact: true }).click();
  await page.getByTestId("estimate-file").setInputFiles(file());
  await page.getByRole("button", { name: "Всё верно, применить", exact: true }).click();
  const parsed = page.getByTestId("estimate-parsed");
  await expect(parsed).toBeVisible();
  await parsed.getByRole("button", { name: "Выбрать объект", exact: true }).click();
  const picker = page.getByRole("dialog").last();
  const object = picker.getByRole("button").filter({ hasText: "ОБ-001" }).first();
  await object.click();
  await open(page, "/gas/demo");
  const selector = page.getByRole("combobox", { name: "Объект для демонстрации", exact: true });
  const id = await selector
    .locator("option")
    .filter({ hasText: "ОБ-001" })
    .first()
    .getAttribute("value");
  await selector.selectOption(id!);
  const preview = page.getByRole("heading", { name: "Проект начислений по разделам" });
  await expect(preview).toBeVisible();
  await page.getByRole("button", { name: "Открыть проект начислений", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Вид раздела", exact: true })
    .selectOption({ label: "СМР" });
  await page.getByLabel("Материалы раздела, ₽", { exact: true }).fill("0");
  await page
    .getByRole("combobox", { name: "Исполнитель раздела", exact: true })
    .selectOption("brg-1");
  await page.getByLabel("Выполнено за день, %", { exact: true }).fill("40");
  await page.getByRole("button", { name: "Добавить долю в проект", exact: true }).click();
  await expect(page.getByText(/Распределено 40 %/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Открыть проект начислений", exact: true }).click();
  await expect(page.getByText(/Распределено 40 %/)).toBeVisible();
  await page.screenshot({
    path: `/tmp/gaika-demo-allocation-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "Исполнитель раздела", exact: true })
    .selectOption("brg-1");
  await page.getByLabel("Выполнено за день, %", { exact: true }).fill("70");
  await page.getByRole("button", { name: "Добавить долю в проект", exact: true }).click();
  await expect(
    page.getByText("Доли раздела должны быть больше нуля и в сумме не больше 100 %", {
      exact: true,
    }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать проект начислений XLSX", exact: true }).click();
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toMatch(/^Проект_начислений_версия_\d+\.xlsx$/);
  const workbook = XLSX.read(readFileSync((await downloaded.path())!));
  expect(workbook.SheetNames).toEqual(["Проект начислений", "Разделы и остатки"]);
  const records = XLSX.utils.sheet_to_json<(string | number)[]>(
    workbook.Sheets["Проект начислений"]!,
    { header: 1, raw: true },
  );
  expect(records.some((row) => row[2] === "СМР" && row[5] === 40 && Number(row[6]) > 0)).toBe(true);
  await expectA11y(page, "Проект начислений");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
