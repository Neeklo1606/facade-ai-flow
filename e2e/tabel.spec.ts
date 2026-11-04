import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * «Табель» (ADR-061, 11; раздел 4.5) и «Неделя» (4.6): одна панель над сеткой, цвет ячеек
 * вместо переключателя, выделение и копирование TSV, итоги выделенного, исходные записи
 * ячейки и правка с причиной в истории, выгрузка, «Неделя» со счётчиками и закрытием.
 */

const FILE = "Выработка_бригад_28.09-03.10.2026.xlsx";
const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });
const grid = (page: Page) => page.getByRole("grid", { name: "Табель в формате заказчика" });

test.describe("табель 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("над сеткой только панель, сетка до низа окна, шапка и первый столбец закреплены", async ({
    page,
  }) => {
    await open(page, "/gas/tabel");
    await expect(page.getByRole("toolbar", { name: "Панель табеля" })).toBeVisible();
    // Ни крупного итога, ни переключателя «Подтверждённые / Предварительный»
    await expect(page.getByTestId("report-total-amount")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Предварительный" })).toHaveCount(0);
    const box = (await grid(page).boundingBox())!;
    expect(box.y).toBeLessThanOrEqual(260);
    expect(box.y + box.height).toBeGreaterThan(900 - 140);

    const header = grid(page).getByRole("columnheader").first();
    const before = (await header.boundingBox())!;
    await grid(page).evaluate((el) => {
      el.scrollTop = 400;
      el.scrollLeft = 600;
    });
    const after = (await header.boundingBox())!;
    expect(Math.round(after.y)).toBe(Math.round(before.y));
    expect(Math.round(after.x)).toBe(Math.round(before.x));
    // Легенда под сеткой и янтарные ячейки непроверенных записей
    // Легенда по финальному промту (1.3): принято, ждёт проверки, нет записи по графику, нет сметы
    const legend = page.getByRole("list", { name: "Легенда" });
    for (const text of ["принято", "ждёт проверки", "нет записи по графику", "нет сметы"])
      await expect(legend).toContainText(text);
    await expect(grid(page).locator('[data-status="draft"]').first()).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  });

  test("выделить диапазон, итоги внизу и Ctrl+C в TSV", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, "/gas/tabel");
    // Строка «Итого»: у неё значения есть во все дни
    const total = grid(page).locator('tr[data-tabel-row="total"]');
    await total.scrollIntoViewIfNeeded();
    const cells = total.getByRole("gridcell");
    await cells.nth(0).click();
    await cells.nth(2).click({ modifiers: ["Shift"] });
    await expect(grid(page).locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(3);
    const stats = page.getByTestId("selection-stats");
    await expect(stats).toContainText("Выделено ячеек: 3");
    await expect(stats).toContainText("Сумма:");
    await expect(stats).toContainText("Количество:");
    await page.keyboard.press("ControlOrMeta+c");
    const text = await page.evaluate(() => navigator.clipboard.readText());
    const lines = text.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.split("\t")).toHaveLength(3);
    expect(lines[0]).toMatch(/^\d+\t\d+(,\d+)?\t\d+$/);

    // Заголовок строки выделяет её целиком, с подписью в первой колонке TSV
    await total.getByRole("rowheader").click();
    await page.keyboard.press("ControlOrMeta+c");
    const row = await page.evaluate(() => navigator.clipboard.readText());
    expect(row.startsWith("Итого\t")).toBe(true);
  });

  test("Enter открывает записи ячейки, правка с причиной видна в истории записи", async ({
    page,
  }) => {
    // ГЗ-00098 (mk-4): ячейка записи выделена переходом из сценария
    await open(page, "/gas/tabel?highlight=mk-4");
    const selected = grid(page).locator('[role="gridcell"][aria-selected="true"]');
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveAttribute("data-status", "draft");
    await selected.click();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    const entry = dialog.locator('[data-cell-entry="ГЗ-00098"]');
    await expect(entry).toBeVisible();
    await entry.getByRole("button", { name: "Исправить" }).click();
    await entry.getByLabel("Перерыв, мин").fill("30");
    const save = entry.getByRole("button", { name: "Сохранить исправление" });
    await expect(save).toBeDisabled();
    await entry.getByRole("button", { name: "Перерыв не учтён" }).click();
    await save.click();
    await expect(toast(page, "Исправлено")).toBeVisible();
    await page.keyboard.press("Escape");

    await open(page, "/gas/entries?q=ГЗ-00098");
    await page.locator("tr[data-entry-row]").first().click();
    const history = page.getByRole("region", { name: "История" });
    await expect(history).toContainText("Исправлено");
    await expect(history).toContainText("Причина: Перерыв не учтён");
  });

  test("«Неделя»: кнопка с числом причин ведёт к списку, строка счётчиков", async ({ page }) => {
    await open(page, "/gas/week");
    await gasRole(page, "Руководитель");
    await expect(page).toHaveURL(/\/gas\/week$/);
    // С причинами главная кнопка называет их число и ведёт к списку
    const close = page.getByRole("button", { name: /^Закрыть неделю \(\d+ причин/ });
    await expect(close).toBeVisible();
    await close.click();
    await expect(page.getByRole("list", { name: "Причины до закрытия" })).toBeInViewport();
    const counters = page.getByTestId("week-counters");
    await expect(counters).toContainText("не проверено");
    await expect(counters).toContainText("начислено");
    // Демо-неделя (ADR-062, F5): сумма по записям с составом и число записей без состава
    await expect(counters).toContainText(/чел\.-ч: [^·]+чел\.-ч\s*· в \d+ записях нет состава/);
  });

  test("«Колонки»: чел.-ч и порядок показателей, «По людям» без состава выключен", async ({
    page,
  }) => {
    await open(page, "/gas/tabel");
    await expect(grid(page).getByRole("columnheader", { name: "Чел.-ч" })).toHaveCount(0);
    await page.getByRole("button", { name: "Колонки" }).click();
    await page.getByRole("checkbox", { name: "Чел.-ч" }).check();
    await page.getByRole("radio", { name: "Сначала время" }).click();
    await page.keyboard.press("Escape");
    await expect(
      grid(page).getByRole("columnheader").filter({ hasText: "Чел.-ч" }).first(),
    ).toBeVisible();
    // «Сначала время»: в дне первыми часы
    await expect(grid(page).locator('th[data-col="0"]')).toHaveText("Часы");
    await expect(page.getByRole("tab", { name: "По людям" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("«Выгрузить ▾»: утверждённый Excel, черновик и честная синхронизация", async ({ page }) => {
    await open(page, "/gas/tabel");
    /*
     * Меню открывается после того, как прошлое закрылось и вернуло фокус кнопке: сразу после
     * выбора пункта Radix ещё закрывает меню, поэтому ждём открытия, а не кликаем вслепую
     */
    const openExport = async () => {
      const menu = page.getByRole("menu");
      await expect(menu).toHaveCount(0);
      await page.locator('[data-tour="export"]').click();
      await expect(menu).toBeVisible();
    };
    await openExport();
    // Неподключённая таблица названа рядом со значением, пунктов-обещаний нет (ADR-063, 1.4)
    await expect(page.getByTestId("sheet-status")).toHaveText("Облачная таблица: не подключена");
    await expect(
      page.getByRole("menuitem", { name: /Синхронизировать|Обновить таблицу/ }),
    ).toHaveCount(0);
    const [approved] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: /Excel утверждённый/ }).click(),
    ]);
    expect(approved.suggestedFilename()).toBe(FILE);
    await expect(toast(page, "Утверждённый файл выгружен")).toBeVisible();

    await openExport();
    const [draft] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: /Excel черновик/ }).click(),
    ]);
    expect(draft.suggestedFilename()).not.toBe(FILE);
    expect(draft.suggestedFilename()).toMatch(/черновик/i);
    await expect(toast(page, "Черновик выгружен")).toBeVisible();
  });

  test("/gas/reports перенаправляет в «Табель», переход из сценария сохраняется", async ({
    page,
  }) => {
    await open(page, "/gas/reports?highlight=mk-4");
    await expect(page).toHaveURL(/\/gas\/tabel\?highlight=mk-4/);
    await expect(grid(page).locator('tr[data-tour="report-row"]')).toHaveCount(1);
  });
});

test.describe("табель 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("список «бригада → объект → день» и «Открыть как таблицу»", async ({ page }) => {
    await open(page, "/gas/tabel");
    const list = page.getByRole("list", { name: "Табель по бригадам" });
    await list.locator("summary").first().click();
    await expect(list.locator("li li").first()).toContainText(/₽ · \d+,\d{2} ч/);
    await page.getByRole("button", { name: "Открыть как таблицу" }).click();
    await expect(grid(page)).toBeVisible();
    await page.getByRole("button", { name: "Списком" }).click();
    await expect(list).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
