/**
 * Обход к запуску (шаг L9): страницы сайта и главные экраны ГАЙКИ на девяти ширинах.
 * Контур газа обходит scripts/gas-walk.ts, кнопки ГАЙКИ по одной обходит bun run walkthrough.
 *
 * Запуск по собранному демо-серверу:
 *   PORT=4695 node .output/server/index.mjs &
 *   LAUNCH_WALK_BASE=http://localhost:4695 bun scripts/launch-walk.ts
 *
 * На каждом экране и ширине:
 * 1. Переполнение страницы вбок: 0.
 * 2. Касание на телефоне от 44 px по короткой стороне у видимых кнопок, ссылок и полей.
 * 3. Перекрытия: в конце прокрутки последнее действие контента не под фиксированным слоем.
 * 4. Ошибки консоли за время загрузки.
 * Отчёт печатается и пишется в `.verify/launch-walk.json`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env["LAUNCH_WALK_BASE"] ?? "http://localhost:4695";
const WIDTHS = [360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
const SCREENS: { path: string; persona: string | null }[] = [
  { path: "/", persona: null },
  { path: "/demo", persona: null },
  { path: "/case/gas", persona: null },
  { path: "/razbor", persona: null },
  { path: "/kit", persona: null },
  { path: "/privacy", persona: null },
  { path: "/today", persona: "e-gareev" },
  { path: "/capture", persona: "e-gareev" },
  { path: "/inbox", persona: "e-gareev" },
  { path: "/check", persona: "e-volkova" },
  { path: "/attention", persona: "e-sokolov" },
  { path: "/more", persona: "e-sokolov" },
  { path: "/office", persona: "e-sokolov" },
];

type Row = {
  path: string;
  width: number;
  overflow: number;
  small: string[];
  covered: string[];
  console: string[];
};

const browser = await chromium.launch();
const rows: Row[] = [];
for (const width of WIDTHS) {
  const phone = width < 768;
  for (const screen of SCREENS) {
    const context = await browser.newContext({
      viewport: { width, height: phone ? 800 : 900 },
      isMobile: phone,
      hasTouch: phone,
      locale: "ru-RU",
      timezoneId: "Europe/Moscow",
    });
    await context.addInitScript((id: string | null) => {
      if (!id) return;
      try {
        sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
        sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
        sessionStorage.setItem("neeklo-fieldops-persona", id);
      } catch {
        // приватный режим
      }
    }, screen.persona);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    await page.goto(base + screen.path, { waitUntil: "load" });
    await page.waitForSelector("html[data-booted]", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    const result = await page.evaluate((isPhone: boolean) => {
      const doc = document.documentElement;
      const name = (el: Element) =>
        (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 40);
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.opacity !== "0";
      };
      const targets = [
        ...document.querySelectorAll(
          "button, a[href], input, select, textarea, [role='button'], summary",
        ),
      ]
        .filter(
          (el) =>
            visible(el) && !el.closest("[aria-hidden='true'], .sr-only, [data-sonner-toaster]"),
        )
        // Ссылка внутри строки текста меряется строкой, а не высотой букв (WCAG 2.5.8, исключение)
        .filter((el) => !(el.tagName === "A" && getComputedStyle(el).display === "inline"));
      const small = isPhone
        ? targets
            .filter((el) => {
              const r = el.getBoundingClientRect();
              if ((el as HTMLInputElement).type === "checkbox") return false;
              return Math.min(r.width, r.height) < 44 && r.height < 44;
            })
            .map(name)
        : [];
      /*
       * Перекрытие: страница прокручена до конца, и последнее действие контента не должно
       * оставаться под нижней панелью или липкой кнопкой. Посреди прокрутки строки уходят
       * под шапку и панель, это не дефект
       */
      for (const root of [
        document.scrollingElement,
        ...document.querySelectorAll("[data-scroll-root]"),
      ])
        if (root) (root as HTMLElement).scrollTop = 1e6;
      const covered: string[] = [];
      const own = [
        ...document.querySelectorAll("main button, main a[href], main summary, main input"),
      ].filter((el) => visible(el) && !el.closest("[aria-hidden='true'], .sr-only"));
      const last = own[own.length - 1];
      if (last) {
        const r = last.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (top && !last.contains(top) && !top.contains(last)) covered.push(name(last));
      }
      return { overflow: doc.scrollWidth - doc.clientWidth, small, covered };
    }, phone);
    rows.push({ path: screen.path, width, ...result, console: errors });
    await context.close();
  }
}
await browser.close();

mkdirSync(".verify", { recursive: true });
writeFileSync(".verify/launch-walk.json", JSON.stringify(rows, null, 2));
const bad = rows.filter(
  (r) => r.overflow > 0 || r.small.length || r.covered.length || r.console.length,
);
for (const r of bad) {
  console.log(
    `${r.width} ${r.path}: переполнение ${r.overflow}` +
      (r.small.length
        ? `; мелкие ${r.small.length}: ${[...new Set(r.small)].slice(0, 6).join(" | ")}`
        : "") +
      (r.covered.length ? `; под слоем: ${r.covered.slice(0, 4).join(" | ")}` : "") +
      (r.console.length ? `; консоль: ${r.console[0]}` : ""),
  );
}
console.log(`Обход: ${rows.length} экранов x ширин, с замечаниями ${bad.length}`);
process.exit(bad.length ? 1 : 0);
