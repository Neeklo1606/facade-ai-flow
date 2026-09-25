import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import writeXlsxFile from "write-excel-file/node";
import { expect, expectA11y, expectEmber, open, test } from "./fixtures";

/**
 * Главные окна продукта под теми же правилами, что и экраны (ADR-017, поправка 22.09.2026):
 * axe и одно оранжевое пятно, в обеих темах.
 *
 * Зачем отдельный файл: светлый прогон был ограничен `screens.spec.ts`, а экранов с открытым
 * диалогом там нет. Из-за этого нарушение контраста в окне «Зафиксировать решение» жило
 * в светлой теме и не попадало ни под один тест — его нашла независимая проверка, а не мы.
 */

test.describe("окна", () => {
  test.describe("руководитель проекта", () => {
    test.use({ persona: "e-sokolov" });

    test("зафиксировать решение по запросу", async ({ page }) => {
      await open(page, "/projects/p-korona/procurement/sr-323");
      await page.getByRole("button", { name: "Зафиксировать решение" }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectEmber(page, "окно решения");
      await expectA11y(page, "окно решения");
    });

    test("создать запрос поставщикам", async ({ page }) => {
      await open(page, "/projects/p-korona/materials?purchase=none");
      await page.getByRole("button", { name: "Создать запрос поставщикам" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectEmber(page, "окно запроса");
      await expectA11y(page, "окно запроса");
    });

    test("принять поставку", async ({ page }) => {
      // Поставка в пути из фикстур: панель открывается адресом, как в screens.spec
      await open(page, "/projects/p-korona/deliveries?delivery=dl-503");
      await page.getByRole("button", { name: "Поставка прибыла на объект" }).click();
      await page.getByRole("button", { name: "Принять поставку" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectEmber(page, "окно приёмки");
      await expectA11y(page, "окно приёмки");
    });
  });

  test.describe("снабжение", () => {
    test.use({ persona: "e-dorohov" });

    test("добавить материал в справочник", async ({ page }) => {
      await open(page, "/catalogs");
      await page.getByRole("button", { name: "Добавить материал" }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectEmber(page, "окно материала");
      await expectA11y(page, "окно материала");
    });

    test("создать категорию", async ({ page }) => {
      await open(page, "/catalogs");
      await page.getByRole("button", { name: "Категория верхнего уровня" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectEmber(page, "окно категории");
      await expectA11y(page, "окно категории");
    });

    // Разбор .xlsx живёт в браузере (ADR-023, п. 4): здесь он проходит на настоящем файле
    test("загрузить номенклатуру из файла", async ({ page }, testInfo) => {
      const path = testInfo.outputPath("nomenclature.xlsx");
      await mkdir(dirname(path), { recursive: true });
      const written = await writeXlsxFile(
        [
          ["Наименование", "Ед. изм.", "Категория", "Характеристики"],
          ["Кронштейн КР-180 оцинкованный", "шт", "Подконструкция", "вылет: 180 мм"],
          ["", "шт", "Подконструкция", ""],
          ["Профиль Т-образный 3 м", "м", "Такой категории нет", ""],
        ].map((row) => row.map((value) => ({ type: String, value }))),
      );
      await written.toFile(path);

      await open(page, "/catalogs");
      await page.getByRole("button", { name: "Загрузить из Excel" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.locator("input[type=file]").setInputFiles(path);

      // Колонки угаданы по заголовкам, предпросмотр показывает то, что уйдёт в справочник
      await expect(page.getByText("Так это будет загружено")).toBeVisible();
      await expect(page.getByText("Кронштейн КР-180 оцинкованный")).toBeVisible();
      await expectEmber(page, "окно загрузки");
      await expectA11y(page, "окно загрузки");

      await page.getByRole("button", { name: /^Загрузить 3$/ }).click();
      await expect(page.getByText(/Добавлено/)).toBeVisible();
      // Непринятые строки названы номерами строк файла, а не «часть не прошла»
      await expect(page.getByText("строка 3 — пустое наименование")).toBeVisible();
      await expect(page.getByText(/строка 4 — нет категории/)).toBeVisible();
      await expectA11y(page, "итог загрузки");
    });

    test("журнал справочников", async ({ page }) => {
      await open(page, "/catalogs");
      await page.getByRole("button", { name: "Журнал" }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectA11y(page, "журнал справочников");
    });
  });

  test.describe("руководитель проекта заводит поставщика", () => {
    test.use({ persona: "e-sokolov" });

    test("новый поставщик", async ({ page }) => {
      await open(page, "/projects/p-korona/procurement?view=suppliers");
      await page.getByRole("button", { name: "Завести поставщика" }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectEmber(page, "окно поставщика");
      await expectA11y(page, "окно поставщика");
    });
  });
});
