import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Page } from "@playwright/test";
import { expect, expectA11y, open, test } from "./fixtures";

/**
 * Конструктор «Что идёт в стоимость работ» (ADR-062, F2) и строки ниже «ВСЕГО» (F4).
 * Синтетическая ГРАНД-Смета: без НДС 120 000,24, материалы 20 000,01, «Технадзор» 5 000
 * ниже «ВСЕГО». Файлов заказчика в репозитории нет.
 */
function xlsx(): string {
  const path = join(tmpdir(), `gas-rule-${process.pid}.xlsx`);
  execFileSync("bun", ["run", "e2e/gas-estimate-file.cli.ts", path, "--extras"]);
  return path;
}

const WIDTHS = [
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
] as const;

/** Загрузить смету, привязать к ОБ-001 и отметить замечания проверенными */
async function uploadLinked(page: Page) {
  await page.getByRole("button", { name: "Загрузить смету" }).click();
  await page.getByTestId("estimate-file").setInputFiles(xlsx());
  await page.getByRole("button", { name: "Всё верно, применить" }).click();
  const parsed = page.getByTestId("estimate-parsed");
  await expect(parsed).toBeVisible({ timeout: 15_000 });
  await expect(parsed.getByText("Ниже «ВСЕГО по смете»")).toBeVisible();
  await parsed.getByRole("button", { name: "Выбрать объект" }).click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button")
    .filter({ hasText: "ОБ-001" })
    .first()
    .click();
  await parsed.getByRole("button", { name: "Замечания проверены" }).click();
  return parsed;
}

const choose = (page: Page, key: string, value: "не входит" | "плюс" | "минус") =>
  page.getByTestId(`rule-term-${key}`).getByRole("radio", { name: value }).click();

test.describe.configure({ timeout: 120_000 });

for (const width of WIDTHS) {
  test.describe(`конструктор правила ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("правило компании: пример на смете, «нет строки», редакция, отмена, подтверждение", async ({
      page,
    }) => {
      await open(page, "/gas/estimates");
      const parsed = await uploadLinked(page);
      await page.getByRole("button", { name: "Подтвердить смету" }).click();
      await expect(page.getByText(/Смета подтверждена: 100\s000\s₽/)).toBeVisible();
      await expect(parsed).toHaveCount(0);

      const formula = page.getByTestId("cost-rule-formula");
      await expect(formula).toHaveText("Всего без НДС минус материалы");
      await page.getByRole("button", { name: "Настроить", exact: true }).click();
      const builder = page.getByTestId("rule-builder");
      await expect(builder).toBeVisible();
      const total = page.getByTestId("rule-total");
      await expect(total).toHaveText(/100\s000,23\s₽/);
      await expect(page.getByTestId("rule-example")).toContainText("строка 519");
      await expectA11y(page, `конструктор правила ${width.name}`);

      // Строка ниже «ВСЕГО» — слагаемое со строкой файла
      await expect(page.getByTestId("rule-term-extra:Технадзор")).toContainText("строка 525");
      await choose(page, "extra:Технадзор", "плюс");
      await expect(total).toHaveText(/105\s000,23\s₽/);
      // Итога нет в смете: «нет строки», а не ноль
      await choose(page, "overhead", "минус");
      await expect(total).toHaveText("Посчитать нельзя");
      await expect(page.getByTestId("rule-example")).toContainText("нет строки");
      await choose(page, "overhead", "не входит");
      await expect(total).toHaveText(/105\s000,23\s₽/);

      await page.getByRole("button", { name: "Сохранить редакцию" }).click();
      const toastText = page.getByText(/Правило сохранено, редакция 2: требует согласования/);
      await expect(toastText).toBeVisible();
      await expect(toastText).toContainText(/Пересчитано записей: \d+/);
      await expect(formula).toHaveText("Всего без НДС плюс технадзор минус материалы");
      await expect(page.getByText("Требует согласования").first()).toBeVisible();
      // Отмена 6 секунд возвращает прежнее правило
      await page.getByRole("button", { name: "Отменить" }).click();
      await expect(formula).toHaveText("Всего без НДС минус материалы");

      // Снова сохранить и подтвердить: в истории кто и когда
      await page.getByRole("button", { name: "Настроить", exact: true }).click();
      await choose(page, "extra:Технадзор", "плюс");
      await page.getByRole("button", { name: "Сохранить редакцию" }).click();
      await expect(formula).toHaveText("Всего без НДС плюс технадзор минус материалы");
      await page.getByRole("button", { name: "Подтвердить правило" }).click();
      await expect(page.getByText("Согласовано").first()).toBeVisible();
      await page.getByRole("button", { name: "Настроить", exact: true }).click();
      const history = page.getByTestId("rule-history");
      await expect(history.getByRole("listitem")).toHaveCount(2);
      await expect(history.getByRole("listitem").first()).toContainText("Подтвердил:");
      await expect(history.getByRole("listitem").last()).toContainText("Исходное правило системы");
    });

    test("своё правило объекта из шторки сметы и метка в списке объектов", async ({ page }) => {
      await open(page, "/gas/estimates");
      await uploadLinked(page);
      await page.getByRole("button", { name: "Своё правило для объекта" }).click();
      await expect(page.getByTestId("rule-builder")).toBeVisible();
      await expect(page.getByText("Своё правило для объекта").first()).toBeVisible();
      await choose(page, "withoutVat", "не входит");
      await choose(page, "materials", "не входит");
      await choose(page, "total", "плюс");
      await expect(page.getByTestId("rule-total")).toHaveText(/146\s400,29\s₽/);
      await page.getByRole("button", { name: "Сохранить редакцию" }).click();
      await expect(page.getByText(/Правило сохранено, редакция 1/)).toBeVisible();
      // Правило компании не изменилось
      await expect(page.getByTestId("cost-rule-formula")).toHaveText(
        "Всего без НДС минус материалы",
      );
      await page.getByTestId("estimate-pending").first().click();
      await expect(page.getByTestId("estimate-candidate")).toHaveText(/146\s400,29\s₽/);
      await page.getByRole("button", { name: "Подтвердить смету" }).click();
      await expect(page.getByText(/Смета подтверждена: 146\s400\s₽/)).toBeVisible();
      await expect(
        page.locator("li").filter({ hasText: "ОБ-001" }).filter({ hasText: "своё правило" }),
      ).toHaveCount(1);
    });
  });
}
