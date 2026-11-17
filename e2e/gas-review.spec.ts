import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";

/** Проверка карточками (ADR-074): одинаковая закрытая высота, раскрытие на месте,
 * независимый выбор, индивидуальные решения, причины, сравнение и клавиатура.
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

    test("очередь сразу под шапкой: таблетки и счётчики, без карточек показателей", async ({
      page,
    }) => {
      await open(page, "/gas/moderation");
      await expect(page.getByRole("tab", { name: /^Новые/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      // Счётчики типов отдельно: подозрения и финансы не складываются в «с замечаниями»
      const summary = page.getByTestId("queue-summary");
      await expect(summary).toContainText("6 новых");
      await expect(summary).toContainText("5 с подозрением");
      await expect(summary).toContainText("2 без полной стоимости");
      await expect(page.getByRole("list", { name: "Показатели проверки" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Требуют внимания" })).toHaveCount(0);
      // На строке не больше двух меток, остальное «+N»
      const chips = card(page, "ГЗ-00098").locator("ul > li:not([aria-hidden])");
      expect(await chips.count()).toBeLessThanOrEqual(3);
      await expect(card(page, "ГЗ-00098")).toContainText("+");
      const cards = page.locator("[data-queue-card]");
      const heights = await cards.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().height),
      );
      expect(new Set(heights).size).toBe(1);
      expect(heights[0]).toBeGreaterThanOrEqual(96);
      await expect(cards.first()).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#review-title")).toHaveCount(0);
      if (!run.phone) {
        const first = (await cards.first().boundingBox())!;
        expect(first.y + first.height).toBeLessThan(page.viewportSize()!.height);
      }
    });

    test("принять в два касания, отмена из тоста, пять блоков детали", async ({ page }) => {
      await open(page, "/gas/moderation");
      await card(page, "ГЗ-00096").click();
      await expect(card(page, "ГЗ-00096")).toHaveAttribute("aria-expanded", "true");
      for (const name of ["Что проверить", "Данные бригадира", "Расчёт", "Стоимость", "История"])
        await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
      await confirmButton(page).click();

      await expect(toast(page, "Принято")).toBeVisible();
      await expect(card(page, "ГЗ-00096")).toHaveCount(0);
      // Открылась следующая запись: кнопка «Принять» снова на месте
      await expect(confirmButton(page)).toBeVisible();

      await toast(page, "Принято").getByRole("button", { name: "Отменить" }).click();
      await expect(card(page, "ГЗ-00096")).toBeVisible();
    });

    /*
     * «Принять N без замечаний» (2.3, п. 5): только записи без ошибок данных и подозрений,
     * выполняется сразу, отмена в тосте 6 секунд.
     */
    test("«Принять N без замечаний» сразу и с отменой из тоста", async ({ page }) => {
      await open(page, "/gas/moderation");
      const button = page.getByRole("button", { name: /^Принять \d+ без замечаний$/ });
      const count = Number((await button.innerText()).match(/(\d+)/)?.[1]);
      expect(count).toBe(1);
      await button.click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);

      const done = toast(page, new RegExp(`Принято ${count} запис[а-я]*`));
      await expect(done).toBeVisible();
      await expect(card(page, "ГЗ-00096")).toHaveCount(0);
      // Записи с подозрениями пачкой не принимаются
      await expect(card(page, "ГЗ-00098")).toBeVisible();
      await expect(page.getByRole("button", { name: "Принять 0 без замечаний" })).toBeDisabled();

      await done.getByRole("button", { name: "Отменить" }).click();
      await expect(
        page.getByRole("button", { name: `Принять ${count} без замечаний` }),
      ).toBeEnabled();
    });

    test("исправить можно только с причиной, причина видна в истории", async ({ page }) => {
      await open(page, "/gas/moderation");
      await card(page, "ГЗ-00098").click();
      await page.getByRole("button", { name: "Исправить", exact: true }).click();
      const form = page.locator("section", { has: page.locator("#reason-title") });
      await expect(form.getByRole("heading", { name: "Исправление времени" })).toBeVisible();
      await form.getByLabel("Перерыв, мин").fill("30");
      // На телефоне кнопки формы стоят панелью у края экрана, вне секции формы
      const save = page.getByRole("button", { name: "Сохранить исправление" });
      await expect(save).toBeDisabled();
      await form.getByRole("button", { name: "Перерыв не учтён" }).click();
      await expect(save).toBeEnabled();
      await save.click();
      await expect(toast(page, "Исправлено")).toBeVisible();
      const history = page.getByRole("region", { name: "История" });
      await expect(history).toContainText("Исправлено");
      await expect(history).toContainText("Причина: Перерыв не учтён");
      await expect(history).toContainText("Минуты:");
    });

    test("вернуть на уточнение с вопросом: запись уходит в «На уточнении»", async ({ page }) => {
      await open(page, "/gas/moderation");
      const before = Number(
        (await page.getByRole("tab", { name: /^На уточнении/ }).innerText()).match(/(\d+)/)![1],
      );
      await card(page, "ГЗ-00098").click();
      await page.getByRole("button", { name: "Вернуть на уточнение" }).click();
      const form = page.locator("section", { has: page.locator("#reason-title") });
      const send = page.getByRole("button", { name: "Вернуть бригадиру" });
      await expect(send).toBeDisabled();
      await form.getByLabel("Свой текст").fill("Где была бригада с 12 до 13?");
      await send.click();
      await expect(toast(page, "Возвращено на уточнение")).toBeVisible();
      await expect(card(page, "ГЗ-00098")).toHaveCount(0);
      // После решения открыта следующая запись, фильтр «Новые» на месте
      await expect(page.getByRole("tab", { name: /^Новые/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(confirmButton(page)).toBeVisible();
      if (run.phone && (await page.locator("[data-review-sheet]").count()) > 0) {
        await page.getByRole("button", { name: "Закрыть" }).click();
      }
      const tab = page.getByRole("tab", { name: /^На уточнении/ });
      await expect(tab).toContainText(String(before + 1));
      await tab.click();
      await card(page, "ГЗ-00098").click();
      await expect(page.getByText("Где была бригада с 12 до 13?").first()).toBeVisible();
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
      // Отдельной таблетки отклонённых нет (ADR-056): отклонённая запись во «Все»
      await page.getByRole("tab", { name: /^Все/ }).click();
      await card(page, "ГЗ-00098").click();
      await expect(page.getByText("Дубль записи").first()).toBeVisible();
    });

    test("«Сравнить» показывает две записи рядом с подсвеченными отличиями", async ({ page }) => {
      await open(page, "/gas/moderation");
      await card(page, "ГЗ-00098").click();
      const remark = page.locator('[data-remark="overlap"]');
      await expect(remark).toContainText("Пересечение времени");
      await expect(remark).toContainText("Принять можно, но не пачкой");
      await remark
        .getByRole("button", { name: /^Сравнить с ГЗ-\d+/ })
        .first()
        .click();
      const compare = page.getByTestId("compare");
      await expect(compare).toBeVisible();
      await expect(compare.locator("[data-differs]").first()).toBeVisible();
      await expect(compare).toContainText("ГЗ-00098");
      await page.keyboard.press("Escape");
      await expect(compare).toHaveCount(0);
      // Окно закрылось, деталь осталась
      await expect(page.locator("#review-title")).toBeVisible();
    });

    test("принятая запись видна в журнале по поиску", async ({ page }) => {
      await open(page, "/gas/moderation");
      await card(page, "ГЗ-00096").click();
      await confirmButton(page).click();
      await expect(toast(page, "Принято")).toBeVisible();

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
       * Телефон (4.3): список и деталь на весь экран, кнопки решения внизу одним слоем
       * 64 px у края экрана, нижняя панель оболочки закрыта.
       */
      test("деталь внутри карточки, одна панель решения и доступное меню", async ({ page }) => {
        await open(page, "/gas/moderation");
        await card(page, "ГЗ-00096").click();
        const actions = page.getByRole("group", { name: "Решение по записи" });
        await expect(actions).toHaveCount(1);
        await actions.scrollIntoViewIfNeeded();
        const bar = await actions.boundingBox();
        expect(bar).not.toBeNull();
        await expect(page.getByRole("navigation", { name: "Основные разделы" })).toBeVisible();
        const viewport = page.viewportSize()!;
        expect(bar!.y + bar!.height).toBeLessThanOrEqual(viewport.height);
        // Две строки действий по 48 px с отступами, без прежнего полноэкранного листа.
        expect(bar!.height).toBeLessThanOrEqual(144);
        // «Принять» — полевое действие: не ниже 48 px
        const confirm = await confirmButton(page).boundingBox();
        expect(confirm!.height).toBeGreaterThanOrEqual(48);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    } else {
      test("клавиши J, K, Enter и Esc", async ({ page }) => {
        await open(page, "/gas/moderation");
        // Клавиши описаны в справке ⓘ шапки экрана, а не строкой в теле (ADR-061, T1 п. 5)
        await page.getByRole("button", { name: "Справка: Проверка" }).click();
        await expect(
          page.getByRole("dialog").getByText(/клавиши J и K ведут по списку/),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        // Пока справка открыта, экран клавиши не перехватывает: ждём, что она закрылась
        await expect(page.getByRole("dialog")).toHaveCount(0);
        // Фокус вернулся на «?»: Enter на кнопке снова открыл бы справку. Работа идёт в списке
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const first = page.locator("[data-queue-card]").first();
        await expect(first).toHaveAttribute("aria-expanded", "false");
        await page.locator("body").press("j");
        await expect(first).toHaveAttribute("aria-expanded", "true");
        await page.locator("body").press("j");
        await expect(page.locator("[data-queue-card]").nth(1)).toHaveAttribute(
          "aria-expanded",
          "true",
        );
        await page.locator("body").press("k");
        await expect(first).toHaveAttribute("aria-expanded", "true");

        // Esc закрывает форму причины, запись остаётся открытой
        await page.getByRole("button", { name: "Вернуть на уточнение" }).click();
        await expect(page.locator("#reason-title")).toBeVisible();
        await page.locator("body").press("Escape");
        await expect(page.locator("#reason-title")).toHaveCount(0);
        await expect(confirmButton(page)).toBeVisible();

        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const id = await first.getAttribute("data-queue-card");
        await page.locator("body").press("Enter");
        await expect(toast(page, "Принято")).toBeVisible();
        await expect(page.locator(`[data-queue-card="${id}"]`)).toHaveCount(0);
        // Следующая запись открылась сама
        await expect(page.locator('[data-queue-card][aria-expanded="true"]')).toHaveCount(1);
      });

      test("фильтр по типу замечания и поиск не сбрасываются после решения", async ({ page }) => {
        await open(page, "/gas/moderation");
        // Фильтр-чип (ADR-066): список вариантов вместо стандартного списка браузера
        await page.getByRole("button", { name: /^Тип замечания:/ }).click();
        await page.getByRole("option", { name: "Подозрение" }).click();
        await expect(card(page, "ГЗ-00096")).toHaveCount(0);
        const rows = page.locator("[data-queue-card]");
        await expect(rows).toHaveCount(5);
        await rows.first().click();
        await confirmButton(page).click();
        await expect(toast(page, "Принято")).toBeVisible();
        await expect(rows).toHaveCount(4);
        await expect(page.getByRole("button", { name: "Тип замечания: Подозрение" })).toBeVisible();
      });
    }
  });
}
