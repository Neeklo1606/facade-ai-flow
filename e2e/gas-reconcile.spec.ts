import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * «Сверка с отчётом заказчика» (финальный промт, 1.8; ADR-063): утверждённый файл недели
 * из табеля, загруженный обратно, сходится до рубля; лист без дат — понятный отказ.
 */
test.describe("сверка 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("свой утверждённый файл сходится, чужой лист — отказ с причиной", async ({ page }) => {
    await open(page, "/gas");
    await gasRole(page, "Руководитель");
    await open(page, "/gas/tabel");
    await page.locator('[data-tour="export"]').click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: /Excel утверждённый/ }).click(),
    ]);
    const path = join(tmpdir(), `gas-reconcile-${process.pid}.xlsx`);
    await download.saveAs(path);

    await open(page, "/gas/week");
    const card = page.getByTestId("reconcile-upload");
    await card.getByTestId("reconcile-file").setInputFiles(path);
    await expect(card.getByTestId("reconcile-result")).toContainText(/Расхождений нет: \d+/);

    // Смета вместо отчёта: строки дат нет
    const { execFileSync } = await import("node:child_process");
    const estimate = join(tmpdir(), `gas-reconcile-estimate-${process.pid}.xlsx`);
    execFileSync("bun", ["run", "e2e/gas-estimate-file.cli.ts", estimate]);
    await card.getByTestId("reconcile-file").setInputFiles(estimate);
    await expect(card.getByRole("alert")).toContainText("Не нашли строку с датами дней");
  });
});
