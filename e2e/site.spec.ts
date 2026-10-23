import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Публичный сайт, вход в демо и личный контур заказчика (ADR-047, шаг L1).
 *
 * Сервер сквозных тестов запущен с тестовым ключом личной ссылки `e2e-client-key`
 * (playwright.config.ts). Название заказчика читается из серверного модуля, в тесте его нет.
 */

const CLIENT_KEY = "e2e-client-key";
const clientShort = (() => {
  const source = readFileSync("src/server/customer-data.ts", "utf8");
  return source.match(/clientShort: "([^"]+)"/)![1]!;
})();

const dock = (page: Page) =>
  page.locator("[data-gas-show-dock], [data-gas-show-inline]").filter({ visible: true }).first();

test.describe("сайт и вход в демо 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("корень это сайт: заголовок, две кнопки, без оболочки приложения", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Выработка бригад без ручного Excel",
    );
    await expect(page.getByRole("link", { name: "Разобрать мои данные" })).toBeVisible();
    // Сайт, а не приложение: ни нижней панели, ни меню, ни выбора роли
    await expect(page.getByRole("navigation", { name: /Разделы|Нижняя/ })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Первый экран целиком в 390 x 664: строка под кнопками видна без прокрутки
    const note = page.getByText("Без регистрации. С телефона. 3 минуты.");
    const box = await note.boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(664);
  });

  test("первый HTML сайта приходит с сервера: текст и мета до скриптов", async ({ request }) => {
    for (const path of ["/", "/demo", "/case/gas", "/razbor", "/kit", "/privacy"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const html = await response.text();
      expect(html, path).toMatch(/<h1[\s>]/);
      expect(html, path).toContain('rel="canonical"');
      expect(html, path).toContain('name="robots" content="noindex, nofollow"');
      expect(html, path).not.toContain('id="boot-splash"');
    }
  });

  test("от сайта до первого шага показа два касания", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    let taps = 0;
    await page
      .getByRole("main")
      .getByRole("link", { name: /Открыть демо/ })
      .first()
      .click();
    taps += 1;
    await expect(page).toHaveURL(/\/demo$/);
    // /demo: оба блока
    await expect(page.getByRole("heading", { name: "Учёт выработки бригад" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Голос с объекта" })).toBeVisible();
    await expect(page.getByText("1 минута")).toHaveCount(3);
    await page.getByRole("link", { name: /Начать показ/ }).click();
    taps += 1;
    await expect(page).toHaveURL(/\/gas\/foreman/);
    await expect(dock(page)).toContainText("1/6");
    expect(taps).toBeLessThanOrEqual(2);
    await expect(page.locator("body")).not.toContainText(clientShort);
  });

  test("сценарий ГАЙКИ с /demo открывает свой первый экран", async ({ page }) => {
    await page.goto("/demo", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Смена → учёт/ }).click();
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
    await expect(page.getByRole("button", { name: /Начать показ/ })).toBeVisible();
    await expect(page.locator("body")).toContainText("Демо-подрядчик");
    await expect(page.locator("body")).not.toContainText(clientShort);
  });
});

test.describe("лендинг 390 (ADR-050)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("двенадцать секций, одна тёмная, ни одного запрещённого обещания", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    for (const title of [
      "Знакомо?",
      "Как это работает",
      "Бригадиру ничего не нужно устанавливать",
      "Цифрам можно верить",
      "Отчёт как ваш",
      "Кейс",
      "Что ещё умеет ГАЙКА",
      "Как начать",
      "Вопросы",
      "Покажем на ваших данных",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toHaveCount(1);
    }
    await expect(page.locator("section.site-dark")).toHaveCount(1);
    const text = await page.locator("main").innerText();
    // Цен нет, пока не заданы в конфигурации; цифр эффекта и отзывов нет вовсе
    expect(text).not.toMatch(/₽\s*\/\s*мес|окупаем|экономи[ия]\s+\d|отзыв/i);
  });

  test("липкая «Открыть демо»: нет на первом экране, есть дальше, прячется у формы", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    const sticky = page.locator(".site-sticky");
    await expect(sticky).toHaveAttribute("data-hidden", "");
    await page.getByRole("heading", { name: "Цифрам можно верить" }).scrollIntoViewIfNeeded();
    await expect(sticky).not.toHaveAttribute("data-hidden", "");
    await page.getByRole("heading", { name: "Покажем на ваших данных" }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Отправить заявку" }).scrollIntoViewIfNeeded();
    await expect(sticky).toHaveAttribute("data-hidden", "");
  });
});

test.describe("заявка с лендинга 390 (ADR-051)", () => {
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
    await page.goto("/gas/reports", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Отчёт" }).first()).toBeVisible();
    await expect(page.getByText("Сверка с вашим файлом")).toHaveCount(0);
    expect(bodies.join("\n")).not.toContain(clientShort);
    // Вопросы к согласованию только в личном контуре
    await page.goto("/gas/questions", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/gas$/);
  });

  test("личная ссылка ставит куку, убирает ключ и показывает контур заказчика", async ({
    page,
  }) => {
    await page.goto(`/gas/reports?c=${CLIENT_KEY}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/gas\/reports$/);
    await expect(page.getByText("Сверка с вашим файлом")).toBeVisible();
    await expect(page.locator("aside")).toContainText(clientShort);
    const cookies = await page.context().cookies();
    const cookie = cookies.find((c) => c.name === "gaika_client");
    expect(cookie?.httpOnly).toBe(true);
  });

  test("неверный ключ не открывает контур и не оставляет ключ в адресе", async ({ page }) => {
    await page.goto("/gas?c=wrong-key", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/gas$/);
    await expect(page.locator("body")).not.toContainText(clientShort);
    expect((await page.context().cookies()).some((c) => c.name === "gaika_client")).toBe(false);
  });
});
