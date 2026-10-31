import { execFileSync } from "node:child_process";
import { expect, test } from "./fixtures";
import { enterClientContour, gasRole } from "./gas-helpers";

/**
 * Сквозной путь учёта времени бригад (ADR-056, S4) на 390 и 1440: бригадир внёс время →
 * менеджер исправил состав с причиной → принял → руководитель закрыл неделю → файл v1 →
 * переоткрытие с причиной → v2, файл v1 остаётся.
 *
 * Исходное состояние: набор личного контура (как у проверок отчёта), где демо-записи прежних сценариев уже решены
 * (отклонены). Иначе неделю держали бы чужие непроверенные записи — их закрытие проверяют
 * тесты домена, а здесь путь одной записи.
 */
const KEY = "neeklo-gas-ops-v1:client";
const STATE = execFileSync("bun", ["run", "e2e/crew-week-state.cli.ts"], { encoding: "utf8" });

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await enterClientContour(page);
  await page.addInitScript(
    ({ key, value }) => {
      try {
        if (!sessionStorage.getItem("crew-week-seeded")) {
          localStorage.setItem(key, value);
          sessionStorage.setItem("crew-week-seeded", "1");
        }
      } catch {
        // Без хранилища путь не пройдёт: тест упадёт на первом шаге
      }
    },
    { key: KEY, value: STATE },
  );
});

async function acceptAll(page: import("@playwright/test").Page) {
  const reasons = page.getByRole("list", { name: "Причины до закрытия" });
  // Сначала дождаться списка: иначе циклы ниже закончатся раньше, чем он появится
  await expect(reasons).toBeVisible();
  // Группы: «Принять все N как есть» и одна причина на группу
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

for (const [name, viewport] of [
  ["390", { width: 390, height: 844 }],
  ["1440", { width: 1440, height: 900 }],
] as const) {
  test.describe(`учёт времени бригад, ${name}`, () => {
    test.use({ viewport });

    test("бригадир → менеджер → руководитель: версия v1, переоткрытие, v2", async ({ page }) => {
      // 1. Бригадир: «Сегодня», форма, проверка перед отправкой, «Принято сервером»
      await page.goto("/gas/brigade", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("html[data-booted]", { timeout: 60_000 });
      await expect(page.getByText("Бригада 1 ·")).toBeVisible();
      await page.getByRole("button", { name: "Добавить время" }).click();
      await page.getByRole("button", { name: "Другое время" }).first().click();
      await page.getByLabel("Другое начало").fill("12:00");
      await page
        .getByRole("group", { name: "Окончание" })
        .getByRole("button", { name: "17:00" })
        .click();
      await page.getByRole("button", { name: "Проверить" }).click();
      await expect(page.getByText("4 чел., по 4 ч на человека, всего 16 чел.-ч")).toBeVisible();
      await page.getByRole("button", { name: "Отправить" }).click();
      await expect(page.getByText("Принято сервером")).toBeVisible();
      const heading = await page
        .getByRole("heading", { name: /Запись ГЗ-\d+ принята/ })
        .textContent();
      const number = /ГЗ-\d+/.exec(heading ?? "")![0];
      // Финансов бригадир не видит нигде
      await page.getByRole("button", { name: "Готово" }).click();
      await expect(page.locator("main")).not.toContainText("₽");

      // 2. Менеджер: открыть запись, исправить состав с причиной, принять
      await gasRole(page, "Менеджер");
      await expect(page).toHaveURL(/\/gas\/moderation$/);
      await page.locator("[data-queue-card]").filter({ hasText: number }).click();
      await page.getByRole("button", { name: "Ещё действия" }).click();
      await page.getByRole("menuitem", { name: "Исправить" }).click();
      await page.getByLabel("Людей").fill("3");
      await page.getByRole("button", { name: "Со слов бригадира" }).click();
      await page.getByRole("button", { name: "Сохранить исправление" }).click();
      // История записи свёрнута в детали: правка с причиной в ней есть
      await expect(page.getByText("Состав: 4 чел. → 3 чел.").first()).toBeAttached();
      await page.getByRole("button", { name: /^Подтвердить/ }).click();
      await expect(page.getByText("Подтверждено", { exact: true }).first()).toBeVisible();

      // 3. Руководитель: «Неделя», причины приняты как есть с причиной, закрытие v1
      await gasRole(page, "Руководитель");
      await expect(page).toHaveURL(/\/gas\/week$/);
      await expect(page.getByText("Открыта", { exact: true })).toBeVisible();
      await acceptAll(page);
      const close = page.getByRole("button", { name: "Закрыть неделю" });
      await expect(close).toBeEnabled();
      await close.click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Закрыть неделю" }).click();
      await expect(page.getByText("Закрыта, версия v1", { exact: true })).toBeVisible();

      const [file1] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Скачать файл v1" }).click(),
      ]);
      expect(file1.suggestedFilename()).toMatch(/_v1\.xlsx$/);

      // 4. Переоткрытие с причиной: v1 остаётся, следующее закрытие даёт v2
      await page.getByRole("button", { name: "Переоткрыть с причиной" }).click();
      await page.getByLabel("Причина переоткрытия").fill("Заказчик прислал исправленный график");
      await page.getByRole("button", { name: "Переоткрыть", exact: true }).click();
      await expect(page.getByText("Открыта", { exact: true })).toBeVisible();
      await expect(
        page.getByText(/Переоткрыта .*: Заказчик прислал исправленный график/),
      ).toBeVisible();
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
    });
  });
}
