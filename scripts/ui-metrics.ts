/**
 * Замер масштаба и плотности интерфейса (ADR-045 «Финальный интерфейс», шаги V0 и V11).
 *
 * Запуск по собранному демо-серверу:
 *   NITRO_PRESET=node-server bun run build && PORT=4699 node .output/server/index.mjs &
 *   UI_METRICS_BASE=http://localhost:4699 UI_METRICS_OUT=before bun scripts/ui-metrics.ts
 *
 * Для каждого маршрута ГАЙКИ, /gas и /office на 390x844 и 1440x900 (deviceScaleFactor 3),
 * в обеих темах:
 * - вычисленный font-size всех видимых текстов и распределение по размерам;
 * - высота шапки и расстояние от верха до первого контентного блока;
 * - высота фиксированных слоёв внизу (fixed и sticky у нижнего края);
 * - сколько карточек или строк списка целиком помещается в первый экран;
 * - пересечения кнопок и ссылок контента с фиксированными слоями;
 * - число мест с тенью, размытием фона и градиентом;
 * - число крупных чисел (текст от 24 px с цифрами).
 *
 * UI_METRICS_WIDTHS=390 ограничивает ширины, UI_METRICS_ONLY=gas-moderation,gas-entries — маршруты.
 *
 * Отчёт: docs/design/ui-metrics-<out>.md и .json, снимки первого экрана docs/design/<out>/*.png.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const base = process.env["UI_METRICS_BASE"] ?? "http://localhost:4699";
const label = process.env["UI_METRICS_OUT"] ?? "before";
const only = process.env["UI_METRICS_ONLY"]?.split(",").filter(Boolean) ?? null;
const shotsDir = join("docs/design", label);
const WIDTHS = (process.env["UI_METRICS_WIDTHS"] ?? "390,1440")
  .split(",")
  .map(Number)
  .filter(Boolean);
const HINTS_SEEN = process.env["UI_METRICS_HINTS"] !== "first";
const HINT_SCREENS = [
  "moderation",
  "entries",
  "reports",
  "brigades",
  "objects",
  "estimates",
  "employees",
  "summary",
  "admin",
  "guide",
  "questions",
  "start",
  "foreman",
  "finish",
];
const viewFor = (width: number) => ({ width, height: width < 768 ? 844 : 900 });

type Theme = "light" | "dark";

interface Route {
  key: string;
  path: string;
  /** Персона ГАЙКИ: без неё открывается экран входа */
  persona?: string;
  /** Действие после открытия: роль газа, шторка, карточка */
  then?: (page: Page) => Promise<void>;
  /** Только телефон: шторка «Ещё» есть лишь у нижней панели */
  phoneOnly?: boolean;
}

async function gasRole(page: Page, label: string) {
  // Телефон: аватар в шапке, компьютер: строка роли в сайдбаре
  const width = page.viewportSize()?.width ?? 390;
  await page
    .getByRole("button", { name: width < 1024 ? /^Вы: / : /Вы смотрите как/ })
    .first()
    .click();
  await page
    .getByRole("list", { name: "Роли" })
    .getByRole("button", { name: new RegExp(`^${label}`) })
    .click();
  await page.waitForTimeout(600);
}

const ROUTES: Route[] = [
  // ГАЙКА
  { key: "gaika-entry", path: "/" },
  { key: "gaika-today", path: "/today", persona: "e-gareev" },
  { key: "gaika-capture", path: "/capture", persona: "e-gareev" },
  { key: "gaika-check", path: "/check", persona: "e-volkova" },
  { key: "gaika-inbox", path: "/inbox", persona: "e-dorohov" },
  { key: "gaika-projects-manager", path: "/projects", persona: "e-sokolov" },
  { key: "gaika-projects-supply", path: "/projects", persona: "e-dorohov" },
  { key: "gaika-project", path: "/projects/p-korona", persona: "e-sokolov" },
  { key: "gaika-attention", path: "/attention", persona: "e-sokolov" },
  {
    key: "gaika-more",
    phoneOnly: true,
    path: "/today",
    persona: "e-gareev",
    then: async (page) => {
      await page.getByRole("button", { name: /^Ещё/ }).click();
      await page.waitForTimeout(500);
    },
  },
  // Газ
  { key: "gas-start", path: "/gas" },
  {
    key: "gas-foreman",
    path: "/gas/moderation",
    then: async (page) => {
      await gasRole(page, "Бригадир");
    },
  },
  { key: "gas-moderation", path: "/gas/moderation" },
  { key: "gas-entry-card", path: "/gas/moderation?open=mk-2" },
  {
    // Карточка записи при идущем показе: так её снимал владелец (refs/01-03)
    key: "gas-entry-card-show",
    path: "/gas/moderation?open=mk-2",
    then: async (page) => {
      await page.evaluate(() => {
        sessionStorage.setItem(
          "neeklo-fieldops-guide",
          JSON.stringify({
            scenarioId: "gas-week",
            stepIndex: 2,
            status: { "gas-enter": "done", "gas-send": "done" },
            collapsed: false,
            closed: false,
            finished: [],
            chain: { gasEntryId: "mk-2" },
          }),
        );
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("html[data-booted]", { timeout: 60_000 });
      await page.waitForTimeout(1200);
    },
  },
  { key: "gas-entries", path: "/gas/entries" },
  { key: "gas-reports", path: "/gas/reports" },
  { key: "gas-brigades", path: "/gas/brigades" },
  { key: "gas-objects", path: "/gas/objects" },
  { key: "gas-estimates", path: "/gas/estimates" },
  { key: "gas-employees", path: "/gas/employees" },
  { key: "gas-summary", path: "/gas/summary" },
  { key: "gas-admin", path: "/gas/admin" },
  { key: "gas-guide", path: "/gas/guide" },
  { key: "gas-questions", path: "/gas/questions" },
  { key: "gas-finish", path: "/gas/finish" },
  {
    key: "gas-more",
    phoneOnly: true,
    path: "/gas/moderation",
    then: async (page) => {
      await page
        .getByRole("navigation", { name: "Основные разделы" })
        .getByRole("button", { name: "Ещё" })
        .click();
      await page.waitForTimeout(500);
    },
  },
  // Кабинет
  { key: "office", path: "/office", persona: "e-sokolov" },
  { key: "office-catalogs", path: "/office/catalogs", persona: "e-sokolov" },
  { key: "office-connections", path: "/office/connections", persona: "e-sokolov" },
];

interface Measure {
  route: string;
  theme: Theme;
  width: number;
  url: string;
  fonts: Record<string, number>;
  textNodes: number;
  avgFont: number;
  maxFont: number;
  headerHeight: number;
  contentTop: number;
  firstUsefulTop: number;
  bottomLayers: { name: string; height: number; top: number }[];
  bottomCoverage: number;
  itemsInFirstScreen: number;
  overlaps: string[];
  shadows: number;
  blurs: number;
  gradients: number;
  bigNumbers: number;
}

/** Всё, что считается в браузере: одна функция, чтобы до и после мерились одинаково */
function measureInPage(): Omit<Measure, "route" | "theme" | "url" | "width"> {
  const vh = window.innerHeight;
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    if (el.closest(".sr-only,[aria-hidden='true']")) return false;
    return true;
  };

  // Шрифты: элементы, у которых есть собственный непустой текстовый узел
  const fonts: Record<string, number> = {};
  let sum = 0;
  let count = 0;
  let max = 0;
  for (const el of document.body.querySelectorAll("*")) {
    const own = [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
    );
    if (!own || !visible(el)) continue;
    const size = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
    const key = String(size);
    fonts[key] = (fonts[key] ?? 0) + 1;
    sum += size;
    count += 1;
    max = Math.max(max, size);
  }

  // Шапка: первая видимая шапка у верхнего края
  const header = [...document.querySelectorAll("header")].find(
    (h) => visible(h) && h.getBoundingClientRect().top < 4,
  );
  const headerHeight = header ? Math.round(header.getBoundingClientRect().height) : 0;

  // Начало контента и первый полезный элемент: карточка, строка, кнопка, поле, таблица
  const main = document.querySelector("main") ?? document.body;
  const inMain = [...main.querySelectorAll("*")].filter(visible);
  const contentTop = Math.round(
    Math.min(...inMain.map((el) => el.getBoundingClientRect().top).filter((t) => t >= 0), vh),
  );
  const useful = inMain.filter((el) => {
    // Подсказка экрана и полоса показа не считаются полезным содержимым (раздел 6)
    if (
      el.closest(
        "[aria-label='Что делать здесь'],[aria-label='Как работать с экраном'],[aria-label='Подсказки по сценарию'],[data-gas-show-dock],[data-gas-show-inline],[data-show-strip]",
      )
    )
      return false;
    return (
      el.matches(
        "[data-queue-card],[data-report-row],table,li,[class*='card'],input,textarea,[role='button'],button,a[href]",
      ) && el.getBoundingClientRect().height >= 32
    );
  });
  const firstUsefulTop = Math.round(
    Math.min(...useful.map((el) => el.getBoundingClientRect().top).filter((t) => t >= 0), vh),
  );

  // Фиксированные слои у нижнего края: fixed или sticky, нижний край в нижних 40 % экрана
  const layers: { el: Element; name: string; top: number; height: number }[] = [];
  for (const el of document.body.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    if (s.position !== "fixed" && s.position !== "sticky") continue;
    // Липкое к верху (шапка таблицы, полоса дней, панель деталей) нижним слоем не является
    if (s.position === "sticky" && s.bottom === "auto") continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < vh * 0.6 || r.top > vh || r.height > vh * 0.9) continue;
    // Вложенный слой внутри уже учтённого не считаем отдельно
    if (layers.some((l) => l.el.contains(el))) continue;
    const name =
      el.getAttribute("aria-label") ??
      el.getAttribute("data-gas-show-dock") ??
      (el.textContent ?? el.tagName).trim().replace(/\s+/g, " ").slice(0, 32);
    layers.push({ el, name, top: Math.round(r.top), height: Math.round(r.height) });
  }
  const bottomCoverage = layers.length ? Math.round(vh - Math.min(...layers.map((l) => l.top))) : 0;

  // Сколько карточек или строк целиком видно до первого нижнего слоя
  const limit = layers.length ? Math.min(...layers.map((l) => l.top)) : vh;
  const items = inMain.filter((el) => {
    if (
      !el.matches(
        "[data-queue-card],[data-report-row],tbody tr,li,[class*='card-v3'],[class*='widget-card']",
      )
    )
      return false;
    const r = el.getBoundingClientRect();
    if (r.height < 40) return false;
    // Только самые внешние: карточка внутри карточки не считается
    const parentItem = el.parentElement?.closest(
      "[data-queue-card],[data-report-row],tbody tr,li,[class*='card-v3'],[class*='widget-card']",
    );
    if (parentItem && main.contains(parentItem)) return false;
    return r.top >= 0 && r.bottom <= limit;
  });

  // Тени, размытие, градиенты и крупные числа: только видимое в первом экране
  let shadows = 0;
  let blurs = 0;
  let gradients = 0;
  let bigNumbers = 0;
  for (const el of document.body.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) continue;
    const s = getComputedStyle(el);
    // Тень: внешняя с размытием. Линии внутренней тенью (inset 0 1px 0) и кольца фокуса не тени
    const casts = (s.boxShadow || "none").split(/,(?![^(]*\))/).some((part) => {
      if (part.includes("inset") || part.trim() === "none") return false;
      const lengths = [...part.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
      return (lengths[2] ?? 0) > 0;
    });
    if (casts) shadows += 1;
    const blur =
      s.backdropFilter || (s as unknown as Record<string, string>)["webkitBackdropFilter"];
    if (blur && blur !== "none") blurs += 1;
    if (s.backgroundImage.includes("gradient")) gradients += 1;
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("");
    if (/\d/.test(own) && parseFloat(s.fontSize) >= 24) bigNumbers += 1;
  }

  /*
   * Пересечения кнопок и ссылок со слоями после прокрутки до самого низа (ADR-045, 2.6):
   * элемент, который и в конце прокрутки остаётся под слоем, недоступен. Строки списка,
   * которые уходят под панель в середине прокрутки, — это нормальная прокрутка, не дефект.
   */
  const scrollers = [
    document.scrollingElement,
    ...document.querySelectorAll("main, [data-review-sheet], [role='dialog']"),
  ].filter((el): el is Element => !!el && el.scrollHeight > el.clientHeight + 1);
  for (const el of scrollers) el.scrollTop = el.scrollHeight;
  const overlaps: string[] = [];
  const scope = document.querySelector("[data-review-sheet],[role='dialog']") ?? main;
  for (const el of scope.querySelectorAll("button,a[href],input,[role='button']")) {
    if (!visible(el)) continue;
    if (layers.some((l) => l.el.contains(el))) continue;
    const r = el.getBoundingClientRect();
    for (const l of layers) {
      const lr = l.el.getBoundingClientRect();
      const x = Math.min(r.right, lr.right) - Math.max(r.left, lr.left);
      const y = Math.min(r.bottom, lr.bottom) - Math.max(r.top, lr.top);
      if (x > 4 && y > 4 && r.top < vh) {
        overlaps.push(
          `${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 30)} ↔ ${l.name}`,
        );
      }
    }
  }

  return {
    fonts,
    textNodes: count,
    avgFont: count ? Math.round((sum / count) * 10) / 10 : 0,
    maxFont: max,
    headerHeight,
    contentTop,
    firstUsefulTop,
    bottomLayers: layers.map(({ name, top, height }) => ({ name, top, height })),
    bottomCoverage,
    itemsInFirstScreen: items.length,
    overlaps: [...new Set(overlaps)].slice(0, 12),
    shadows,
    blurs,
    gradients,
    bigNumbers,
  };
}

const browser = await chromium.launch({
  ...(process.env["PW_CHROMIUM"] ? { executablePath: process.env["PW_CHROMIUM"] } : {}),
});
mkdirSync(shotsDir, { recursive: true });
const results: Measure[] = [];

for (const width of WIDTHS)
  for (const theme of ["light", "dark"] as Theme[]) {
    for (const route of ROUTES) {
      if (only && !only.includes(route.key)) continue;
      const phone = width < 768;
      if (route.phoneOnly && !phone) continue;
      const context = await browser.newContext({
        viewport: viewFor(width),
        deviceScaleFactor: phone ? 3 : 1,
        isMobile: phone,
        hasTouch: phone,
        colorScheme: theme,
        locale: "ru-RU",
        timezoneId: "Europe/Moscow",
      });
      await context.addInitScript(
        ({ persona, theme, hintsSeen, HINT_SCREENS }) => {
          try {
            localStorage.setItem("neeklo-fieldops-theme", theme);
            /*
             * Подсказки экранов по умолчанию уже видены: так экран выглядит каждый день, и по нему
             * считается порог раздела 6. UI_METRICS_HINTS=first — как при первом посещении.
             */
            if (hintsSeen) {
              for (const screen of HINT_SCREENS)
                localStorage.setItem(`neeklo-hint-gas-${screen}`, "1");
            }
            // Подсказки «Что делать здесь» видны раскрытыми, как при первом посещении
            if (persona) {
              sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
              sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
              sessionStorage.setItem("neeklo-fieldops-persona", persona);
            }
          } catch {
            // без хранилища замер всё равно идёт
          }
        },
        { persona: route.persona ?? null, theme, hintsSeen: HINTS_SEEN, HINT_SCREENS },
      );
      const page = await context.newPage();
      try {
        await page.goto(`${base}${route.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForSelector("html[data-booted]", { timeout: 60_000 });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(700);
        if (route.then) await route.then(page);
        // Снимок первого экрана до замера: замер в конце прокручивает экран вниз
        await page.screenshot({
          path: join(shotsDir, `${route.key}-${width}-${theme}.jpg`),
          scale: "css",
          type: "jpeg",
          quality: 80,
        });
        const data = await page.evaluate(measureInPage);
        results.push({ route: route.key, theme, width, url: route.path, ...data });
        console.log(
          `${width} ${theme} ${route.key}: шапка ${data.headerHeight}, контент ${data.contentTop}, полезное ${data.firstUsefulTop}, низ ${data.bottomCoverage}, в экране ${data.itemsInFirstScreen}, ср. шрифт ${data.avgFont}, макс ${data.maxFont}, пересечений ${data.overlaps.length}, тени ${data.shadows}, размытие ${data.blurs}, градиенты ${data.gradients}, крупных чисел ${data.bigNumbers}`,
        );
      } catch (error) {
        console.log(`${width} ${theme} ${route.key}: ошибка ${String(error).slice(0, 160)}`);
      }
      await context.close();
    }
  }
await browser.close();

writeFileSync(
  join("docs/design", `ui-metrics-${label}.json`),
  `${JSON.stringify(results, null, 2)}\n`,
);

const rows = results.map(
  (r) =>
    `| ${r.route} | ${r.width} | ${r.theme} | ${r.headerHeight} | ${r.contentTop} | ${r.firstUsefulTop} | ${r.bottomCoverage} | ${r.bottomLayers.length} | ${r.itemsInFirstScreen} | ${r.avgFont} | ${r.maxFont} | ${r.overlaps.length} | ${r.shadows} | ${r.blurs} | ${r.gradients} | ${r.bigNumbers} |`,
);
const totals: Record<string, number> = {};
for (const r of results.filter((x) => x.theme === "light" && x.width < 768))
  for (const [size, n] of Object.entries(r.fonts)) totals[size] = (totals[size] ?? 0) + n;
const dist = Object.entries(totals)
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .map(([size, n]) => `| ${size} px | ${n} |`);
const overlapLines = results
  .filter((r) => r.overlaps.length)
  .map((r) => `- ${r.route} ${r.width} (${r.theme}): ${r.overlaps.join("; ")}`);
const layerLines = results
  .filter((r) => r.theme === "light" && r.width < 768 && r.bottomLayers.length)
  .map((r) => `- ${r.route}: ${r.bottomLayers.map((l) => `${l.name} ${l.height}`).join(" + ")}`);

writeFileSync(
  join("docs/design", `ui-metrics-${label}.md`),
  `# Замер интерфейса: ${label}

Скрипт \`scripts/ui-metrics.ts\`, ширины ${WIDTHS.join(" и ")} (телефон 390x844, deviceScaleFactor 3), обе темы, ${new Date().toISOString().slice(0, 10)}.
Единицы: CSS px при ширине 390 (= pt). Снимки первого экрана: \`docs/design/${label}/\`.

- **Шапка**: высота первой шапки у верхнего края.
- **Контент**: верх первого видимого элемента в main.
- **Полезное**: верх первой карточки, строки, кнопки или поля (без подсказки «Что делать здесь»
  и без полосы показа).
- **Низ**: сколько высоты экрана снизу закрыто фиксированными слоями; **слоёв**: их число.
- **В экране**: карточек или строк списка целиком до первого нижнего слоя.
- **Тени, размытие, градиенты**: видимые в первом экране элементы с внешней тенью с размытием
  (линии внутренней тенью и кольца не считаются), backdrop-filter,
  background-image с градиентом. **Крупных чисел**: тексты от 24 px с цифрами.

| Маршрут | Ширина | Тема | Шапка | Контент | Полезное | Низ | Слоёв | В экране | Ср. шрифт | Макс. шрифт | Пересечений | Тени | Размытие | Градиенты | Крупных чисел |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

## Распределение размеров текста (телефон, светлая тема, все маршруты)

| Размер | Элементов |
|---|---|
${dist.join("\n")}

## Нижние слои (телефон, светлая тема)

${layerLines.join("\n") || "нет"}

## Пересечения кнопок со слоями

${overlapLines.join("\n") || "нет"}
`,
);
console.log(`Отчёт: docs/design/ui-metrics-${label}.md`);
