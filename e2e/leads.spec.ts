import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Page } from "@playwright/test";
import jsQR from "jsqr";
import { expect, test } from "./fixtures";

/**
 * Заявки, набор партнёра и превью ссылок (ADR-051, шаг L6).
 *
 * Основной сервер тестов без переменных заявок: адаптер none, ответ 501. Путь с вебхуком
 * проверяется на втором сервере той же сборки с LEADS_WEBHOOK_URL на приёмник внутри теста.
 */

async function fillLead(page: Page) {
  await page.getByLabel("Имя").fill("Иван");
  await page.getByLabel("Компания").fill("ООО Пример");
  await page.getByLabel("Телефон").fill("9181234567");
  await page.getByRole("button", { name: "4-10" }).click();
  await page.getByRole("checkbox").check();
}

const SENT = /Заявка отправлена/;

test.describe("форма заявки 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test.use({
    expectedConsole:
      /^Failed to load resource: (.*status of (400|429|500|501|502)\b|net::ERR_FAILED$)/,
  });

  test("ни при каком ответе сервера, кроме 204, нет «Заявка отправлена»", async ({ page }) => {
    for (const status of [400, 429, 500, 502, 0]) {
      await page.unroute("**/api/leads");
      await page.route("**/api/leads", (route) =>
        status ? route.fulfill({ status, body: "" }) : route.abort("failed"),
      );
      await page.goto("/razbor", { waitUntil: "load" });
      await page.waitForSelector("html[data-booted]");
      await fillLead(page);
      await page.getByRole("button", { name: "Отправить заявку" }).click();
      await expect(page.getByText("Не отправилось")).toBeVisible();
      await expect(page.getByRole("button", { name: "Отправить ещё раз" })).toBeVisible();
      await expect(page.locator("body")).not.toContainText(SENT);
    }
    // 204: только теперь
    await page.unroute("**/api/leads");
    await page.route("**/api/leads", (route) => route.fulfill({ status: 204 }));
    await page.getByRole("button", { name: "Отправить ещё раз" }).click();
    await expect(page.getByRole("status")).toContainText(SENT);
  });

  test("без приёма заявок (none): сервер 501, форма честно ведёт в Telegram", async ({ page }) => {
    await page.goto("/razbor?from=demo-final&src=vasya", { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    await fillLead(page);
    const response = page.waitForResponse("**/api/leads");
    await page.getByRole("button", { name: "Отправить заявку" }).click();
    const answer = await response;
    expect(answer.status()).toBe(501);
    expect(JSON.parse(answer.request().postData()!)).toMatchObject({
      source: "demo-final",
      src: "vasya",
      page: "/razbor",
    });
    const status = page.getByRole("status");
    await expect(status).toContainText("Заявки с сайта пока не подключены");
    const link = status.getByRole("link", { name: "Открыть Telegram" });
    expect(decodeURIComponent((await link.getAttribute("href"))!)).toContain(
      "Источник: demo-final",
    );
    await expect(page.locator("body")).not.toContainText(SENT);
  });
});

test.describe("приём заявок через вебхук", () => {
  const port = 4671;
  let receiver: Server;
  let app: ChildProcess;
  const received: unknown[] = [];

  test.beforeAll(async () => {
    receiver = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        received.push({ type: request.headers["content-type"], body: JSON.parse(body) });
        response.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, resolve));
    const hook = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;
    app = spawn("node", [".output/server/index.mjs"], {
      env: { ...process.env, PORT: String(port), LEADS_WEBHOOK_URL: hook },
      stdio: "ignore",
    });
    for (let i = 0; i < 100; i += 1) {
      const ok = await fetch(`http://localhost:${port}/privacy`)
        .then((r) => r.ok)
        .catch(() => false);
      if (ok) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("второй сервер не поднялся");
  });

  test.afterAll(async () => {
    app?.kill();
    await new Promise((resolve) => receiver?.close(resolve));
  });

  test("заявка с лендинга: 204, тело вебхука, «Заявка отправлена»", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://localhost:${port}/?src=vasya`, { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    await fillLead(page);
    const response = page.waitForResponse("**/api/leads");
    await page.getByRole("button", { name: "Отправить заявку" }).click();
    expect((await response).status()).toBe(204);
    await expect(page.getByRole("status")).toContainText(SENT);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      type: "application/json",
      body: {
        name: "Иван",
        company: "ООО Пример",
        phone: "+7 (918) 123-45-67",
        crews: "4-10",
        source: "landing",
        src: "vasya",
        page: "/",
      },
    });
    const body = (received[0] as { body: Record<string, unknown> }).body;
    expect(body["at"]).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(body).not.toHaveProperty("website");
  });

  test("ловушка: 204 без отправки; лимит: шестая заявка с IP получает 429", async ({ request }) => {
    const before = received.length;
    const url = `http://localhost:${port}/api/leads`;
    const lead = {
      name: "Бот",
      phone: "+7 (900) 000-00-00",
      crews: "1-3",
      source: "landing",
      consent: true,
    };
    const trap = await request.post(url, { data: { ...lead, website: "spam.example" } });
    expect(trap.status()).toBe(204);
    expect(received.length).toBe(before);

    // Свой адрес для лимита: у Cloudflare ключ берётся из cf-connecting-ip
    const ip = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 5; i += 1) {
      expect((await request.post(url, { data: lead, headers: ip })).status()).toBe(204);
    }
    expect((await request.post(url, { data: lead, headers: ip })).status()).toBe(429);
    const bad = await request.post(url, { data: { ...lead, phone: "12" } });
    expect(bad.status()).toBe(400);
    expect(await bad.text()).toBe("");
  });
});

test.describe("набор партнёра", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("код партнёра в ссылках, копирование, поделиться, QR декодируется в ту же ссылку", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => {
      const shared: unknown[] = [];
      (window as unknown as { __shared: unknown[] }).__shared = shared;
      Object.defineProperty(navigator, "share", {
        value: async (data: unknown) => void shared.push(data),
        configurable: true,
      });
    });
    const response = await page.goto("/kit", { waitUntil: "load" });
    expect(response!.headers()["x-robots-tag"]).toContain("noindex");
    await page.waitForSelector("html[data-booted]");
    await page.getByTestId("kit-code").fill("vasya-01");

    const demo = page.getByTestId("kit-link").filter({ hasText: "Демо" }).first();
    const url = (await demo.getByTestId("kit-url").textContent())!;
    expect(url).toMatch(/\/demo\?src=vasya-01$/);

    await demo.getByRole("button", { name: "Скопировать" }).click();
    await expect(demo.getByText("Скопировано")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

    await demo.getByRole("button", { name: "Поделиться" }).click();
    expect(
      await page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared),
    ).toEqual([{ title: "ГАЙКА: Демо", url }]);

    const qr = demo.getByTestId("kit-qr");
    await expect(qr).toHaveAttribute("data-url", url);
    const pixels = await qr.evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d")!;
      return {
        data: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data),
        width: canvas.width,
        height: canvas.height,
      };
    });
    const decoded = jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
    expect(decoded?.data).toBe(url);

    await expect(page.getByTestId("kit-message")).toContainText(url);
    // Код запоминается между визитами
    await page.reload({ waitUntil: "load" });
    await expect(page.getByTestId("kit-code")).toHaveValue("vasya-01");
  });

  test("ссылка на /kit нигде на сайте не выводится", async ({ page }) => {
    for (const path of ["/", "/demo", "/case/gas", "/razbor", "/privacy"]) {
      await page.goto(path, { waitUntil: "load" });
      await expect(page.locator('a[href*="/kit"]')).toHaveCount(0);
    }
  });
});

test.describe("превью ссылок", () => {
  const PAGES = [
    ["/", "/og/landing.jpg"],
    ["/demo", "/og/demo.jpg"],
    ["/case/gas", "/og/case.jpg"],
    ["/razbor", "/og/razbor.jpg"],
  ] as const;
  const BOTS = [
    "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (compatible; vkShare; +http://vk.com/dev/Share)",
    "WhatsApp/2.23.20.0 A",
  ];

  test("Telegram, ВКонтакте и WhatsApp получают 200 и теги с картинкой своей страницы", async ({
    request,
  }) => {
    for (const [path, image] of PAGES) {
      for (const agent of BOTS) {
        const response = await request.get(path, { headers: { "user-agent": agent } });
        expect(response.status(), `${path} ${agent}`).toBe(200);
        const html = await response.text();
        expect(html).toMatch(/<meta property="og:title" content="[^"]+"/);
        expect(html).toMatch(/<meta property="og:description" content="[^"]+"/);
        expect(html).toMatch(
          new RegExp(`og:url" content="https?://[^"]+${path === "/" ? "/" : path}"`),
        );
        expect(html).toMatch(new RegExp(`og:image" content="https?://[^"]+${image}"`));
        expect(html).toContain('name="twitter:card" content="summary_large_image"');
      }
      const picture = await request.get(image);
      expect(picture.status()).toBe(200);
      expect(picture.headers()["content-type"]).toContain("image/jpeg");
    }
  });

  test("страницы снимков превью в production отвечают 404", async ({ request }) => {
    expect((await request.get("/og/landing")).status()).toBe(404);
  });
});
