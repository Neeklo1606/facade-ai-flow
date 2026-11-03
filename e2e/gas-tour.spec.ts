import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Тур и показ (ADR-061, 13; раздел 4.8): «Показать за 3 минуты» сбрасывает демо-данные
 * вкладки и ведёт туром менеджера → бригадира → руководителя к итогу без обязательных
 * действий. Туры ролей открываются при первом входе и из «?». Повторный показ в новой
 * вкладке начинается с первого шага.
 */

const card = (page: Page) => page.getByTestId("tour-card");
const step = (page: Page) => page.getByTestId("tour-step");
const next = (page: Page) => card(page).getByRole("button", { name: "Далее" });

/** Путь показа: экран и элемент каждого шага */
const SHOW = [
  { path: /\/gas\/moderation$/, title: "Проверка" },
  { path: /\/gas\/moderation$/, title: "Принять без замечаний" },
  { path: /\/gas\/moderation$/, title: "Решение по записи" },
  { path: /\/gas\/foreman$/, title: "Бригадир в MAX" },
  { path: /\/gas\/brigade$/, title: "Добавить время" },
  { path: /\/gas\/tabel$/, title: "Табель" },
  { path: /\/gas\/tabel$/, title: "Выгрузка" },
  { path: /\/gas\/week$/, title: "Закрыть неделю" },
  { path: /\/gas\/finish$/, title: "Итог" },
] as const;

const WIDTHS = [
  { name: "1440", viewport: { width: 1440, height: 900 }, hasTouch: false },
  { name: "390", viewport: { width: 390, height: 844 }, hasTouch: true },
] as const;

test.describe.configure({ timeout: 120_000 });

for (const width of WIDTHS) {
  test.describe(`показ за 3 минуты ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test("девять шагов по трём ролям без действий зрителя, «Назад» и итог", async ({ page }) => {
      await open(page, "/gas");
      await page.getByRole("button", { name: "Показать за 3 минуты" }).click();
      for (const [index, item] of SHOW.entries()) {
        await expect(page).toHaveURL(item.path);
        await expect(step(page)).toHaveText(`Шаг ${index + 1} из ${SHOW.length}`);
        await expect(card(page).getByRole("heading")).toHaveText(item.title);
        if (index === 1) {
          // «Назад» возвращает на шаг, «Далее» снова ведёт вперёд
          await card(page).getByRole("button", { name: "Назад" }).click();
          await expect(step(page)).toHaveText(`Шаг 1 из ${SHOW.length}`);
          await next(page).click();
          await expect(step(page)).toHaveText(`Шаг 2 из ${SHOW.length}`);
        }
        if (index < SHOW.length - 1) await next(page).click();
      }
      // Роль в профиле сменил сам тур: итог смотрит руководитель
      await expect(
        page.getByRole("button", { name: /^Вы: Руководитель/ }).filter({ visible: true }),
      ).toHaveCount(1);
      await expect(page.locator("main")).toContainText(
        "Неделя прошла от бригадира до файла заказчика.",
      );
      await card(page).getByRole("button", { name: "Готово" }).click();
      await expect(card(page)).toHaveCount(0);
      // Туры ролей после показа сами не открываются
      await page.goto("/gas/week");
      await page.locator("main").waitFor();
      await expect(card(page)).toHaveCount(0);
    });
  });
}

test.describe("показ 1440: сброс и новая вкладка", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("показ сбрасывает демо-данные вкладки и повторно работает в новой вкладке", async ({
    page,
    context,
  }) => {
    await open(page, "/gas/moderation");
    const summary = page.getByTestId("queue-summary");
    const before = await summary.innerText();
    await page.getByRole("button", { name: /^Принять \d+ без замечаний/ }).click();
    await expect(summary).not.toHaveText(before);

    await open(page, "/gas");
    await page.getByRole("button", { name: "Показать за 3 минуты" }).click();
    await expect(page).toHaveURL(/\/gas\/moderation$/);
    await expect(step(page)).toHaveText("Шаг 1 из 9");
    await expect(summary).toHaveText(before);
    // × закрывает показ
    await card(page).getByRole("button", { name: "Закрыть тур" }).click();
    await expect(card(page)).toHaveCount(0);

    const second = await context.newPage();
    await open(second, "/gas");
    await second.getByRole("button", { name: "Показать за 3 минуты" }).click();
    await expect(second).toHaveURL(/\/gas\/moderation$/);
    await expect(step(second)).toHaveText("Шаг 1 из 9");
    await next(second).click();
    await expect(step(second)).toHaveText("Шаг 2 из 9");
    await second.keyboard.press("Escape");
    await expect(card(second)).toHaveCount(0);
  });
});

/*
 * F1: тур не перехватывает навигацию. Автостарт только на домашнем экране роли, переход на
 * экран шага только по нажатию человека, уход со страницы шага ставит тур на паузу
 */
for (const width of WIDTHS) {
  test.describe(`тур не уводит со страницы ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.hasTouch });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        if (!sessionStorage.getItem("tour-test-started")) {
          sessionStorage.setItem("tour-test-started", "1");
          localStorage.setItem("gaika-tour-seen", "[]");
        }
      });
    });

    test("прямая ссылка на Журнал при первом входе открывает Журнал", async ({ page }) => {
      await open(page, "/gas/entries");
      await page.locator("main").waitFor();
      await expect(
        page.getByRole("heading", { name: "Журнал", exact: true }).first(),
      ).toBeAttached();
      // Даём туру время, за которое прежний перехват успевал увести на «Проверку»
      await page.waitForTimeout(1500);
      await expect(page).toHaveURL(/\/gas\/entries$/);
      await expect(card(page)).toHaveCount(0);
      await expect(page.getByTestId("tour-paused")).toHaveCount(0);
    });

    test("клик в меню во время тура срабатывает, тур на паузе и продолжается", async ({ page }) => {
      await open(page, "/gas/moderation");
      await expect(card(page)).toHaveAccessibleName("Тур менеджера");
      await expect(step(page)).toHaveText("Шаг 1 из 4");
      // Пункт меню: на компьютере левая панель, на телефоне нижняя
      await page
        .getByRole("link", { name: /^Журнал/ })
        .filter({ visible: true })
        .first()
        .click();
      await expect(page).toHaveURL(/\/gas\/entries$/);
      await page.waitForTimeout(1500);
      await expect(page).toHaveURL(/\/gas\/entries$/);
      await expect(card(page)).toHaveCount(0);
      const paused = page.getByTestId("tour-paused");
      await expect(paused).toBeVisible();
      // «Продолжить тур» — нажатие человека: тур возвращает на экран шага
      await paused.getByRole("button", { name: "Продолжить тур" }).click();
      await expect(page).toHaveURL(/\/gas\/moderation$/);
      await expect(step(page)).toHaveText("Шаг 1 из 4");
      await expect(paused).toHaveCount(0);
      // Снова ушли и закрыли тур крестиком на плашке: тур больше не появляется
      await page
        .getByRole("link", { name: /^Журнал/ })
        .filter({ visible: true })
        .first()
        .click();
      await expect(paused).toBeVisible();
      await paused.getByRole("button", { name: "Закрыть тур" }).click();
      await expect(paused).toHaveCount(0);
      await page
        .getByRole("link", { name: /^Проверка/ })
        .filter({ visible: true })
        .first()
        .click();
      await expect(page).toHaveURL(/\/gas\/moderation$/);
      await page.locator("main").waitFor();
      await expect(card(page)).toHaveCount(0);
    });
  });
}

test.describe("тур роли 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("тур менеджера при первом входе один раз, потом из «?»", async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("tour-test-started")) {
        sessionStorage.setItem("tour-test-started", "1");
        localStorage.setItem("gaika-tour-seen", "[]");
      }
    });
    await open(page, "/gas/moderation");
    await expect(card(page)).toHaveAccessibleName("Тур менеджера");
    await expect(step(page)).toHaveText("Шаг 1 из 4");
    // Окно затемнения стоит вокруг очереди
    const queue = await page.locator('[data-tour="review-queue"]').boundingBox();
    expect(queue).not.toBeNull();
    await card(page).getByRole("button", { name: "Закрыть тур" }).click();
    await page.reload();
    await page.locator("main").waitFor();
    await expect(card(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Справка", exact: true }).click();
    await page.getByRole("button", { name: "Пройти тур: менеджера" }).click();
    await expect(step(page)).toHaveText("Шаг 1 из 4");
    for (let i = 0; i < 3; i++) await next(page).click();
    await expect(page).toHaveURL(/\/gas\/entries$/);
    await expect(card(page).getByRole("heading")).toHaveText("Журнал");
  });

  test("тур руководителя ведёт по «Неделе» и «Табелю»", async ({ page }) => {
    await open(page, "/gas/week");
    await gasRole(page, "Руководитель");
    await page.getByRole("button", { name: "Справка", exact: true }).click();
    await page.getByRole("button", { name: "Пройти тур: руководителя" }).click();
    await expect(page).toHaveURL(/\/gas\/week$/);
    await expect(card(page).getByRole("heading")).toHaveText("Неделя");
    await next(page).click();
    await next(page).click();
    await expect(page).toHaveURL(/\/gas\/tabel$/);
    await expect(card(page).getByRole("heading")).toHaveText("Табель");
  });
});

test.describe("тур бригадира 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("на телефоне подсказка внизу экрана, шаги по «Сегодня»", async ({ page }) => {
    await open(page, "/gas/brigade");
    await gasRole(page, "Бригадир");
    await page.getByRole("button", { name: /^Вы: / }).filter({ visible: true }).first().click();
    await page.getByRole("button", { name: "Пройти тур: бригадира" }).click();
    await expect(card(page)).toHaveAccessibleName("Тур бригадира");
    await expect(step(page)).toHaveText("Шаг 1 из 3");
    const box = await card(page).boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(844 - 120);
    await next(page).click();
    await expect(card(page).getByRole("heading")).toHaveText("Добавить время");
    await expect(page.locator('[data-tour="today-add"]')).toBeInViewport();
  });
});

/*
 * Действия зрителя не обязательны, но если он отправил запись в боте и выгрузил файл,
 * итог показа показывает его запись и файл (V4, refs/01 и refs/10)
 */
test.describe("показ с записью зрителя 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("запись из бота и файл попадают в итог показа", async ({ page }) => {
    await open(page, "/gas");
    await page.getByRole("button", { name: "Показать за 3 минуты" }).click();
    for (let i = 0; i < 3; i++) await next(page).click();
    await expect(page).toHaveURL(/\/gas\/foreman$/);
    // Бот занимает экран: подсказка встаёт сверху и не закрывает кнопки ответа
    const bot = page.locator('[data-tour="bot"]');
    const answer = (name: string | RegExp) =>
      bot
        .locator("[data-stage]")
        .getByRole("button", typeof name === "string" ? { name, exact: true } : { name })
        .click();
    await answer("Внести время");
    await answer(/ул\. Демо, 200/);
    await answer(/^Сегодня, 03\.10/);
    await answer(/^12:00/);
    await answer(/^14:30/);
    await answer(/^0 мин/);
    await answer("Отправить");
    const sent = bot.getByText(/Отправлено\. Запись ГЗ-\d{5} ждёт проверки/);
    await expect(sent).toBeVisible();
    const number = (await sent.innerText()).match(/ГЗ-\d{5}/)![0];

    for (let i = 0; i < 3; i++) await next(page).click();
    await expect(card(page).getByRole("heading")).toHaveText("Выгрузка");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator('[data-tour="export"]:visible').click(),
    ]);
    const file = download.suggestedFilename();
    await next(page).click();
    await next(page).click();
    await expect(page).toHaveURL(/\/gas\/finish$/);
    const main = page.locator("main");
    await expect(main).toContainText(number);
    await expect(main).toContainText(file);
  });
});
