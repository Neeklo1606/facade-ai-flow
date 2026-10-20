/**
 * Обход раздела учёта времени: каждая кнопка, ссылка, вкладка и поле на трёх ширинах.
 *
 * Запуск: `GAS_WALK_BASE=http://localhost:4631 bun run scripts/gas-walk.ts`
 *
 * Что проверяется на каждом экране:
 * 1. Переполнение страницы вбок — его быть не должно ни на одной ширине.
 * 2. Размер области нажатия: на телефоне от 48 px по короткой стороне
 *    (ADR-034, п. 6 и ADR-042: премиальный интерфейс требует 48).
 * 3. Подпись: у каждой кнопки и ссылки есть текст или aria-label.
 * 4. Нажатие: кнопка что-то меняет — адрес, разметку или появившийся слой.
 *    Кнопка без последствий это обещание, которого система не выполняет.
 * 5. Ошибки в консоли за время обхода.
 *
 * Отчёт печатается и пишется в `.verify/gas-walk.json`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const base = process.env["GAS_WALK_BASE"] ?? "http://localhost:4631";
const out = process.env["GAS_WALK_OUT"] ?? ".verify/gas-walk.json";

const SCREENS = [
  "/gas",
  "/gas/foreman",
  "/gas/moderation",
  "/gas/entries",
  "/gas/reports",
  "/gas/brigades",
  "/gas/objects",
  "/gas/estimates",
  "/gas/employees",
  "/gas/summary",
  "/gas/admin",
  "/gas/guide",
  "/gas/questions",
  "/gas/finish",
];

const VIEWS = [
  { label: "1440", width: 1440, height: 980 },
  { label: "768", width: 768, height: 1024 },
  { label: "390", width: 390, height: 844 },
  { label: "375", width: 375, height: 812 },
];

/** Ширины телефона: на них цель касания не меньше 48 px */
const PHONE = new Set([375, 390]);

/**
 * Элементы раздела и оболочки контура (ADR-044): main, шапка и нижняя панель. Нажатия делаются
 * только внутри main, размер касания и подписи проверяются везде.
 */
const INTERACTIVE = [
  "main a[href], main button, main select, main input, main textarea, main [role=tab]",
  "header a[href], header button",
  "nav[aria-label='Основные разделы'] a, nav[aria-label='Основные разделы'] button",
  "[data-gas-show-dock] button",
].join(", ");

interface Problem {
  screen: string;
  view: string;
  kind: "overflow" | "touch" | "label" | "dead" | "console" | "overlap";
  detail: string;
}

const problems: Problem[] = [];
const stats = { screens: 0, elements: 0, clicked: 0 };

async function openScreen(page: Page, path: string): Promise<void> {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.locator("main").waitFor();
  await page.waitForLoadState("load");
  await page.waitForTimeout(250);
}

/** Снимок всех интерактивных элементов: подпись, размер, видимость */
function describe(page: Page) {
  return page.evaluate((selector) => {
    const items: {
      label: string;
      tag: string;
      width: number;
      height: number;
      right: number;
      scrollable: boolean;
      active: boolean;
      disabled: boolean;
    }[] = [];
    for (const el of document.querySelectorAll(selector)) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const label = (
        el.getAttribute("aria-label") ||
        el.textContent ||
        el.getAttribute("placeholder") ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      /*
       * Элемент за правым краем — дефект только тогда, когда его нельзя докрутить.
       * Широкая таблица и полоса разделов лежат в своих прокручиваемых контейнерах:
       * страница при этом стоит на месте, и человек видит всё.
       */
      let scrollable = false;
      for (let node = el.parentElement; node; node = node.parentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          scrollable = true;
          break;
        }
      }
      items.push({
        label: label.slice(0, 48),
        tag: el.tagName.toLowerCase(),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        scrollable,
        active:
          el.getAttribute("aria-selected") === "true" ||
          el.getAttribute("aria-current") === "page" ||
          el.getAttribute("aria-pressed") === "true",
        disabled: (el as HTMLButtonElement).disabled === true,
      });
    }
    return {
      items,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  }, INTERACTIVE);
}

const browser = await chromium.launch({
  ...(process.env["PW_CHROMIUM"] ? { executablePath: process.env["PW_CHROMIUM"] } : {}),
});

for (const view of VIEWS) {
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 160));
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error).slice(0, 160)));

  for (const screen of SCREENS) {
    stats.screens += 1;
    await openScreen(page, screen);
    const snapshot = await describe(page);
    stats.elements += snapshot.items.length;

    if (snapshot.scrollWidth > snapshot.innerWidth) {
      problems.push({
        screen,
        view: view.label,
        kind: "overflow",
        detail: `страница шире окна: ${snapshot.scrollWidth} при ${snapshot.innerWidth}`,
      });
    }

    /*
     * Закреплённые панели экрана (кнопки действия, шторки) не должны уходить под нижнюю панель
     * оболочки и полосу показа: пересечение прямоугольников видно сразу, без нажатий.
     */
    const covered = await page.evaluate(() => {
      const bars = [
        ...document.querySelectorAll(
          "nav[aria-label='Основные разделы'] ul, [data-gas-show-dock] > div",
        ),
      ].map((el) => el.getBoundingClientRect());
      const hits: string[] = [];
      for (const el of document.querySelectorAll("main *")) {
        const style = getComputedStyle(el);
        if (style.position !== "fixed" && style.position !== "sticky") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        for (const bar of bars) {
          const x = Math.min(rect.right, bar.right) - Math.max(rect.left, bar.left);
          const y = Math.min(rect.bottom, bar.bottom) - Math.max(rect.top, bar.top);
          if (x > 4 && y > 4) hits.push((el.textContent ?? el.tagName).trim().slice(0, 40));
        }
      }
      return hits;
    });
    for (const hit of covered) {
      problems.push({
        screen,
        view: view.label,
        kind: "overlap",
        detail: `закреплённый «${hit}» перекрыт нижней панелью или полосой показа`,
      });
    }

    for (const item of snapshot.items) {
      if (!item.label) {
        problems.push({
          screen,
          view: view.label,
          kind: "label",
          detail: `${item.tag} без подписи, ${item.width}×${item.height}`,
        });
      }
      const short = Math.min(item.width, item.height);
      if (PHONE.has(view.width) && short < 48 && item.tag !== "input" && item.tag !== "textarea") {
        problems.push({
          screen,
          view: view.label,
          kind: "touch",
          detail: `«${item.label}» ${item.width}×${item.height}`,
        });
      }
      if (item.right > snapshot.innerWidth + 1 && !item.scrollable) {
        problems.push({
          screen,
          view: view.label,
          kind: "overlap",
          detail: `«${item.label}» заходит за правый край на ${item.right - snapshot.innerWidth} px`,
        });
      }
    }

    // Нажатие каждой кнопки: только на широком экране, чтобы не умножать время обхода
    if (view.width !== 1440) continue;
    const buttons = await page.locator("main button:not([disabled])").all();
    for (let index = 0; index < buttons.length; index += 1) {
      await openScreen(page, screen);
      const fresh = page.locator("main button:not([disabled])").nth(index);
      if ((await fresh.count()) === 0) continue;
      const label = ((await fresh.textContent()) ?? (await fresh.getAttribute("aria-label")) ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40);
      /*
       * Уже выбранная вкладка или карточка по нажатию ничего не меняет — и не должна.
       * Такие элементы в проверку «кнопка без последствий» не попадают.
       */
      const already =
        (await fresh.getAttribute("aria-selected")) === "true" ||
        (await fresh.getAttribute("data-state")) === "active" ||
        (await fresh.getAttribute("aria-pressed")) === "true";
      if (already) continue;
      // Сброс данных уводит состояние: его проверяет сквозной тест, здесь пропускаем
      if (/Сбросить/.test(label)) continue;
      // Сравниваем сам текст экрана, а не его длину: две похожие карточки давали одинаковую
      // длину разметки, и обход считал живую кнопку мёртвой
      const before = {
        url: page.url(),
        text: await page.locator("main").innerText(),
        dialogs: await page.locator("[role=dialog], [data-sonner-toast]").count(),
      };
      try {
        await fresh.click({ timeout: 4000 });
      } catch {
        problems.push({
          screen,
          view: view.label,
          kind: "dead",
          detail: `«${label}» не нажимается`,
        });
        continue;
      }
      stats.clicked += 1;
      await page.waitForTimeout(350);
      const after = {
        url: page.url(),
        text: await page.locator("main").innerText(),
        dialogs: await page.locator("[role=dialog], [data-sonner-toast]").count(),
      };
      const changed =
        before.url !== after.url || before.text !== after.text || before.dialogs !== after.dialogs;
      if (!changed) {
        problems.push({
          screen,
          view: view.label,
          kind: "dead",
          detail: `«${label}» нажалась, но ничего не изменилось`,
        });
      }
    }
  }

  for (const error of consoleErrors) {
    problems.push({ screen: "—", view: view.label, kind: "console", detail: error });
  }
  await context.close();
}

await browser.close();

mkdirSync(".verify", { recursive: true });
writeFileSync(out, `${JSON.stringify({ stats, problems }, null, 2)}\n`);

console.log(
  `Экранов пройдено: ${stats.screens}, элементов осмотрено: ${stats.elements}, нажатий: ${stats.clicked}`,
);
if (problems.length === 0) {
  console.log("Замечаний нет");
} else {
  const byKind = new Map<string, Problem[]>();
  for (const problem of problems) {
    byKind.set(problem.kind, [...(byKind.get(problem.kind) ?? []), problem]);
  }
  for (const [kind, list] of byKind) {
    console.log(`\n## ${kind} (${list.length})`);
    for (const problem of list.slice(0, 40)) {
      console.log(`  ${problem.view} ${problem.screen}: ${problem.detail}`);
    }
    if (list.length > 40) console.log(`  … и ещё ${list.length - 40}`);
  }
}
console.log(`\nОтчёт: ${out}`);
