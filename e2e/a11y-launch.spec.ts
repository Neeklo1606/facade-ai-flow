import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, expectA11y, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Доступность к запуску (шаг L8): axe без serious на страницах сайта и новых экранах в обеих
 * темах, порядок табуляции и видимый фокус на лендинге, ошибки формы у полей, текст 130 %
 * без поломки на 390, названия для читалки.
 */

const SITE = ["/", "/demo", "/case/gas", "/razbor", "/kit", "/privacy"];

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const scheme of ["light", "dark"] as const) {
  for (const width of [390, 1440]) {
    test(`сайт ${width} ${scheme}: axe без serious`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      for (const path of SITE) {
        await page.goto(path, { waitUntil: "load" });
        await page.waitForSelector("html[data-booted]");
        // Секции лендинга появляются при прокрутке: проверяем то, что видит человек
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y);
            await new Promise((resolve) => setTimeout(resolve, 40));
          }
          window.scrollTo(0, 0);
        });
        await expectA11y(page, `${path} ${width} ${scheme}`);
      }
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`«Ещё» и бот 390 ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, theme });

    test("axe без serious, вкладки объявляют выбранную, у шторки роли есть название", async ({
      page,
    }) => {
      await open(page, "/gas/more");
      await expectA11y(page, `/gas/more ${theme}`);
      const tabs = page.getByRole("navigation", { name: "Основные разделы" });
      await expect(tabs.locator('[aria-current="page"]')).toHaveCount(1);
      await page
        .getByRole("button", { name: /Сменить роль/ })
        .first()
        .click();
      await expect(page.getByRole("dialog", { name: /\S/ })).toBeVisible();
      await expectA11y(page, `шторка роли ${theme}`);
      await page.keyboard.press("Escape");

      await open(page, "/more");
      await expectA11y(page, `/more ${theme}`);

      await open(page, "/gas");
      await gasRole(page, "Бригадир");
      const bot = page.locator('[data-tour="bot"]');
      await bot.locator("[data-stage]").getByRole("button", { name: "Внести время" }).click();
      await bot.locator("[data-stage]").getByRole("button", { name: "Сказать голосом" }).click();
      await expect(bot.getByRole("button", { name: "Готово" })).toBeVisible();
      // Волна записи движется всё время, ждать конца анимаций нельзя: пузырь появляется
      // за 250 мс, ждём с запасом и проверяем
      await page.waitForTimeout(1000);
      const results = await new AxeBuilder({ page }).exclude("[data-sonner-toaster]").analyze();
      const serious = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
      expect(serious, `голос в боте ${theme}`).toEqual([]);
    });
  });
}

test.describe("лендинг с клавиатуры", () => {
  // Одна колонка: порядок сверху вниз строгий. На компьютере форма заявки стоит справа
  // от текста, и обход идёт по колонкам, это верный порядок чтения
  test.use({ viewport: { width: 390, height: 844 } });

  test("табуляция идёт сверху вниз, фокус виден на каждой остановке", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    let last = -1;
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return "end" as const;
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const ring =
          (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== "none";
        return {
          top: Math.round(box.top + window.scrollY),
          ring,
          name: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 40),
          fixed: !!el.closest(".site-sticky, header"),
        };
      });
      // Фокус дошёл до конца страницы и ушёл в адресную строку
      if (stop === "end") break;
      expect(stop.ring, `фокус не виден: ${stop.name}`).toBe(true);
      // Шапка липкая и стоит первой: её остановки идут до контента
      if (stop.fixed) continue;
      expect(stop.top, `порядок табуляции: ${stop.name}`).toBeGreaterThanOrEqual(last - 4);
      last = stop.top;
    }
  });

  test("ошибка формы связана с полем и переводит на него фокус", async ({ page }) => {
    await page.goto("/razbor", { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]");
    await page.getByRole("button", { name: "Отправить заявку" }).click();
    const name = page.getByLabel("Имя");
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    const describedBy = (await name.getAttribute("aria-describedby"))!;
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText("Напишите имя");
    await name.fill("Иван");
    await page.getByRole("button", { name: "Отправить заявку" }).click();
    const phone = page.getByLabel("Телефон");
    await expect(phone).toBeFocused();
    await expect(phone).toHaveAttribute("aria-invalid", "true");
    await expect(name).not.toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("текст 130 % на 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("страницы сайта и экраны приложения без прокрутки вбок", async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.fontSize = "130%";
      });
    });
    for (const path of SITE) {
      await page.goto(path, { waitUntil: "load" });
      expect(await overflow(page), path).toBeLessThanOrEqual(0);
    }
    for (const path of ["/gas/more", "/gas/moderation", "/gas/foreman", "/more"]) {
      await open(page, path);
      expect(await overflow(page), path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("тосты", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("область уведомлений объявляется вежливо (role=status по смыслу)", async ({ page }) => {
    await open(page, "/gas/moderation");
    await page.locator("[data-queue-card]").first().waitFor();
    await page.locator("body").press("Enter");
    const region = page.locator("section[aria-live='polite']").filter({
      has: page.locator("[data-sonner-toast]"),
    });
    await expect(region).toHaveCount(1);
  });
});

test.describe("скорость сайта", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("/ и /demo без оболочки приложения и без картинок превью, шрифт не блокирует", async ({
    page,
  }) => {
    for (const path of ["/", "/demo"]) {
      const urls: string[] = [];
      page.on("request", (request) => urls.push(request.url()));
      await page.goto(path, { waitUntil: "load" });
      await page.waitForSelector("html[data-booted]");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      expect(
        urls.filter((url) => /AppShell|GasShell|AppLayout/.test(url)),
        path,
      ).toEqual([]);
      expect(
        urls.filter((url) => url.includes("/og/")),
        path,
      ).toEqual([]);
      page.removeAllListeners("request");
    }
    // Шрифт свой (ADR-052): основное начертание грузится заранее, Google Fonts не нужен
    await expect(
      page.locator('link[rel="preload"][href="/fonts/golos-text-cyrillic-400.woff2"]'),
    ).toHaveCount(1);
    await expect(page.locator('link[href*="fonts.googleapis.com"]')).toHaveCount(0);
    const display = await page.evaluate(() =>
      [...document.fonts]
        .filter((f) => f.family.replace(/"/g, "") === "Golos Text")
        .map((f) => f.display),
    );
    expect(display.length).toBeGreaterThan(0);
    expect(new Set(display)).toEqual(new Set(["swap"]));
  });
});
