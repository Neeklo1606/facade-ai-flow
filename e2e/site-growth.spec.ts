import { expect, test } from "./fixtures";

/**
 * Новые страницы сайта (ADR-068): «Для кого», «Как работает», статьи. Сервер отдаёт HTML
 * с H1 и метой, ссылки есть в шапке и подвале, у статьи JSON-LD Article, неизвестная статья
 * отвечает 404, переполнения по ширине нет, обещаний и запрещённых слов нет.
 */

const PAGES = [
  { path: "/dlya-kogo", h1: "Каждый делает своё. Переписывать никому не нужно." },
  { path: "/kak-rabotaet", h1: "Пять сценариев. Каждый за минуту." },
  { path: "/stati", h1: "Как подрядчики уходят от переписывания" },
  { path: "/stati/tabel-brigad-bez-perescheta", h1: "Табель бригад без пересчёта в пятницу" },
];

test.describe("новые страницы сайта", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("сервер отдаёт H1, canonical и закрытую индексацию без SEO_INDEX", async ({ request }) => {
    for (const { path, h1 } of PAGES) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const html = await response.text();
      expect(html, path).toContain(h1);
      expect(html, path).toContain('rel="canonical"');
      expect(html, path).toContain('name="robots" content="noindex, nofollow"');
    }
  });

  test("статья: крошки, JSON-LD Article, ссылка на задачу и другие статьи", async ({ page }) => {
    await page.goto("/stati/zayavka-na-material-s-obekta", { waitUntil: "load" });
    await expect(page.getByRole("navigation", { name: "Хлебные крошки" })).toContainText("Статьи");
    const graph = await page
      .locator('script[type="application/ld+json"]')
      .first()
      .evaluate((el) => JSON.parse(el.textContent ?? "{}"));
    const types = (graph["@graph"] ?? [graph]).map((node: { "@type": string }) => node["@type"]);
    expect(types).toContain("Article");
    expect(types).toContain("BreadcrumbList");
    await expect(page.getByRole("link", { name: "Снабжение объекта" }).first()).toHaveAttribute(
      "href",
      "/snabzhenie",
    );
    await expect(page.getByRole("heading", { name: "Читайте также" })).toBeVisible();
  });

  test("фильтр статей по теме сужает список и возвращается ко всем", async ({ page }) => {
    await page.goto("/stati", { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    const cards = page.locator("main ul li h3");
    const all = await cards.count();
    expect(all).toBeGreaterThanOrEqual(6);
    await page.getByRole("button", { name: "Снабжение", exact: true }).click();
    await expect(page.getByRole("button", { name: "Снабжение", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(cards).toHaveCount(1);
    await page.getByRole("button", { name: "Все" }).click();
    await expect(cards).toHaveCount(all);
  });

  test("главная: роли ведут на «Для кого», статьи на раздел статей", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { level: 2, name: "Кому ГАЙКА снимает работу" }),
    ).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Подробнее о роли" }).first()).toHaveAttribute(
      "href",
      "/dlya-kogo#brigadir",
    );
    await expect(
      page.getByRole("heading", { level: 2, name: "Статьи для подрядчика" }),
    ).toHaveCount(1);
    // Меню телефона ведёт на новые страницы
    await page.getByRole("button", { name: "Меню" }).click();
    const menu = page.getByRole("navigation", { name: "Меню сайта" });
    for (const [name, href] of [
      ["Для кого", "/dlya-kogo"],
      ["Как работает", "/kak-rabotaet"],
      ["Статьи", "/stati"],
    ] as const)
      await expect(menu.getByRole("link", { name })).toHaveAttribute("href", href);
  });

  test("нет переполнения и запрещённых слов на всех новых страницах", async ({ page }) => {
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const { path } of PAGES) {
        await page.goto(path, { waitUntil: "load" });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} ${width}`).toBe(0);
      }
    }
    for (const { path } of PAGES) {
      await page.goto(path, { waitUntil: "load" });
      const text = await page.locator("main").innerText();
      expect(text, path).not.toMatch(
        /эффективно|удобно|легко|инновацион|уникальн|революцион|лучший|отзыв|скидк|окупаем/i,
      );
      expect(text, path).not.toContain("—");
    }
  });
});

test.describe("неизвестная статья", () => {
  // Ответ документа 404 браузер пишет в консоль: это ожидаемый ответ, а не ошибка страницы
  test.use({ expectedConsole: /status of 404/ });

  test("неизвестная статья: 404 сайта", async ({ page }) => {
    const response = await page.goto("/stati/takoy-net", { waitUntil: "load" });
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Такой страницы нет");
  });
});
