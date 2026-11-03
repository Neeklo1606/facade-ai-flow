import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { expect, expectA11y, open, test } from "./fixtures";
import { enterClientContour, gasRole } from "./gas-helpers";

/**
 * Приёмка табеля T8 (ADR-061, решение 15; раздел 7 документа табеля).
 *
 * 1. Сквозной путь на 390 и 1440: бригадир вносит «с 8 до 17» на ОБ-101, где уже принята
 *    запись 08:10–11:40 → менеджер видит «Пересечение», исправляет перерыв с причиной,
 *    принимает → руководитель закрывает неделю → Excel v1 → переоткрытие → v2.
 * 2. Пороги таблицы T8. Замер печатается строкой «ПРИЁМКА …» — из неё собран
 *    docs/design/tabel/report.md. Ошибки консоли ловит оснастка (`consoleGuard`) в каждом тесте.
 */

const KEY = "neeklo-gas-ops-v1:client";
const STATE = execFileSync("bun", ["run", "e2e/crew-week-state.cli.ts", "--confirm", "ГЗ-00095"], {
  encoding: "utf8",
});

const fact = (name: string, value: string | number) => console.log(`ПРИЁМКА ${name}: ${value}`);

/** Причины до закрытия: принять как есть с текстом причины (как в crew-week.spec.ts) */
async function acceptAll(page: Page) {
  const reasons = page.getByRole("list", { name: "Причины до закрытия" });
  await expect(reasons).toBeVisible();
  for (;;) {
    const bulk = reasons.getByRole("button", { name: /^Принять все \d+ как есть$/ }).first();
    if (!(await bulk.isVisible().catch(() => false))) break;
    await bulk.click();
    await reasons
      .getByLabel(/^Причина для всех/)
      .last()
      .fill("Бригада работала по другому графику");
  }
  for (;;) {
    const one = reasons.getByRole("button", { name: "Принять как есть" }).first();
    if (!(await one.isVisible().catch(() => false))) break;
    await one.click();
    await reasons.getByLabel("Причина", { exact: true }).last().fill("Согласовано с заказчиком");
  }
}

/** Все значения листов файла одной строкой: проверка содержимого, а не только имени */
function workbookText(path: string): string {
  const book = XLSX.read(readFileSync(path));
  return book.SheetNames.map((name) => XLSX.utils.sheet_to_csv(book.Sheets[name]!)).join("\n");
}

const WIDTHS = [
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
] as const;

for (const width of WIDTHS) {
  test.describe(`приёмка: сквозной путь ${width.name}`, () => {
    test.describe.configure({ timeout: 180_000 });
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test.beforeEach(async ({ page }) => {
      await enterClientContour(page);
      await page.addInitScript(
        ({ key, value }) => {
          try {
            if (!sessionStorage.getItem("acceptance-seeded")) {
              localStorage.setItem(key, value);
              sessionStorage.setItem("acceptance-seeded", "1");
            }
          } catch {
            // Без хранилища путь не пройдёт: тест упадёт на первом шаге
          }
        },
        { key: KEY, value: STATE },
      );
    });

    test("бригадир «с 8 до 17» → пересечение → правка перерыва → v1 → переоткрытие → v2", async ({
      page,
    }) => {
      // 1. Бригадир: объект, где уже принято 08:10–11:40
      await page.goto("/gas/brigade", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("html[data-booted]", { timeout: 60_000 });
      await page.getByRole("button", { name: "Добавить время" }).click();
      await page.getByRole("button", { name: /^Объект/ }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /ОБ-101/ })
        .first()
        .click();
      await expect(page.getByTestId("busy-line")).toContainText("уже внесено: 08:10–11:40");
      await page.getByLabel("Время работы").fill("с 8 до 17");
      await expect(page.getByTestId("time-decoded")).toHaveText("08:00–17:00 · 9 ч 00 мин");
      await page.getByRole("button", { name: "Проверить" }).click();
      await expect(page.getByRole("list", { name: "Пометки для менеджера" })).toContainText(
        "Пересечение времени: ГЗ-00095 08:10–11:40",
      );
      await page.getByRole("button", { name: "Отправить" }).click();
      await expect(page.getByText("Записано", { exact: true })).toBeVisible();
      const heading = await page
        .getByRole("heading", { name: /Запись ГЗ-\d+ принята/ })
        .textContent();
      const number = /ГЗ-\d+/.exec(heading ?? "")![0];
      await page.getByRole("button", { name: "Готово" }).click();

      // 2. Менеджер: метка «Пересечение» в очереди, перерыв 60 мин с причиной, принять
      await gasRole(page, "Менеджер");
      await expect(page).toHaveURL(/\/gas\/moderation$/);
      const card = page.locator("[data-queue-card]").filter({ hasText: number });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText("Пересечение");
      await card.click();
      await page.getByRole("button", { name: "Исправить", exact: true }).click();
      // Форма бригадира ставит перерыв 60 мин по умолчанию: менеджер исправляет на 30
      await page.getByLabel("Перерыв, мин").fill("30");
      await page.getByRole("button", { name: "Со слов бригадира" }).click();
      await page.getByRole("button", { name: "Сохранить исправление" }).click();
      // Правка перерыва уходит в историю изменением минут: 8 ч → 8 ч 30 мин
      await expect(page.getByText("Минуты: 480 → 510").first()).toBeAttached();
      const calc = page.getByRole("region", { name: "Расчёт" }).filter({ visible: true });
      await expect(calc).toContainText("30 мин");
      await expect(calc).toContainText("510 мин");
      await page.locator('[data-tour="review-confirm"]:visible').click();
      await expect(page.locator("[data-sonner-toast]", { hasText: "Принято" })).toBeVisible();

      // 3. Руководитель: закрыть неделю, файл v1 с записью 8 ч
      await gasRole(page, "Руководитель");
      await expect(page).toHaveURL(/\/gas\/week$/);
      await acceptAll(page);
      await page.getByRole("button", { name: "Закрыть неделю" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Закрыть неделю" }).click();
      await expect(page.getByText("Закрыта, версия v1", { exact: true })).toBeVisible();
      const [file1] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Скачать файл v1" }).click(),
      ]);
      expect(file1.suggestedFilename()).toMatch(/_v1\.xlsx$/);
      const v1 = workbookText((await file1.path())!);
      expect(v1).toContain("Демо, 101");

      // 4. Переоткрытие с причиной → v2; v1 остаётся
      await page.getByRole("button", { name: "Переоткрыть с причиной" }).click();
      await page.getByLabel("Причина переоткрытия").fill("Заказчик прислал исправленный график");
      await page.getByRole("button", { name: "Переоткрыть", exact: true }).click();
      await expect(page.getByText("Открыта", { exact: true })).toBeVisible();
      await acceptAll(page);
      await page.getByRole("button", { name: "Закрыть неделю" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Закрыть неделю" }).click();
      await expect(page.getByText("Закрыта, версия v2", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Скачать файл v1" })).toBeVisible();
      const [file2] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Скачать файл v2" }).click(),
      ]);
      expect(file2.suggestedFilename()).toMatch(/_v2\.xlsx$/);
      expect(workbookText((await file2.path())!)).toContain("Демо, 101");
      fact(`сквозной путь ${width.name}`, `${number}, v1 и v2 скачаны`);
    });
  });
}

/* ---------------------------------------------------------------- Пороги */

test.describe("приёмка: касания бригадира 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("типичная запись не больше 5 касаний", async ({ page }) => {
    await open(page, "/gas");
    await gasRole(page, "Бригадир");
    await expect(page).toHaveURL(/\/gas\/brigade/);
    let taps = 0;
    const tap = async (locator: ReturnType<Page["getByRole"]>) => {
      await locator.click();
      taps += 1;
    };
    await tap(page.getByRole("button", { name: "Добавить время" }));
    await tap(page.getByRole("group", { name: "Начало" }).getByRole("button", { name: "08:00" }));
    await tap(
      page.getByRole("group", { name: "Окончание" }).getByRole("button", { name: "17:00" }),
    );
    await tap(page.getByRole("button", { name: "Проверить" }));
    await tap(page.getByRole("button", { name: "Отправить" }));
    await expect(page.getByText("Записано", { exact: true })).toBeVisible();
    fact("касаний на типичную запись", taps);
    expect(taps).toBeLessThanOrEqual(5);
  });
});

test.describe("приёмка: первый экран 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("первая карточка очереди не ниже 200 px, табель в первом экране", async ({ page }) => {
    await open(page, "/gas/moderation");
    const first = (await page.locator("[data-queue-card]").first().boundingBox())!;
    fact("первая карточка «Проверки» на 1440, px", Math.round(first.y));
    expect(first.y).toBeLessThanOrEqual(200);

    await open(page, "/gas/tabel");
    const grid = (await page
      .getByRole("grid", { name: "Табель в формате заказчика" })
      .boundingBox())!;
    fact("верх таблицы «Табеля» на 1440, px из 900", Math.round(grid.y));
    expect(grid.y).toBeLessThan(900);
  });
});

test.describe("приёмка: табель 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("список табеля начинается в первом экране", async ({ page }) => {
    await open(page, "/gas/tabel");
    const list = (await page.getByRole("list", { name: "Табель по бригадам" }).boundingBox())!;
    fact("верх списка «Табеля» на 390, px из 844", Math.round(list.y));
    expect(list.y).toBeLessThan(844);
  });
});

/** Экраны приёмки: путь, роль и что на нём ждать */
const SCREENS: { path: string; role: string }[] = [
  { path: "/gas/brigade", role: "Бригадир" },
  { path: "/gas/foreman", role: "Бригадир" },
  { path: "/gas/moderation", role: "Менеджер" },
  { path: "/gas/entries", role: "Менеджер" },
  { path: "/gas/tabel", role: "Менеджер" },
  { path: "/gas/week", role: "Руководитель" },
  { path: "/gas/employees", role: "Менеджер" },
];

async function visit(
  page: Page,
  screen: { path: string; role: string },
  current: { role: string },
) {
  // Роль меняется через профиль в шапке того же экрана, затем снова открывается сам экран
  await open(page, screen.path);
  if (current.role !== screen.role) {
    await gasRole(page, screen.role);
    current.role = screen.role;
    await open(page, screen.path);
  }
}

for (const width of [390, 768, 1024, 1440]) {
  test.describe(`приёмка: переполнение ${width}`, () => {
    test.use({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 768 });

    test("ни один экран табеля не шире окна", async ({ page }) => {
      const current = { role: "Менеджер" };
      const wide: string[] = [];
      for (const screen of SCREENS) {
        await visit(page, screen, current);
        const extra = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (extra > 0) wide.push(`${screen.path} +${extra}px`);
      }
      fact(`переполнение ${width}`, wide.length ? wide.join(", ") : "0 на 7 экранах");
      expect(wide).toEqual([]);
    });
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [390, 1440]) {
    test.describe(`приёмка: axe ${width} ${theme}`, () => {
      test.describe.configure({ timeout: 120_000 });
      test.use({
        viewport: { width, height: width < 768 ? 844 : 900 },
        hasTouch: width < 768,
        theme,
      });

      test("экраны табеля, помощник и тур без serious", async ({ page }) => {
        const current = { role: "Менеджер" };
        for (const screen of SCREENS) {
          await visit(page, screen, current);
          await expectA11y(page, `${screen.path} ${width} ${theme}`);
        }
        // Помощник (менеджер) и подсказка тура поверх экрана
        await visit(page, { path: "/gas/moderation", role: "Менеджер" }, current);
        await page.getByTestId("assistant-open").click();
        await expect(page.getByRole("dialog", { name: "Помощник" })).toBeVisible();
        await expectA11y(page, `помощник ${width} ${theme}`);
        await page.getByRole("button", { name: "Закрыть помощника" }).click();
        await open(page, "/gas");
        await page.getByRole("button", { name: "Показать за 3 минуты" }).click();
        await expect(page.getByTestId("tour-card")).toBeVisible();
        await expectA11y(page, `тур ${width} ${theme}`);
        fact(`axe ${width} ${theme}`, `без serious на ${SCREENS.length + 2} экранах`);
      });
    });
  }
}
