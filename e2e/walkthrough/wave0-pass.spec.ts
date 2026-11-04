import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, open, test } from "../fixtures";
import { gasRole } from "../gas-helpers";

/**
 * Ручной проход волны 0 (ADR-062): «смета → правило → запись → проверка → неделя → xlsx»
 * на 390 и 1440 одной вкладкой, со снимками каждого шага. Данные только демо и синтетическая
 * смета. Запуск вне конвейера:
 * `npx playwright test -c playwright.walkthrough.config.ts wave0-pass`.
 * Снимки — `WAVE0_OUT` (по умолчанию docs/design/wave-f/wave0), файл недели — `WAVE0_FILES`.
 */
const OUT = process.env["WAVE0_OUT"] ?? "docs/design/wave-f/wave0";
const FILES = process.env["WAVE0_FILES"] ?? join(tmpdir(), "gaika-wave0");
const FILE = "Выработка_бригад_28.09-03.10.2026.xlsx";

const WIDTHS = [
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
] as const;

test.describe.configure({ timeout: 240_000 });

for (const width of WIDTHS) {
  test.describe(`проход волны 0 ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("смета → правило → запись → проверка → неделя → xlsx", async ({ page }) => {
      mkdirSync(OUT, { recursive: true });
      mkdirSync(FILES, { recursive: true });
      const snap = (step: string) =>
        page.screenshot({ path: join(OUT, `${width.name}-${step}.png`), fullPage: false });
      const noScroll = async () =>
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(0);

      // 1. Смета: синтетическая ГРАНД-Смета, привязка к ОБ-001, подтверждение
      const xlsx = join(FILES, `smeta-${width.name}.xlsx`);
      execFileSync("bun", ["run", "e2e/gas-estimate-file.cli.ts", xlsx, "--extras"]);
      await open(page, "/gas/estimates");
      await page.getByRole("button", { name: "Загрузить смету" }).click();
      await page.getByTestId("estimate-file").setInputFiles(xlsx);
      await page.getByRole("button", { name: "Всё верно, применить" }).click();
      const parsed = page.getByTestId("estimate-parsed");
      await expect(parsed).toBeVisible({ timeout: 15_000 });
      await parsed.getByRole("button", { name: "Выбрать объект" }).click();
      await page
        .getByRole("dialog")
        .last()
        .getByRole("button")
        .filter({ hasText: "ОБ-001" })
        .first()
        .click();
      await parsed.getByRole("button", { name: "Замечания проверены" }).click();
      await snap("01-smeta");
      await page.getByRole("button", { name: "Подтвердить смету" }).click();
      await expect(page.getByText(/Смета подтверждена: 100\s000\s₽/)).toBeVisible();
      await noScroll();

      // 2. Правило: конструктор с живым примером на последней смете
      await page.getByRole("button", { name: "Настроить", exact: true }).click();
      await expect(page.getByTestId("rule-total")).toHaveText(/100\s000,23\s₽/);
      await snap("02-pravilo");
      await page.getByRole("button", { name: "Отмена", exact: true }).click();
      await expect(page.getByTestId("rule-builder")).toHaveCount(0);

      // 3. Запись бригадира: «Сегодня», 08:00–17:00
      await gasRole(page, "Бригадир");
      await expect(page).toHaveURL(/\/gas\/brigade/);
      await page.getByRole("button", { name: "Добавить время" }).click();
      await page
        .getByRole("group", { name: "Начало" })
        .getByRole("button", { name: "08:00" })
        .click();
      await page
        .getByRole("group", { name: "Окончание" })
        .getByRole("button", { name: "17:00" })
        .click();
      await page.getByRole("button", { name: "Проверить" }).click();
      await page.getByRole("button", { name: "Отправить" }).click();
      const heading = page.getByRole("heading", { name: /Запись ГЗ-\d+ принята/ });
      await expect(heading).toBeVisible();
      const number = (await heading.textContent())!.match(/ГЗ-\d+/)![0];
      await snap("03-zapis");
      await noScroll();

      // 4. Проверка менеджером: новая запись в очереди, «Подтвердить»
      await gasRole(page, "Менеджер");
      await open(page, "/gas/moderation");
      const card = page.locator("[data-queue-card]", { hasText: number });
      await card.click();
      await snap("04-proverka");
      await page.locator('[data-tour="review-confirm"]').click();
      await expect(card).toHaveCount(0);
      // На телефоне лист сразу показывает следующую запись очереди: закрываем его
      const close = page.getByRole("dialog").getByRole("button", { name: "Закрыть" });
      if (await close.isVisible()) await close.click();
      await noScroll();

      // 5. Неделя руководителя: итог, что мешает, «Закрыть неделю»
      await gasRole(page, "Руководитель");
      await open(page, "/gas/week");
      await expect(page.getByTestId("week-counters")).toBeVisible();
      await snap("05-nedelya");
      await noScroll();

      // 6. Табель и файл недели
      await open(page, "/gas/tabel");
      await snap("06-tabel");
      // На телефоне одна кнопка «Выгрузить Excel» (утверждённый), на компьютере меню
      const exportButton = page.locator('[data-tour="export"]').filter({ visible: true }).first();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        width.hasTouch
          ? exportButton.click()
          : exportButton
              .click()
              .then(() => page.getByRole("menuitem", { name: /Excel утверждённый/ }).click()),
      ]);
      expect(download.suggestedFilename()).toBe(FILE);
      await download.saveAs(join(FILES, `${width.name}-${download.suggestedFilename()}`));
    });
  });
}
