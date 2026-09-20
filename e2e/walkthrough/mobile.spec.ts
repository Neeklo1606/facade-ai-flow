import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";
import { mobileCheck, type MobileCheck } from "../mobile-checks";
import { OUT, ROLES, asPersona, discover, load } from "./helpers";

/**
 * Мобильная версия (Q8, п. 4): все экраны каждой роли на 375, 390 и 430.
 * — Переполнение: страница шире экрана, и какие элементы её расширяют.
 * — Области нажатия меньше 44 × 44 (ссылка внутри строки текста не считается).
 * — Действия только по наведению: интерактивный элемент в раскладке, но прозрачен или скрыт.
 * — Пометка демонстрации видна.
 * Снимки экранов руководителя — в WALK_OUT/screens/<ширина>.
 */

export const WIDTHS = [375, 390, 430];

export interface MobileFinding extends MobileCheck {
  role: string;
  width: number;
  page: string;
  url: string;
  screenshot: string | null;
}

const slug = (pattern: string) =>
  pattern
    .replace(/^\//, "")
    .replace(/[/?&=:]+/g, "-")
    .replace(/-+$/, "") || "dashboard";

test.describe.configure({ mode: "parallel" });

for (const [persona, role] of Object.entries(ROLES)) {
  test(`мобильная версия: ${role}`, async ({ browser }) => {
    test.setTimeout(60 * 60 * 1000);
    const findings: MobileFinding[] = [];
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await asPersona(desktop, persona);
    const pages = await discover(await desktop.newPage());
    await desktop.close();

    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        locale: "ru-RU",
        timezoneId: "Europe/Moscow",
      });
      await asPersona(context, persona);
      const page = await context.newPage();
      for (const screen of pages) {
        await load(page, screen.url);
        const check = await mobileCheck(page);

        let screenshot: string | null = null;
        if (persona === "e-sokolov") {
          const dir = join(OUT, "screens", String(width));
          mkdirSync(dir, { recursive: true });
          screenshot = join(dir, `${slug(screen.pattern)}.jpg`);
          await page.screenshot({ path: screenshot, type: "jpeg", quality: 70 });
        }
        findings.push({ role, width, page: screen.pattern, url: screen.url, ...check, screenshot });
      }
      await context.close();
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `mobile-${persona}.json`), JSON.stringify(findings, null, 2));
  });
}
