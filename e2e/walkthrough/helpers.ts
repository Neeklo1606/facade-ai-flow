import type { BrowserContext, Page } from "@playwright/test";

/** Общее для обхода (Q8): роли, загрузка экрана, шаблон адреса, поиск экранов по ссылкам */

// Не в test-results: Playwright очищает её при каждом запуске, и отчёт прошлого прохода пропадёт
export const OUT = process.env["WALK_OUT"] ?? ".walkthrough";
export const ROLES: Record<string, string> = {
  "e-sokolov": "руководитель проекта",
  "e-dorohov": "снабжение",
  "e-volkova": "ПТО",
  "e-gareev": "прораб",
  "e-belyaev": "директор",
};
export const MAX_PAGES = 60;
export const MAX_INNER = 30;

export { INTERACTIVE } from "../mobile-checks";

export interface ElementResult {
  page: string;
  signature: string;
  label: string;
  effect: string[];
  note?: string | undefined;
}

export interface RoleReport {
  role: string;
  persona: string;
  pages: { pattern: string; url: string; title: string; exits: number; errors: string[] }[];
  elements: ElementResult[];
}

export async function asPersona(context: BrowserContext, persona: string) {
  await context.addInitScript((id) => {
    try {
      sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
      sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
      sessionStorage.setItem("neeklo-fieldops-persona", id);
    } catch {
      // приватный режим
    }
  }, persona);
}

/** Открыть адрес и дождаться, пока уйдут скелетоны */
export async function load(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page
    .locator("main, [data-screen]")
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  await page
    .waitForFunction(
      () => !document.querySelector("main [aria-busy='true'], main [aria-busy='']"),
      null,
      {
        timeout: 15_000,
      },
    )
    .catch(() => undefined);
  await page.waitForTimeout(150);
}

/**
 * Шаблон адреса: ключи объектов, документов, запросов — заменены; параметры, которые
 * выбирают вкладку или вид, — со значением, остальные — только именем
 */
export function pattern(url: string) {
  const parsed = new URL(url, "http://x");
  const path = parsed.pathname
    .replace(/\/projects\/[^/]+/, "/projects/:id")
    .replace(/\/documents\/[^/]+/, "/documents/:doc")
    .replace(/\/procurement\/[^/]+/, "/procurement/:rfq");
  const keep = new Set(["tab", "view", "review", "purchase", "stage", "chars"]);
  const query = [...parsed.searchParams.entries()]
    .filter(([key]) => key !== "k")
    .map(([key, value]) => (keep.has(key) ? `${key}=${value}` : key))
    .sort()
    .join("&");
  return query ? `${path}?${query}` : path;
}

/** Экраны роли: обход ссылок от дашборда и реестра, по одному адресу на шаблон */
export async function discover(page: Page) {
  const found = new Map<string, string>();
  const queue = ["/", "/projects"];
  const exitsOf = new Map<string, number>();
  const titles = new Map<string, string>();
  const errors = new Map<string, string[]>();
  let pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text().slice(0, 160));
  });
  page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 160)));
  while (queue.length && found.size < MAX_PAGES) {
    const url = queue.shift()!;
    const key = pattern(url);
    if (found.has(key)) continue;
    pageErrors = [];
    await load(page, url);
    found.set(key, page.url());
    titles.set(key, await page.title());
    const links = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")]
        .map((a) => a.getAttribute("href") ?? "")
        .filter(
          (href) => href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/api"),
        ),
    );
    exitsOf.set(key, new Set(links.map((href) => pattern(href)).filter((p) => p !== key)).size);
    errors.set(key, pageErrors);
    for (const href of links) if (!found.has(pattern(href))) queue.push(href);
  }
  return [...found.entries()].map(([key, url]) => ({
    pattern: key,
    url,
    title: titles.get(key) ?? "",
    exits: exitsOf.get(key) ?? 0,
    errors: errors.get(key) ?? [],
  }));
}
