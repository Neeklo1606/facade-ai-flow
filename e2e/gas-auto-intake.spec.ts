import { expect, expectA11y, open, test } from "./fixtures";

/**
 * Автоматический приём (ADR-072): папка смет забирается одним нажатием, отчёт руководителю
 * сохраняется в PDF, «Настройки» показывают, что подключено на сервере на самом деле.
 */
test.describe("папка смет, PDF, подключения", () => {
  test("папка смет: два образца становятся версиями «ждёт подтверждения»", async ({ page }) => {
    await open(page, "/gas/estimates");
    const folder = page.getByTestId("estimate-folder");
    await expect(folder).toContainText("Демо: Яндекс Диск не подключён");
    await expect(page.getByTestId("estimate-folder-file")).toHaveCount(2);
    await expect(page.getByTestId("estimate-folder-summary")).toHaveText("новых 2");
    await expectA11y(page, "папка смет");

    await folder.getByRole("button", { name: "Забрать 2 сметы" }).click();
    await expect(page.getByText("Забрано из папки: 2 сметы. Ждут подтверждения")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("estimate-folder-summary")).toHaveText("загружено 2");
    await expect(folder.getByRole("button", { name: "Новых смет нет" })).toBeDisabled();
    // Кандидат — без НДС минус материалы: 206 001,00 − 38 250,15 и 109 440,50 − 17 900,00
    const pending = page.getByTestId("estimate-pending");
    await expect(pending).toHaveCount(2);
    await expect(pending.filter({ hasText: /167\s751\s₽/ })).toHaveCount(1);
    await expect(pending.filter({ hasText: /91\s541\s₽/ })).toHaveCount(1);
  });

  test("отчёт для PDF: показатели и табель только по принятым", async ({ page }) => {
    await open(page, "/gas/overview");
    await page.getByTestId("overview-exports").getByRole("link", { name: "Отчёт PDF" }).click();
    await expect(page).toHaveURL(/\/gas\/print/);
    const sheet = page.getByTestId("print-report");
    await expect(sheet.getByRole("heading", { level: 1 })).toContainText("Отчёт за неделю");
    await expect(sheet).toContainText("Только принятые записи");
    await expect(page.getByTestId("print-kpis")).toContainText("Начислено");
    await expect(sheet.locator("tbody tr").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Сохранить в PDF" })).toBeVisible();
    await expectA11y(page, "отчёт для печати");
  });

  test("настройки: подключения по ответу сервера, без ключей", async ({ page }) => {
    await open(page, "/gas/admin");
    const list = page.getByTestId("admin-connections");
    await expect(list).toContainText("Бот Telegram");
    await expect(list).toContainText("Яндекс Диск: папка смет");
    // Наличие настроек не подтверждает доставку (ADR-075): «Настроено», а не «Подключено»
    await expect(page.getByText(/Настроено \d из 6/)).toBeVisible();
  });
});
