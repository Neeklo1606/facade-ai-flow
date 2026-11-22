/**
 * Обход всех кнопок за все роли (QA перед показом, 23.11.2026). Для каждой роли на 1440 и 390:
 * каждый раздел меню, каждая видимая кнопка экрана по очереди. После нажатия: ошибки консоли
 * и страницы, ответы сервера 5xx, экран ошибки, горизонтальное переполнение. При открытии
 * раздела ещё две проверки: на телефоне области нажатия меньше 44 px (правило 5, ADR-082)
 * и тексты, обрезанные многоточием без подсказки (title или aria-label). Затем Escape и
 * возврат на экран, если адрес сменился. Отчёт: .local/qa-crawl.json и сводка в консоль.
 *
 * Запуск: сервер демо-сборки, затем `bun scripts/qa-crawl.ts [адрес] [роль|all] [ширина]`.
 * Переменная QA_CRAWL_JOBS задаёт число ролей, которые обходятся одновременно (по умолчанию 3).
 * Кнопки выхода, сброса демо и скачивания пропускаются: они уводят с экрана или из демо.
 *
 * Что обходчик сознательно не считает дефектом (разбор ночи 23.11):
 * - ячейки табеля (role="gridcell") на телефоне 30 px: решение владельца, ADR-082 п. 6;
 * - ссылки внутри строки текста (у родителя есть свой текст): высота равна строке, это не кнопка;
 * - область, расширенная невидимым ::before (класс touch-target), засчитывается по ::before;
 * - элементы под скрытым слоем (visibility, display, нулевая прозрачность, aria-hidden, inert);
 * - переход дольше лимита при общей нагрузке машины записывается замечанием «nav» и не роняет
 *   весь обход (первый прогон падал на goto с лимитом 4 с по умолчанию).
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:4630").replace(/\/+$/, "");
const onlyRole = process.argv[3] && process.argv[3] !== "all" ? process.argv[3] : undefined;
const onlyWidth = process.argv[4];
const JOBS = Math.max(1, Number(process.env["QA_CRAWL_JOBS"] ?? 3));
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
const NAV_TIMEOUT = 30_000;

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

/** Области нажатия меньше 44 px на телефоне: кнопки, ссылки, вкладки, поля выбора */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0)
          return false;
        if (n.getAttribute("aria-hidden") === "true" || (n as HTMLElement).inert) return false;
      }
      return true;
    };
    const inlineText = (el: Element) => {
      if (el.tagName !== "A") return false;
      const parent = el.parentElement;
      if (!parent || getComputedStyle(el).display !== "inline") return false;
      const own = [...parent.childNodes]
        .filter((n) => n !== el)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      return own.length > 0;
    };
    const nodes = document.querySelectorAll(
      "button, a[href], [role='button'], [role='tab'], [role='menuitem'], select, input[type='checkbox'], input[type='radio']",
    );
    nodes.forEach((el) => {
      if (el.closest("[role='gridcell'], [role='columnheader'], [role='rowheader']")) return;
      if (!visible(el) || inlineText(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.bottom < 0 || r.right < 0 || r.left > window.innerWidth) return;
      // Поле внутри подписи: засчитывается область подписи
      const host = el.closest("label") ?? el;
      const hr = host.getBoundingClientRect();
      // `touch-target` расширяет область невидимым ::before, как в e2e/gas-375.spec.ts
      const before = getComputedStyle(el, "::before");
      const h = Math.max(r.height, hr.height, parseFloat(before.height) || 0);
      const w = Math.max(r.width, hr.width, parseFloat(before.width) || 0);
      if (h >= 43.5 && w >= 43.5) return;
      const name = (
        el.getAttribute("aria-label") ||
        (el as HTMLElement).innerText ||
        el.getAttribute("title") ||
        el.tagName
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40);
      out.push(`${name} ${Math.round(w)}x${Math.round(h)}`);
    });
    return out;
  });
}

/** Тексты, обрезанные многоточием или line-clamp, без подсказки с полным текстом */
async function clipped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll("body *").forEach((node) => {
      const el = node as HTMLElement;
      if (!el.innerText || el.children.length > 3) return;
      const s = getComputedStyle(el);
      const ellipsis = s.textOverflow === "ellipsis" && s.overflow !== "visible";
      const clamp = Boolean(s.webkitLineClamp) && s.webkitLineClamp !== "none";
      if (!ellipsis && !clamp) return;
      const cut = ellipsis
        ? el.scrollWidth > el.clientWidth + 1
        : el.scrollHeight > el.clientHeight + 1;
      if (!cut) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        if (n.getAttribute("title") || n.getAttribute("aria-label")) return;
        if (n.tagName === "BUTTON" || n.tagName === "A") break;
      }
      out.push(el.innerText.replace(/\s+/g, " ").trim().slice(0, 60));
    });
    return out;
  });
}

async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  await page.waitForSelector("html[data-booted]", { timeout: NAV_TIMEOUT }).catch(() => undefined);
}

async function crawl(browser: Browser, vp: (typeof VIEWPORTS)[number], label: string) {
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

  try {
    await open(page, `${base}/gas`);
    await role(page, label);
  } catch (error) {
    note("role", (error as Error).message.split("\n")[0]!);
    await context.close();
    return;
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
    try {
      await open(page, `${base}${path}`);
    } catch (error) {
      note("nav", (error as Error).message.split("\n")[0]!);
      continue;
    }
    await page.waitForTimeout(700);
    const h = await health(page);
    if (h.crashed) note("crash", "экран ошибки при открытии");
    if (h.overflow > 1) note("overflow", `${h.overflow}px при открытии`);
    if (vp.touch) for (const t of await smallTargets(page)) note("tap", t);
    for (const t of await clipped(page)) note("clip", t);

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
      const after = await health(page).catch(() => ({ crashed: false, overflow: 0 }));
      if (after.crashed) note("crash", "экран ошибки после нажатия");
      if (after.overflow > 1) note("overflow", `${after.overflow}px после нажатия`);
      if (vp.touch && (await page.getByRole("dialog").filter({ visible: true }).count()))
        for (const t of await smallTargets(page).catch(() => [])) note("tap", `в окне: ${t}`);
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.waitForTimeout(150);
      if (!page.url().includes(path) || after.crashed) {
        try {
          await open(page, `${base}${path}`);
          await page.waitForTimeout(400);
        } catch (error) {
          note("nav", (error as Error).message.split("\n")[0]!);
          break;
        }
      }
    }
  }
  console.log(`${vp.name} ${label}: разделов ${seen.size}`);
  await context.close();
}

const browser = await chromium.launch();
const jobs: (() => Promise<void>)[] = [];
for (const vp of VIEWPORTS) {
  if (onlyWidth && vp.name !== onlyWidth) continue;
  for (const label of ROLES) {
    if (onlyRole && label !== onlyRole) continue;
    jobs.push(() =>
      crawl(browser, vp, label).catch((error: Error) => {
        issues.push({
          role: label,
          width: vp.name,
          screen: "",
          button: "",
          kind: "crawler",
          detail: error.message.split("\n")[0]!,
        });
      }),
    );
  }
}
await Promise.all(
  Array.from({ length: JOBS }, async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) await job();
  }),
);
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
