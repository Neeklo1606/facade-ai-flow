/**
 * Обход всех кнопок за все роли (QA перед показом, 23.11.2026). Для каждой роли на 1440 и 390:
 * каждый раздел меню, каждая видимая кнопка экрана по очереди. После нажатия: ошибки консоли
 * и страницы, ответы сервера 5xx, экран ошибки, горизонтальное переполнение. Затем Escape и
 * возврат на экран, если адрес сменился. Отчёт: .local/qa-crawl.json и сводка в консоль.
 *
 * Запуск: сервер демо-сборки, затем `bun scripts/qa-crawl.ts [адрес] [роль]`.
 * Кнопки выхода, сброса демо и скачивания пропускаются: они уводят с экрана или из демо.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:4630").replace(/\/+$/, "");
const onlyRole = process.argv[3];
const ROLES = [
  "Бригадир",
  "Менеджер проверки",
  "Руководитель",
  "Администратор",
  "Прораб",
  "Снабженец",
  "ПТО",
];
const VIEWPORTS = [
  { name: "1440", viewport: { width: 1440, height: 900 }, touch: false },
  { name: "390", viewport: { width: 390, height: 844 }, touch: true },
];
const SKIP =
  /выйти|сбросить|начать заново|скачать|выгрузить|печать|pdf|docx|excel|сменить роль|^вы:|меню|свернуть меню|telegram|тур|показ/i;

type Issue = {
  role: string;
  width: string;
  screen: string;
  button: string;
  kind: string;
  detail: string;
};
const issues: Issue[] = [];
let clicks = 0;

async function role(page: Page, label: string) {
  await page.getByRole("button", { name: /^Вы: / }).filter({ visible: true }).first().click();
  const list = page.getByRole("list", { name: "Роли" });
  if (!(await list.isVisible())) await page.getByRole("button", { name: /^Сменить роль/ }).click();
  await list.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  await page.waitForTimeout(900);
}

async function navLinks(page: Page): Promise<{ name: string; href: string }[]> {
  return page.evaluate(() => {
    const out = new Map<string, string>();
    const navs = document.querySelectorAll(
      "nav a[href^='/gas'], [role='navigation'] a[href^='/gas']",
    );
    navs.forEach((a) => {
      const el = a as HTMLAnchorElement;
      const href = el.getAttribute("href")!;
      if (!out.has(href))
        out.set(href, (el.innerText || el.getAttribute("aria-label") || href).trim());
    });
    return [...out].map(([href, name]) => ({ href, name }));
  });
}

async function health(page: Page) {
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    crashed: /Что-то пошло не так|Application error|Unexpected Application Error/i.test(
      document.body.innerText,
    ),
  }));
}

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  for (const label of ROLES) {
    if (onlyRole && label !== onlyRole) continue;
    const context = await browser.newContext({
      viewport: vp.viewport,
      hasTouch: vp.touch,
      isMobile: vp.touch,
      locale: "ru-RU",
      timezoneId: "Europe/Moscow",
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      sessionStorage.setItem("gaika-gas-only", "0");
      localStorage.setItem(
        "gaika-tour-seen",
        JSON.stringify(["foreman", "manager", "director", "prorab", "supply", "pto", "admin"]),
      );
    });
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    let current = { screen: "", button: "" };
    const note = (kind: string, detail: string) =>
      issues.push({ role: label, width: vp.name, ...current, kind, detail: detail.slice(0, 300) });
    page.on("pageerror", (error) => note("pageerror", error.message));
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (/favicon|Failed to load resource: the server responded with a status of 404/.test(text))
        return;
      note("console", text);
    });
    page.on("response", (response) => {
      if (response.status() >= 500) note("http", `${response.status()} ${response.url()}`);
    });

    await page.goto(`${base}/gas`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("html[data-booted]", { timeout: 60_000 });
    try {
      await role(page, label);
    } catch (error) {
      note("role", (error as Error).message.split("\n")[0]!);
      await context.close();
      continue;
    }
    // Разделы: меню компьютера, на телефоне нижняя панель и «Ещё»
    let links = await navLinks(page);
    if (vp.name === "390") {
      const more = page
        .getByRole("link", { name: "Ещё" })
        .or(page.getByRole("button", { name: "Ещё" }));
      if (
        await more
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await more
          .first()
          .click()
          .catch(() => undefined);
        await page.waitForTimeout(500);
        links = [...links, ...(await navLinks(page))];
      }
    }
    const seen = new Set<string>();
    for (const link of links) {
      const path = link.href.split("?")[0]!;
      if (seen.has(path)) continue;
      seen.add(path);
      current = { screen: path, button: "(открытие)" };
      await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("html[data-booted]", { timeout: 30_000 }).catch(() => undefined);
      await page.waitForTimeout(700);
      const h = await health(page);
      if (h.crashed) note("crash", "экран ошибки при открытии");
      if (h.overflow > 1) note("overflow", `${h.overflow}px при открытии`);

      const total = Math.min(await page.locator("main button:visible").count(), 45);
      const done = new Set<string>();
      for (let i = 0; i < total; i += 1) {
        const button = page.locator("main button:visible").nth(i);
        if (!(await button.count())) break;
        const name = (
          (await button.getAttribute("aria-label").catch(() => null)) ||
          (await button.innerText().catch(() => "")) ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim();
        if (!name || /^\d+$/.test(name) || SKIP.test(name) || done.has(name)) continue;
        done.add(name);
        if (!(await button.isEnabled().catch(() => false))) continue;
        current = { screen: path, button: name };
        try {
          await button.click({ timeout: 2500 });
          clicks += 1;
        } catch {
          continue;
        }
        await page.waitForTimeout(350);
        const after = await health(page);
        if (after.crashed) note("crash", "экран ошибки после нажатия");
        if (after.overflow > 1) note("overflow", `${after.overflow}px после нажатия`);
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(150);
        if (!page.url().includes(path) || after.crashed) {
          await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
          await page
            .waitForSelector("html[data-booted]", { timeout: 30_000 })
            .catch(() => undefined);
          await page.waitForTimeout(400);
        }
      }
    }
    console.log(`${vp.name} ${label}: разделов ${seen.size}`);
    await context.close();
  }
}
await browser.close();

mkdirSync(".local", { recursive: true });
writeFileSync(".local/qa-crawl.json", JSON.stringify(issues, null, 2));
const byKind = new Map<string, number>();
for (const issue of issues) byKind.set(issue.kind, (byKind.get(issue.kind) ?? 0) + 1);
console.log(`нажатий: ${clicks}, замечаний: ${issues.length}`, Object.fromEntries(byKind));
const unique = new Map<string, Issue>();
for (const issue of issues)
  unique.set(`${issue.kind}|${issue.screen}|${issue.detail.slice(0, 80)}`, issue);
for (const issue of unique.values())
  console.log(
    `- [${issue.kind}] ${issue.width} ${issue.role} ${issue.screen} «${issue.button}»: ${issue.detail}`,
  );
