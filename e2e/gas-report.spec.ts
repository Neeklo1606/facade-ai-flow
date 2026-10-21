import { execFileSync } from "node:child_process";
import { expect, test } from "./fixtures";

/** Совпадают с e2e/gas-report-state.ts: сам модуль тянет набор данных, который Node не читает */
const GAS_STATE_KEY = "neeklo-gas-ops-v1";
const SHOW_ENTRY_ID = "ent-show-m200";

/**
 * Отчёт и выгрузка (ADR-044, F6): неделя и день, переход `?highlight=` из сценария,
 * имя файла из события download, сверка с файлом заказчика. 1440 и 390 px.
 *
 * Запуск на dev-сервере: `E2E_PORT=5283 bunx playwright test e2e/gas-report.spec.ts --project=desktop`
 */

const FILE = "Выработка_бригад_28.09-03.10.2026.xlsx";
const prepared = JSON.parse(
  execFileSync("bun", ["run", "e2e/gas-report-state.cli.ts"], { encoding: "utf8" }),
) as { state: string; lines: { text: string; question?: { label: string } }[] };
const state = prepared.state;

// Dev-сервер собирает модули при первом заходе: запас по времени на холодный старт
test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
        localStorage.setItem("neeklo-gas-hint-seen", JSON.stringify(["reports"]));
      } catch {
        // без хранилища тест увидит исходный набор и упадёт на проверке строки
      }
    },
    { key: GAS_STATE_KEY, value: state },
  );
});

async function openReport(page: import("@playwright/test").Page, search = "") {
  await page.goto(`/gas/reports${search}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("html[data-booted]", { timeout: 60_000 });
  await page.locator("[data-report-row]").first().waitFor({ timeout: 30_000 });
}

/** Числа отчёта с неразрывными пробелами разрядов: сравниваем как обычный текст */
const plain = (value: string | null) => (value ?? "").replace(/[\u00a0\u202f]/g, " ").trim();

async function downloadName(page: import("@playwright/test").Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-tour="export"]').click(),
  ]);
  const path = await download.path();
  return { name: download.suggestedFilename(), path };
}

test.describe("отчёт, 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("неделя: первый столбец и шапка закреплены, прокрутка внутри таблицы", async ({ page }) => {
    await openReport(page);
    const table = page.getByTestId("report-table");
    const firstHead = table.getByRole("columnheader", { name: "Бригада и адрес" });
    const dayHead = table.getByRole("columnheader", { name: "Пн 28.09" });
    const before = await firstHead.boundingBox();
    await table.evaluate((el) => {
      el.scrollLeft = 600;
      el.scrollTop = 400;
      el.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(200);
    const after = await firstHead.boundingBox();
    expect(Math.round(after!.x)).toBe(Math.round(before!.x));
    expect(Math.round(after!.y)).toBe(Math.round(before!.y));
    // Шапка дней осталась наверху, хотя таблица прокручена вниз: у внутреннего края
    // области прокрутки, то есть под границей карточки 1 px (ADR-045, 3.4)
    const tableBox = await table.boundingBox();
    const border = await table.evaluate((el) => el.clientTop);
    expect(Math.round((await dayHead.boundingBox())?.y ?? 0)).toBe(
      Math.round(tableBox!.y + border),
    );
    // Страница не уехала вбок
    const pageScroll = await page.evaluate(
      () => document.scrollingElement!.scrollWidth - window.innerWidth,
    );
    expect(pageScroll).toBeLessThanOrEqual(0);
    // Тень у закреплённого края после прокрутки
    await expect(firstHead).toHaveClass(/shadow-/);
  });

  test("день: три столбца дня и итог недели, ничего не прокручивается", async ({ page }) => {
    await openReport(page);
    await page.getByRole("tab", { name: "Сб 03.10" }).click();
    const table = page.getByTestId("report-table");
    await expect(table.getByRole("columnheader", { name: "Итого недели" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Пн 28.09" })).toHaveCount(0);
    await expect(table.getByRole("columnheader", { name: "Сумма" })).toHaveCount(2);
    const overflow = await table.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    // «Скрыть пустые» за субботу оставляет только строки со значениями
    const all = await table.locator("tbody tr").count();
    await page.getByRole("checkbox").click();
    const kept = await table.locator("tbody tr").count();
    expect(kept).toBeLessThan(all);
    await expect(table.locator('tbody tr[data-kind="total"]')).toHaveCount(1);
  });

  test("переход из сценария: строка ОБ-200 раскрыта, подсвечена 4 секунды, «новая»", async ({
    page,
  }) => {
    await openReport(page, `?highlight=${SHOW_ENTRY_ID}`);
    const row = page.locator('[data-tour="report-row"]');
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toHaveAttribute("data-flash", "true");
    await expect(row).toBeInViewport();
    const text = plain(await row.innerText());
    expect(text).toContain("ст. Петровская, ул. Демо, 200");
    expect(text).toContain("новая");
    expect(text).toContain("14 700 ₽");
    expect(text).toContain("2,50 ч");
    expect(text).toContain("5 880 ₽/ч");
    await expect(row).not.toHaveAttribute("data-flash", "true", { timeout: 6_000 });
  });

  test("выгрузка: имя файла из события download, итог в файле равен экрану", async ({ page }) => {
    await openReport(page);
    const total = plain(await page.getByTestId("report-total-amount").innerText());
    const { name, path } = await downloadName(page);
    expect(name).toBe(FILE);
    const file = JSON.parse(
      execFileSync("bun", ["run", "e2e/gas-report-state.cli.ts", "read", path], {
        encoding: "utf8",
      }),
    ) as { label: string; amount: number; sheets: string[] };
    expect(file.label).toBe("Итого");
    expect(file.sheets).toEqual(["Отчёт", "Записи", "Как считалось"]);
    const amount = file.amount;
    expect(`${amount.toLocaleString("ru-RU").replace(/[\u00a0\u202f]/g, " ")} ₽`).toBe(total);
  });

  test("сверка с файлом: текст блока — строки расчёта сверки", async ({ page }) => {
    await openReport(page);
    await page.getByRole("button", { name: /Сверка с вашим файлом/ }).click();
    const items = page.getByTestId("reconcile-lines").locator("li");
    const lines = prepared.lines;
    await expect(items).toHaveCount(lines.length);
    const texts = (await items.allInnerTexts()).map(plain);
    expect(texts).toEqual(
      lines.map((line) => plain(line.question ? `${line.text} ${line.question.label}` : line.text)),
    );
    expect(texts[0]).toContain("1 524 132 ₽, 361,35 ч");
    expect(texts[1]).toContain("5 165 357 ₽, 776,08 ч");
  });
});

test.describe("отчёт, 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("телефон: дерево вместо таблицы, неделя и день капсулами", async ({ page }) => {
    await openReport(page);
    await expect(page.getByTestId("report-table")).toHaveCount(0);
    const tree = page.getByTestId("report-tree");
    await expect(tree).toBeVisible();
    await expect(page.getByRole("tab", { name: "Неделя" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Открывается свёрнутым до бригад: строк адресов не видно
    await expect(tree.locator('[data-kind="address"]')).toHaveCount(0);
    // Касание всей строки бригады раскрывает её
    await tree.locator('[data-kind="brigade"] button').first().click();
    await expect(tree.locator('[data-kind="address"]').first()).toBeVisible();
    const line = plain(await tree.locator('[data-kind="address"]').first().innerText());
    expect(line).toMatch(/₽ · \d+,\d\d ч · /);

    await page.getByRole("tab", { name: "Сб 03.10" }).click();
    await expect(page.getByRole("tab", { name: "Сб 03.10" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const overflow = await page.evaluate(
      () => document.scrollingElement!.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("телефон: переход выбирает день записи и показывает три числа в линию", async ({ page }) => {
    await openReport(page, `?highlight=${SHOW_ENTRY_ID}`);
    const row = page.locator('[data-tour="report-row"]');
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tab", { name: "Сб 03.10" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(row).toBeInViewport();
    expect(plain(await row.innerText())).toContain("14 700 ₽ · 2,50 ч · 5 880 ₽/ч");
  });

  test("телефон: выгрузка с тем же именем, фильтры аналитики в шторке", async ({ page }) => {
    await openReport(page);
    const { name } = await downloadName(page);
    expect(name).toBe(FILE);
    await page.getByRole("tab", { name: "Аналитика" }).click();
    await page.getByRole("button", { name: "Фильтры (0)" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Демо", exact: true }).click();
    await sheet.getByRole("button", { name: /^Показать/ }).click();
    await expect(page.getByRole("button", { name: "Фильтры (1)" })).toBeVisible();
  });
});
