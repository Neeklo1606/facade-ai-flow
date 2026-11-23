import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mobileCheck } from "./mobile-checks";
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

/*
 * Разделы загруженного Excel на модели доли (ADR-078): демо-макет «Проект начислений» удалён,
 * вместо него на странице показа — те же разделы объекта, что в рабочем контуре. Менеджер
 * назначает раздел бригаде, назначение переживает перезагрузку, бригадир видит раздел в форме
 */
test("разделы загруженного Excel: назначение бригаде, остаток, сохранение, форма бригадира @mobile", async ({
  page,
}) => {
  await open(page, "/gas/estimates");
  await page.getByRole("button", { name: "Импорт по колонкам", exact: true }).click();
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
  const sections = page.getByTestId("object-sections");
  await expect(sections.getByRole("heading", { name: "Разделы сметы" })).toBeVisible();
  const first = sections.getByTestId("section-row").first();
  await expect(first.getByText("Бригада не назначена")).toBeVisible();
  // В синтетической смете e2e нет блока итогов раздела: стоимость «нет в смете», остатка нет
  await expect(first.getByText(/начислено/)).toBeVisible();
  await first.getByRole("button", { name: "Назначить бригаду", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Бригада", exact: true }).selectOption("brg-1");
  await dialog.getByRole("button", { name: "Назначить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(first.getByText(/Бригада 1 · с/)).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByTestId("object-sections")
      .getByTestId("section-row")
      .first()
      .getByText(/Бригада 1 · с/),
  ).toBeVisible();
  if (page.viewportSize()!.width <= 430) {
    expect((await mobileCheck(page)).small).toEqual([]);
  }
  await page.screenshot({
    path: `/tmp/gaika-demo-sections-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
  await expectA11y(page, "Разделы сметы");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

  // Бригадир 1 на этом объекте видит назначенный раздел: он подставлен в форму сам
  await open(page, "/gas/brigade");
  await page.getByRole("combobox", { name: "Ввод за бригаду", exact: true }).selectOption("brg-1");
  await page
    .getByRole("button", { name: /Добавить время/ })
    .first()
    .click();
  await page.getByLabel("Объект", { exact: true }).click();
  await page.getByRole("dialog").getByRole("button").filter({ hasText: "ОБ-001" }).first().click();
  await expect(page.getByTestId("section-auto")).toBeVisible();
});
