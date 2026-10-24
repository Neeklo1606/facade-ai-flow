import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, expectA11y, open, test } from "./fixtures";

/**
 * Разбор сметы в браузере (ADR-053): синтетический xlsx с итогами формата А собирает bun
 * (gas-estimate-file.cli.ts), файлов заказчика в репозитории нет. Файл читается на странице,
 * итоги видны с номерами строк, подтверждение даёт стоимость по правилу «без НДС минус материалы».
 */
function grandXlsx(): string {
  const path = join(tmpdir(), `gas-estimate-${process.pid}.xlsx`);
  execFileSync("bun", ["run", "e2e/gas-estimate-file.cli.ts", path]);
  return path;
}

test.describe("сметы", () => {
  test("файл разбирается в браузере, смета подтверждается по правилу", async ({ page }) => {
    await open(page, "/gas/estimates");
    await expect(page.getByTestId("cost-rule-formula")).toHaveText("Всего без НДС минус материалы");
    await page.getByRole("button", { name: "Загрузить смету" }).click();
    await page.getByTestId("estimate-file").setInputFiles(grandXlsx());
    const parsed = page.getByTestId("estimate-parsed");
    await expect(parsed).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("estimate-candidate")).toHaveText(/165\s455,23\s₽/);
    await expect(parsed.getByText("строка 519")).toBeVisible();
    await expect(parsed.getByText("Разобрана")).toBeVisible();
    await expectA11y(page, "разбор сметы");

    // Без объекта подтвердить нельзя: сначала привязка
    const confirm = page.getByRole("button", { name: "Подтвердить смету" });
    await expect(confirm).toBeDisabled();
    await parsed.getByRole("button", { name: "Выбрать объект" }).click();
    await page
      .getByRole("dialog")
      .last()
      .getByRole("button")
      .filter({ hasText: "ОБ-001" })
      .first()
      .click();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByText(/Смета подтверждена: 165\s455\s₽/)).toBeVisible();
  });
});
