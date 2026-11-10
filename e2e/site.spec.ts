import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Публичный сайт v2, вход в демо и личный контур заказчика (ADR-047, ADR-067).
 *
 * Сервер сквозных тестов запущен с тестовым ключом личной ссылки `e2e-client-key`
 * (playwright.config.ts). Название заказчика читается из серверного модуля, в тесте его нет.
 * SEO с SEO_INDEX=on проверяет e2e/site-seo.spec.ts на втором сервере той же сборки.
 */

const CLIENT_KEY = "e2e-client-key";
const clientShort = (() => {
  const source = readFileSync("src/server/customer-data.ts", "utf8");
  return source.match(/clientShort: "([^"]+)"/)![1]!;
})();

const H1 = "Табель, снабжение и документы ПТО из данных с объекта";
const TASKS = [
  {
    path: "/uchet-vremeni-brigad",
    title: "Учёт времени бригад",
    h1: "Учёт времени бригад и выработки по смете",
    status: "Пилот у первого заказчика",
    task: "time",
    source: "task-time",
  },
  {
    path: "/snabzhenie",
    title: "Снабжение объекта",
    h1: "Снабжение объекта: от заявки до приёмки",
    status: "В демо. Запускаем пилотом на вашем процессе",
    task: "supply",
    source: "task-supply",
  },
  {
    path: "/ispolnitelnaya-dokumentatsiya",
    title: "Исполнительная документация",
    h1: "Исполнительная документация из подтверждённых данных объекта",
    status: "В демо. Пилот на ваших шаблонах",
    task: "docs",
    source: "task-docs",
  },
] as const;
const SITE = [
  "/",
  ...TASKS.map((t) => t.path),
  "/demo",
  "/case/gas",
  "/razbor",
  "/kit",
  "/privacy",
];

/** Прокрутить страницу до конца: блоки появляются при прокрутке (раздел 8) */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    window.scrollTo(0, 0);
  });
}

test.describe("сайт и вход в демо 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("корень это сайт: заголовок, две кнопки, первый экран в 390 x 664", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    // ADR-067: запасной заголовок раздела 5.2, основной на 390 занимал 4 строки
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText(H1);
    const lines = await h1.evaluate((el) =>
      Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
    );
    expect(lines).toBeLessThanOrEqual(3);
    const main = page.getByRole("main");
    const primary = main.getByRole("link", { name: "Показать на моём процессе" }).first();
    await expect(primary).toHaveAttribute("href", "/razbor");
    const demo = main.getByRole("link", { name: "Посмотреть демо" }).first();
    await expect(demo).toHaveAttribute("href", "/demo");
    // Сайт, а не приложение: ни нижней панели, ни выбора роли
    await expect(page.getByRole("navigation", { name: /Разделы$|Нижняя/ })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Первый экран целиком в 390 x 664: кнопки и строка под ними видны без прокрутки
    for (const target of [primary, demo, page.getByText("Демо без регистрации, с телефона.")]) {
      const box = await target.boundingBox();
      expect(box && box.y + box.height).toBeLessThanOrEqual(664);
    }
  });

  test("первый HTML сайта приходит с сервера: текст и мета до скриптов", async ({ request }) => {
    for (const path of SITE) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const html = await response.text();
      expect(html, path).toMatch(/<h1[\s>]/);
      expect(html, path).toContain('rel="canonical"');
      // Без SEO_INDEX=on всё закрыто, как раньше (ADR-067, раздел 9)
      expect(html, path).toContain('name="robots" content="noindex, nofollow"');
      expect(html, path).not.toContain('id="boot-splash"');
    }
  });

  test("главная: три задачи ведут на свои страницы, у каждой статус", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    const cards = page.locator(".site-task-card");
    await expect(cards).toHaveCount(3);
    for (const [index, task] of TASKS.entries()) {
      const card = cards.nth(index);
      await expect(card.getByRole("link", { name: task.title })).toHaveAttribute("href", task.path);
      await expect(card.locator("[data-readiness]")).toBeVisible();
    }
    // Вся карточка нажимается: касание в середину карточки ведёт на страницу задачи
    await cards.nth(1).click();
    await expect(page).toHaveURL(/\/snabzhenie$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(TASKS[1].h1);
  });

  test("меню телефона: открывается, фокус внутри, Escape закрывает и возвращает фокус", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    const toggle = page.getByRole("button", { name: "Меню" });
    await toggle.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    for (const task of TASKS)
      await expect(sheet.getByRole("link", { name: task.title })).toBeVisible();
    // Фон не прокручивается, фокус внутри шторки
    await expect
      .poll(() =>
        page.evaluate(() => getComputedStyle(document.documentElement).overflow === "hidden"),
      )
      .toBe(true);
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(toggle).toBeFocused();
    // «Назад» закрывает шторку и оставляет страницу
    await toggle.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    // Пункт меню ведёт на страницу задачи
    await toggle.click();
    await page.getByRole("dialog").getByRole("link", { name: TASKS[2].title }).click();
    await expect(page).toHaveURL(/\/ispolnitelnaya-dokumentatsiya$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("от сайта до первого шага показа два касания", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    let taps = 0;
    await page
      .getByRole("main")
      .getByRole("link", { name: /Посмотреть демо/ })
      .first()
      .click();
    taps += 1;
    await expect(page).toHaveURL(/\/demo$/);
    // /demo: три плитки задач и голос с объекта
    for (const task of TASKS)
      await expect(page.getByRole("heading", { name: task.title, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Голос с объекта" })).toBeVisible();
    await expect(page.getByText("1 минута")).toHaveCount(3);
    await page.getByRole("link", { name: /Начать показ/ }).click();
    taps += 1;
    // Показ за 3 минуты (ADR-061, 13) начинается туром менеджера
    await expect(page).toHaveURL(/\/gas\/moderation$/);
    await expect(page.getByTestId("tour-step")).toHaveText("Шаг 1 из 9");
    expect(taps).toBeLessThanOrEqual(2);
    await expect(page.locator("body")).not.toContainText(clientShort);
  });

  test("сценарий ГАЙКИ с /demo открывает свой первый экран", async ({ page }) => {
    await page.goto("/demo", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /Смена → учёт/ }).click();
    await expect(page).toHaveURL(/\/capture/);
  });

  test("касание сценария до загрузки скриптов: ссылка открывает его со страницы /demo", async ({
    page,
  }) => {
    // Так выглядит касание до гидратации: обычный переход по href плитки
    await page.goto("/demo", { waitUntil: "domcontentloaded" });
    const href = await page.getByRole("link", { name: /Смена → учёт/ }).getAttribute("href");
    expect(href).toBe("/demo?scenario=canon-shift");
    await page.goto(href!, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/capture/);
  });

  test("экран ГАЙКИ без роли: выбор роли со ссылкой «К демо»", async ({ page }) => {
    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Выберите роль" })).toBeVisible();
    await page.getByRole("link", { name: /К демо/ }).click();
    await expect(page).toHaveURL(/\/demo$/);
  });

  test("/gas по старой ссылке открывает старт показа на публичном наборе", async ({ page }) => {
    await page.goto("/gas", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Показать за 3 минуты" })).toBeVisible();
    await expect(page.locator("body")).toContainText("Демо-подрядчик");
    await expect(page.locator("body")).not.toContainText(clientShort);
  });
});

test.describe("главная 390 (ADR-067)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("секции раздела 5, статусы, цена из config, ни одного запрещённого обещания", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "load" });
    await scrollThrough(page);
    for (const title of [
      "Три задачи, которые ГАЙКА снимает с офиса",
      "Один путь для всех трёх задач",
      "Меньше переписывания, больше проверки",
      "ГАЙКА готовит. Решает человек.",
      "Первый заказчик: газовый подрядчик, Краснодарский край",
      "Начните с одного процесса",
      "Вопросы",
      "Покажите процесс, который хотите упростить",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: title, exact: true })).toHaveCount(
        1,
      );
    }
    // Один H1, у каждой секции H2 (раздел 9.6)
    await expect(page.locator("h1")).toHaveCount(1);
    // Убранные блоки v1
    for (const gone of ["Для кого", "Честно о границах", "Цена", "Как внедряем"])
      await expect(page.getByRole("heading", { name: gone, exact: true })).toHaveCount(0);
    const main = page.locator("main");
    await expect(main.getByText("Пилот у первого заказчика").first()).toBeVisible();
    await expect(main.getByText("В демо, пилот на вашем процессе")).toBeVisible();
    await expect(main.getByText("В демо, пилот на ваших шаблонах")).toBeVisible();
    await expect(main.getByText(/^Пилот от 30\s000\s₽$/)).toBeVisible();
    // Путь из четырёх шагов столбиком
    await expect(page.locator(".site-steps-mobile > li")).toHaveCount(4);
    // Живой фрагмент первого экрана: текст, а не картинка; подпись про вымышленные данные
    const hero = page.getByLabel("Пример из демо: неделя бригад");
    await expect(hero).toContainText("Начислено");
    await expect(hero).toContainText("Подтверждено");
    await expect(hero).toContainText("Пример из демо, данные вымышленные");
    const text = await main.innerText();
    // Цифр эффекта, отзывов, скидок, таймеров и выдуманных обещаний нет вовсе
    expect(text).not.toMatch(
      /₽\s*\/\s*мес|окупаем|экономи[ия]\s+\d|отзыв|скидк|осталось\s+\d|1С|ЭЦП|юридически значим|реестр отечественного|хранение в РФ|точность распознавания/i,
    );
    expect(text).not.toMatch(/эффективно|удобно|легко|инновацион|уникальн|революцион|лучший/i);
  });

  test("липкая «Показать на моём процессе»: нет на первом экране, есть дальше, прячется у формы", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    const sticky = page.locator(".site-sticky");
    await expect(sticky).toHaveAttribute("data-hidden", "");
    await page
      .getByRole("heading", { name: "Один путь для всех трёх задач" })
      .scrollIntoViewIfNeeded();
    await expect(sticky).not.toHaveAttribute("data-hidden", "");
    await expect(sticky.getByRole("link")).toHaveAttribute("href", "/razbor");
    await page.getByRole("button", { name: "Отправить заявку" }).scrollIntoViewIfNeeded();
    await expect(sticky).toHaveAttribute("data-hidden", "");
  });

  test("якорь формы не уходит под липкую шапку", async ({ page }) => {
    await page.goto("/#lead", { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    await page.evaluate(() => document.getElementById("lead")?.scrollIntoView());
    const header = (await page.locator("header.site-header").boundingBox())!;
    const title = (await page.locator("#lead-title").boundingBox())!;
    expect(title.y).toBeGreaterThanOrEqual(header.y + header.height);
  });
});

test.describe("анимация (ADR-067, раздел 8)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("первый экран собирается один раз: на проверке, затем подтверждено", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const hero = page.getByLabel("Пример из демо: неделя бригад");
    // С сервера приходит состояние до подтверждения
    const html = await (await page.request.get("/")).text();
    expect(html).toContain("На проверке");
    await expect(hero).toContainText("Подтверждено", { timeout: 5000 });
    await expect(hero).not.toContainText("На проверке");
  });

  test("reduced-motion: фрагмент сразу в конечном состоянии, блоки не прячутся", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    await expect(page.getByLabel("Пример из демо: неделя бригад")).toContainText("Подтверждено", {
      timeout: 1000,
    });
    // Блоки ниже экрана ждут прокрутки, но без сдвига: только прозрачность
    const pending = page.locator("[data-reveal][data-pending]").first();
    if (await pending.count()) {
      expect(await pending.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
    }
    // Шаги пути: переключение без автопрокрутки, кнопки есть только на компьютере
    await scrollThrough(page);
    await expect(page.locator("[data-reveal][data-pending]")).toHaveCount(0);
  });
});

test.describe("путь из четырёх шагов на компьютере", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("кнопки и стрелки переключают шаг и снимок, автопрокрутки нет", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    const tabs = page.locator("#how").getByRole("tab");
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(1500);
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await tabs.nth(2).click();
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
    const visuals = page.locator("#how .site-step-visual");
    await expect(visuals.nth(2)).toHaveAttribute("data-active", "");
    await page.keyboard.press("ArrowDown");
    await expect(tabs.nth(3)).toBeFocused();
    await expect(visuals.nth(3)).toHaveAttribute("data-active", "");
    await expect(visuals.nth(0)).not.toHaveAttribute("data-active", "");
  });
});

test.describe("страницы задач (ADR-067, раздел 6)", () => {
  for (const width of [390, 1440]) {
    test(`${width}: H1, статус, снимок загружен, крошки, ссылки на другие задачи`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      for (const task of TASKS) {
        const response = await page.goto(task.path, { waitUntil: "load" });
        expect(response?.status(), task.path).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(task.h1);
        await expect(page.locator("main [data-readiness]").first()).toHaveText(task.status);
        const crumbs = page.getByRole("navigation", { name: "Хлебные крошки" });
        await expect(crumbs).toContainText("Главная");
        await expect(crumbs).toContainText(task.title);
        // Снимок первого экрана: картинка загрузилась или живой фрагмент на месте
        const hero = page.locator(".site-task-hero-shot");
        // На телефоне снимок компьютера заменён телефонным снимком или фрагментом: смотрим видимое
        const img = hero.locator("img:visible");
        if (await img.count()) {
          await expect
            .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
            .toBe(true);
          expect(await img.getAttribute("alt")).toMatch(/ГАЙК|снабжения/);
        } else {
          await expect(hero.locator("[data-fragment]:visible")).toHaveCount(1);
        }
        for (const title of [
          "Кто работает",
          "Как это устроено",
          "Что вы получаете",
          "Чего ГАЙКА не делает",
          "Вопросы",
        ])
          await expect(
            page.getByRole("heading", { level: 2, name: title, exact: true }),
          ).toHaveCount(1);
        // Перелинковка: две другие задачи и кейс
        const others = page.locator("section[aria-labelledby='others-title']");
        for (const other of TASKS.filter((t) => t.path !== task.path))
          await expect(
            others.getByRole("link", { name: new RegExp(`^${other.title}`) }),
          ).toHaveAttribute("href", other.path);
        await expect(others.locator('a[href="/case/gas"]')).toHaveCount(1);
      }
    });
  }
});

test.describe("заявки со страниц 390 (ADR-051, ADR-067)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  // Сервер тестов без приёма заявок отвечает 501: браузер пишет это в консоль сам
  test.use({ expectedConsole: /^Failed to load resource: .*status of 501\b/ });

  test("заявка без приёма на сайте честно ведёт в Telegram, «отправлено» не пишет", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    const submit = page.getByRole("button", { name: "Отправить заявку" });
    await submit.click();
    await expect(page.getByRole("alert")).toHaveText("Напишите имя");
    await page.getByLabel("Имя").fill("Иван");
    await page.getByLabel("Телефон").fill("89181234567");
    await expect(page.getByLabel("Телефон")).toHaveValue("+7 (918) 123-45-67");
    await page.getByRole("button", { name: "4-10" }).click();
    await page.getByRole("checkbox").check();
    await submit.click();
    const status = page.getByRole("status");
    await expect(status).toContainText("Заявки с сайта пока не подключены");
    const link = status.getByRole("link", { name: "Открыть Telegram" });
    await expect(link).toHaveAttribute("href", /^https:\/\/t\.me\/[^?]+\?text=/);
    expect(decodeURIComponent((await link.getAttribute("href"))!)).toContain("Источник: landing");
    await expect(page.locator("body")).not.toContainText(/Заявка отправлена|Спасибо, мы свяжемся/);
  });

  test("заявка со страницы задачи уходит с выбранной задачей и источником", async ({ page }) => {
    for (const task of TASKS) {
      await page.goto(task.path, { waitUntil: "load" });
      await page.waitForSelector("html[data-booted]");
      const form = page.locator("#lead");
      // Задача страницы выбрана заранее
      await expect(form.locator('button[aria-pressed="true"]')).toHaveCount(1);
      await form.getByLabel("Имя").fill("Иван");
      await form.getByLabel("Телефон").fill("9181234567");
      await form.getByRole("button", { name: "1-3" }).click();
      await form.getByRole("checkbox").check();
      const response = page.waitForResponse("**/api/leads");
      await form.getByRole("button", { name: "Отправить заявку" }).click();
      const answer = await response;
      expect(answer.status()).toBe(501);
      expect(JSON.parse(answer.request().postData()!)).toMatchObject({
        source: task.source,
        task: task.task,
        page: task.path,
      });
      await expect(page.getByRole("status")).toContainText("Заявки с сайта пока не подключены");
    }
  });
});

test.describe("состояния формы заявки 390 (ADR-067, раздел 11)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test.use({ expectedConsole: /^Failed to load resource: .*status of 500\b/ });

  test("«Отправляю» пока ждём сервер, ошибка сохраняет введённое", async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/leads", async (route) => {
      await gate;
      await route.fulfill({ status: 500, body: "" });
    });
    await page.goto("/snabzhenie", { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    const form = page.locator("#lead");
    await form.getByLabel("Имя").fill("Иван");
    await form.getByLabel("Компания").fill("ООО Пример");
    await form.getByLabel("Телефон").fill("9181234567");
    await form.getByRole("button", { name: "4-10" }).click();
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Отправить заявку" }).click();
    // Отправляю: кнопка занята, «отправлено» не пишется до ответа сервера
    await expect(form.getByRole("button", { name: "Отправляю" })).toBeDisabled();
    await expect(form.locator("form")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("body")).not.toContainText("Заявка отправлена");
    release();
    await expect(form.getByText("Не отправилось")).toBeVisible();
    // Введённое на месте, задача страницы выбрана
    await expect(form.getByLabel("Имя")).toHaveValue("Иван");
    await expect(form.getByLabel("Компания")).toHaveValue("ООО Пример");
    await expect(form.getByLabel("Телефон")).toHaveValue("+7 (918) 123-45-67");
    await expect(form.getByRole("button", { name: "снабжение" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(form.getByRole("button", { name: "Отправить ещё раз" })).toBeEnabled();
  });
});

test.describe("404, robots и sitemap без SEO_INDEX", () => {
  test.use({ expectedConsole: /^Failed to load resource: .*status of 404\b/ });

  test("неизвестный адрес сайта: 404 и ссылки на задачи и главную", async ({ page }) => {
    const response = await page.goto("/takoy-stranicy-net", { waitUntil: "load" });
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Такой страницы нет");
    for (const task of TASKS)
      await expect(
        page.getByRole("main").getByRole("link", { name: new RegExp(task.title) }),
      ).toHaveAttribute("href", task.path);
    await expect(page.getByRole("link", { name: "На главную", exact: true })).toHaveAttribute(
      "href",
      "/",
    );
  });

  test("robots.txt закрывает всё, sitemap.xml нет, x-robots-tag на страницах сайта", async ({
    request,
  }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(robots.headers()["content-type"]).toContain("text/plain");
    expect(await robots.text()).toMatch(/User-agent: \*\nDisallow: \/\n/);
    expect((await request.get("/sitemap.xml")).status()).toBe(404);
    for (const path of ["/", TASKS[0].path, "/gas"]) {
      const response = await request.get(path);
      expect(response.headers()["x-robots-tag"], path).toContain("noindex");
    }
  });
});

test.describe("JSON-LD (ADR-067, раздел 9.5)", () => {
  test("валидный JSON, вопросы FAQPage совпадают с видимыми, крошки на страницах задач", async ({
    page,
  }) => {
    for (const path of ["/", ...TASKS.map((t) => t.path)]) {
      await page.goto(path, { waitUntil: "load" });
      const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
      expect(raw.length, path).toBe(1);
      const data = JSON.parse(raw[0]!) as {
        "@graph": { "@type": string; [key: string]: unknown }[];
      };
      const types = data["@graph"].map((item) => item["@type"]);
      expect(types, path).toEqual(
        expect.arrayContaining(["Organization", "SoftwareApplication", "FAQPage"]),
      );
      const app = data["@graph"].find((item) => item["@type"] === "SoftwareApplication")!;
      expect(app["applicationCategory"]).toBe("BusinessApplication");
      expect(app).not.toHaveProperty("aggregateRating");
      expect(app).not.toHaveProperty("offers");
      const faq = data["@graph"].find((item) => item["@type"] === "FAQPage") as unknown as {
        mainEntity: { name: string; acceptedAnswer: { text: string } }[];
      };
      const visible = await page.locator("[data-faq] details").evaluateAll((els) =>
        els.map((el) => ({
          q: el.querySelector("[data-faq-q]")!.textContent!.trim(),
          a: el.querySelector("[data-faq-a]")!.textContent!.trim(),
        })),
      );
      expect(
        faq.mainEntity.map((item) => ({ q: item.name, a: item.acceptedAnswer.text })),
        path,
      ).toEqual(visible);
      if (path !== "/") expect(types, path).toContain("BreadcrumbList");
    }
  });
});

test.describe("адаптив (ADR-067, раздел 10)", () => {
  test("нет горизонтального переполнения на всех ширинах проверки", async ({ page }) => {
    for (const width of [360, 375, 390, 414, 430, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", ...TASKS.map((t) => t.path), "/demo", "/case/gas", "/razbor"]) {
        await page.goto(path, { waitUntil: "load" });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} ${width}`).toBe(0);
      }
    }
  });
});

test.describe("личный контур заказчика", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("без куки ни HTML, ни ответы сервера не несут название заказчика", async ({ page }) => {
    const bodies: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes("/_serverFn")) bodies.push(await response.text());
    });
    const html = await (await page.request.get("/gas")).text();
    expect(html).not.toContain(clientShort);
    await page.goto("/gas/tabel", { waitUntil: "domcontentloaded" });
    // «Отчёт» стал экраном «Табель» (ADR-061, 11)
    await expect(page.getByRole("heading", { name: "Табель" }).first()).toBeVisible();
    await expect(page.getByText("Сверка с вашим файлом")).toHaveCount(0);
    expect(bodies.join("\n")).not.toContain(clientShort);
    // Вопросы к согласованию только в личном контуре
    await page.goto("/gas/questions", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/gas$/);
  });

  test("личная ссылка ставит куку, убирает ключ и показывает контур заказчика", async ({
    page,
  }) => {
    await page.goto(`/gas/tabel?c=${CLIENT_KEY}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/gas\/tabel$/);
    await expect(page.getByText("Сверка с вашим файлом")).toBeVisible();
    // Компания заказчика в верхней строке оболочки, рядом со знаком (ADR-061, 3.1)
    await expect(page.locator("header.gas-topbar")).toContainText(clientShort);
    const cookies = await page.context().cookies();
    const cookie = cookies.find((c) => c.name === "gaika_client");
    expect(cookie?.httpOnly).toBe(true);
    // Данные личной ссылки во вкладке: заказчик видит это рядом с ними (ADR-062, решение 3)
    await expect(page.getByTestId("test-mode-bar")).toHaveText(
      "Тестовый режим: данные хранятся в этом браузере",
    );
  });

  test("неверный ключ не открывает контур и не оставляет ключ в адресе", async ({ page }) => {
    await page.goto("/gas?c=wrong-key", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/gas$/);
    await expect(page.locator("body")).not.toContainText(clientShort);
    expect((await page.context().cookies()).some((c) => c.name === "gaika_client")).toBe(false);
    await expect(page.getByTestId("test-mode-bar")).toHaveCount(0);
  });
});
