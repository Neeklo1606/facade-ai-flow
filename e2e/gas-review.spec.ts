import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";

/**
 * Проверка записей газа (ADR-044, F5): подтверждение, отмена, пачка, отклонение с причиной,
 * запись после подтверждения в журнале. На 390 (лист снизу с плавающей капсулой) и 1440
 * (панель справа, клавиши J, K, Enter). Каждый тест начинает с исходного демо-набора.
 *
 * Записи демо-набора: ГЗ-00096 без замечаний (только «объект на несколько дней»),
 * ГЗ-00098 требует внимания (пересечение, нет суммы).
 */

const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });

const card = (page: Page, number: string) => page.locator("[data-queue-card]", { hasText: number });

const confirmButton = (page: Page) => page.locator('[data-tour="review-confirm"]');

const WIDTHS = [
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
  { name: "1440", viewport: { width: 1440, height: 900 }, phone: false },
] as const;

for (const run of WIDTHS) {
  test.describe(`проверка ${run.name}`, () => {
    test.use({ viewport: run.viewport });

    test("группы и вкладки: по умолчанию «Ожидает проверки»", async ({ page }) => {
      await open(page, "/gas/moderation");
      await expect(page.getByRole("tab", { name: /Ожидает проверки/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.getByRole("heading", { name: "Требуют внимания" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Без замечаний" })).toBeVisible();
      // На карточке не больше двух признаков, остальное «+N»
      const chips = card(page, "ГЗ-00098").locator("ul > li");
      expect(await chips.count()).toBeLessThanOrEqual(3);
      await expect(card(page, "ГЗ-00098")).toContainText("+");
    });

    test("подтверждение в два касания и отмена из тоста", async ({ page }) => {
      await open(page, "/gas/moderation");
      await card(page, "ГЗ-00096").click();
      if (run.phone) await expect(page.locator("[data-review-sheet]")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Посчитала система" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Почему помечено" })).toBeVisible();
      await confirmButton(page).click();

      await expect(toast(page, "Подтверждено")).toBeVisible();
      await expect(card(page, "ГЗ-00096")).toHaveCount(0);
      // Открылась следующая запись: кнопка подтверждения снова на месте
      await expect(confirmButton(page)).toBeVisible();

      await toast(page, "Подтверждено").getByRole("button", { name: "Отменить" }).click();
      await expect(card(page, "ГЗ-00096")).toBeVisible();
    });

    /*
     * Пачка «Без замечаний» (ADR-045, 5.4 и принцип 8): выполняется сразу, без диалога,
     * тост «Подтверждено N записей на … ₽» с отменой 6 секунд.
     */
    test("пачка «Без замечаний» сразу и с отменой из тоста", async ({ page }) => {
      await open(page, "/gas/moderation");
      const button = page.getByRole("button", { name: /Подтвердить все \d+/ });
      const label = (await button.innerText()).trim();
      const count = Number(label.match(/(\d+)/)?.[1]);
      expect(count).toBeGreaterThan(0);
      await button.click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);

      const done = toast(
        page,
        new RegExp(`Подтверждено ${count} запис[а-я]* на [\\d\\s\u00a0\u202f]+₽`),
      );
      await expect(done).toBeVisible();
      await expect(page.getByRole("heading", { name: "Без замечаний" })).toHaveCount(0);

      await done.getByRole("button", { name: "Отменить" }).click();
      await expect(page.getByRole("heading", { name: "Без замечаний" })).toBeVisible();
      await expect(page.getByRole("button", { name: `Подтвердить все ${count}` })).toBeVisible();
    });

    test("отклонение требует причину: частая причина отклоняет сразу", async ({ page }) => {
      await open(page, "/gas/moderation");
      await card(page, "ГЗ-00098").click();
      await page.getByRole("button", { name: "Ещё действия" }).click();
      await page.getByRole("menuitem", { name: "Отклонить" }).click();

      // Без причины отправить нельзя: свой текст пуст, кнопка недоступна
      const submit = page.getByRole("button", { name: "Отклонить запись" });
      await expect(submit).toBeDisabled();
      // Частая причина применяется сразу: отклонение за 4 касания (ADR-045, раздел 6)
      await page.getByRole("button", { name: "Дубль записи" }).click();

      await expect(toast(page, "Отклонено")).toBeVisible();
      await expect(card(page, "ГЗ-00098")).toHaveCount(0);
      if (run.phone && (await page.locator("[data-review-sheet]").count()) > 0) {
        await page.getByRole("button", { name: "Закрыть" }).click();
      }
      await page.getByRole("tab", { name: /Отклонено/ }).click();
      await card(page, "ГЗ-00098").click();
      await expect(page.getByText("Дубль записи").first()).toBeVisible();
    });

    test("подтверждённая запись видна в журнале по поиску", async ({ page }) => {
      await open(page, "/gas/moderation");
      await card(page, "ГЗ-00096").click();
      await confirmButton(page).click();
      await expect(toast(page, "Подтверждено")).toBeVisible();

      await open(page, "/gas/entries?q=ГЗ-00096");
      await expect(page.getByRole("searchbox", { name: "Поиск по журналу" })).toHaveValue(
        "ГЗ-00096",
      );
      const found = run.phone
        ? card(page, "ГЗ-00096")
        : page.getByRole("row", { name: /ГЗ-00096/ });
      await expect(found).toHaveCount(1);
      await expect(found).toContainText("Подтверждено");
    });

    test("?open= открывает и подсвечивает запись", async ({ page }) => {
      await open(page, "/gas/moderation?open=mk-4");
      await expect(page.locator("#review-title")).toBeVisible();
      await expect(card(page, "ГЗ-00098")).toHaveClass(/ring-orange/);
      await expect(confirmButton(page)).toBeVisible();
    });

    if (run.phone) {
      /*
       * ADR-045 «Финальный интерфейс», 4.4 и 4.13: открытая карточка закрывает нижнюю панель
       * оболочки, внизу один слой — панель действий 64 у края экрана. Раньше (ADR-044)
       * капсула решения плавала над панелью и полосой показа: поменялось решение владельца.
       */
      test("карточка закрывает нижнюю панель и держит одну панель действий", async ({ page }) => {
        await open(page, "/gas/moderation");
        await card(page, "ГЗ-00096").click();
        const bar = await page.getByRole("group", { name: "Решение по записи" }).boundingBox();
        expect(bar).not.toBeNull();
        await expect(page.getByRole("navigation", { name: "Основные разделы" })).toBeHidden();
        await expect(page.locator("[data-gas-show-dock]")).toHaveCount(0);
        const viewport = page.viewportSize()!;
        expect(bar!.y + bar!.height).toBeLessThanOrEqual(viewport.height);
        expect(bar!.height).toBeLessThanOrEqual(65);
        // «Подтвердить» в карточке — полевое действие: не ниже 48 px
        const confirm = await confirmButton(page).boundingBox();
        expect(confirm!.height).toBeGreaterThanOrEqual(48);
      });
    } else {
      test("клавиши J, K и Enter", async ({ page }) => {
        await open(page, "/gas/moderation");
        // Клавиши описаны в «?» плавающей панели, а не строкой в теле экрана (ADR-055, S2 п. 5)
        await page
          .getByRole("complementary", { name: "Панель действий" })
          .getByRole("button", { name: "Что делать на этом экране" })
          .click();
        await expect(
          page.getByRole("dialog").getByText(/клавиши J и K ведут по списку/),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        // Пока справка открыта, экран клавиши не перехватывает: ждём, что она закрылась
        await expect(page.getByRole("dialog")).toHaveCount(0);
        // Фокус вернулся на «?»: Enter на кнопке снова открыл бы справку. Работа идёт в списке
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const first = page.locator("[data-queue-card]").first();
        await expect(first).toHaveAttribute("aria-pressed", "true");
        await page.locator("body").press("j");
        await expect(page.locator("[data-queue-card]").nth(1)).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await page.locator("body").press("k");
        await expect(first).toHaveAttribute("aria-pressed", "true");
        const id = await first.getAttribute("data-queue-card");
        await page.locator("body").press("Enter");
        await expect(toast(page, "Подтверждено")).toBeVisible();
        await expect(page.locator(`[data-queue-card="${id}"]`)).toHaveCount(0);
        // Следующая запись открылась сама
        await expect(page.locator('[data-queue-card][aria-pressed="true"]')).toHaveCount(1);
      });
    }
  });
}
