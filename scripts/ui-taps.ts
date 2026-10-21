/**
 * Базовая линия касаний (ADR-045 «Финальный интерфейс», шаг V0): сколько нажатий занимает
 * каждый сценарий на телефоне 390. Дальше каждый шаг сверяется с этой таблицей: касаний
 * не больше, чем было.
 *
 * Запуск по демо-серверу:
 *   UI_METRICS_BASE=http://localhost:4699 UI_METRICS_OUT=before bun scripts/ui-taps.ts
 *
 * Считается каждое нажатие человека: кнопка, строка списка, пункт меню, сдвиг ползунка.
 * Ожидания и проверки текста касаниями не считаются. Отчёт: docs/design/ui-taps-<out>.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";

const base = process.env["UI_METRICS_BASE"] ?? "http://localhost:4699";
const label = process.env["UI_METRICS_OUT"] ?? "before";

interface Flow {
  key: string;
  title: string;
  /** Что считаем: от какого действия до какого */
  span: string;
  persona?: string;
  run: (page: Page, tap: (target: Locator) => Promise<void>) => Promise<void>;
}

const stage = (page: Page) => page.locator('[data-tour="bot"] [data-stage]');
const answer = (page: Page, name: string | RegExp) =>
  stage(page)
    .getByRole("button", typeof name === "string" ? { name, exact: true } : { name })
    .first();
const card = (page: Page, number: string) =>
  page.locator("[data-queue-card]", { hasText: number }).first();

async function foreman(page: Page) {
  await page.getByRole("button", { name: /^Вы: / }).first().click();
  await page
    .getByRole("list", { name: "Роли" })
    .getByRole("button", { name: /^Бригадир/ })
    .click();
  await page.waitForURL(/\/gas\/foreman/);
}

const FLOWS: Flow[] = [
  {
    key: "gas-bot",
    title: "Бот бригадира: ОБ-200, сегодня, 12:00-14:30, без перерыва",
    span: "после «Внести время» до «Отправить» включительно",
    run: async (page, tap) => {
      await page.goto(`${base}/gas`);
      await page.waitForSelector("html[data-booted]");
      await foreman(page);
      await answer(page, "Внести время").click();
      await tap(answer(page, /ул\. Демо, 200/));
      await tap(answer(page, /^Сегодня, 03\.10/));
      await tap(answer(page, "12:00"));
      await tap(answer(page, "14:30"));
      await tap(answer(page, /^0 мин/));
      await tap(answer(page, "Отправить"));
      await stage(page)
        .getByText(/принята, ждёт проверки/)
        .waitFor();
    },
  },
  {
    key: "gas-confirm",
    title: "Проверка: подтвердить запись ГЗ-00096",
    span: "из очереди до тоста «Подтверждено»",
    run: async (page, tap) => {
      await page.goto(`${base}/gas/moderation`);
      await page.waitForSelector("html[data-booted]");
      await tap(card(page, "ГЗ-00096"));
      await tap(page.locator('[data-tour="review-confirm"]:visible').first());
      await page.locator("[data-sonner-toast]", { hasText: "Подтверждено" }).waitFor();
    },
  },
  {
    key: "gas-reject",
    title: "Проверка: отклонить ГЗ-00098 с причиной",
    span: "из очереди до тоста «Отклонено»",
    run: async (page, tap) => {
      await page.goto(`${base}/gas/moderation`);
      await page.waitForSelector("html[data-booted]");
      await tap(card(page, "ГЗ-00098"));
      await tap(page.getByRole("button", { name: "Ещё действия" }).first());
      await tap(page.getByRole("menuitem", { name: "Отклонить" }));
      await tap(page.getByRole("button", { name: "Дубль записи" }));
      await page.locator("[data-sonner-toast]", { hasText: "Отклонено" }).waitFor();
    },
  },
  {
    key: "gas-clarify",
    title: "Проверка: вернуть ГЗ-00098 на уточнение с причиной",
    span: "из очереди до тоста",
    run: async (page, tap) => {
      await page.goto(`${base}/gas/moderation`);
      await page.waitForSelector("html[data-booted]");
      await tap(card(page, "ГЗ-00098"));
      await tap(page.getByRole("button", { name: /на уточнение/i }).first());
      await tap(page.getByRole("button", { name: "Уточните объект" }));
      await page.locator("[data-sonner-toast]").first().waitFor();
    },
  },
  {
    key: "gas-batch",
    title: "Проверка: подтвердить все без замечаний",
    span: "из очереди до тоста",
    run: async (page, tap) => {
      await page.goto(`${base}/gas/moderation`);
      await page.waitForSelector("html[data-booted]");
      await tap(page.getByRole("button", { name: /Подтвердить все/ }).first());
      const dialog = page.getByRole("alertdialog");
      if (await dialog.isVisible().catch(() => false)) {
        await tap(dialog.getByRole("button", { name: /^Подтвердить/ }).first());
      }
      await page.locator("[data-sonner-toast]", { hasText: "Подтверждено" }).waitFor();
    },
  },
  {
    key: "gas-show",
    title: "Показ /gas от стартового экрана до «Готово»",
    span: "от «Пройти показ» до экрана финала",
    run: async (page, tap) => {
      await page.goto(`${base}/gas`);
      await page.waitForSelector("html[data-booted]");
      const dock = page.locator("[data-gas-show-dock]:visible, [data-gas-show-inline]:visible");
      await tap(page.getByRole("button", { name: /Пройти показ/ }));
      await page.waitForURL(/\/gas\/foreman/);
      await tap(answer(page, "Внести время"));
      await tap(answer(page, /ул\. Демо, 200/));
      await tap(answer(page, /^Сегодня, 03\.10/));
      await tap(answer(page, /^12:00/));
      await tap(answer(page, /^14:30/));
      await tap(answer(page, /^0 мин/));
      await tap(answer(page, "Отправить"));
      await tap(dock.getByRole("button", { name: /Как менеджер проверки/ }).first());
      await page.waitForURL(/\/gas\/moderation/);
      await tap(page.locator('[data-tour="review-confirm"]:visible').first());
      await tap(dock.getByRole("button", { name: /Как руководитель/ }).first());
      await page.waitForURL(/\/gas\/reports/);
      const download = page.waitForEvent("download");
      await tap(page.locator('[data-tour="export"]:visible').first());
      await download;
      await tap(dock.getByRole("button", { name: /Итог показа/ }).first());
      await page.waitForURL(/\/gas\/finish/);
    },
  },
  {
    key: "gaika-canon",
    title: "Канон ГАЙКИ: три сценария от экрана входа до итогов",
    span: "от плитки «Смена → учёт» до «Итоги показа», без просмотра источников, со скачиванием двух файлов ПТО",
    run: async (page, tap) => {
      await page.goto(`${base}/`);
      await page.waitForSelector("html[data-booted]");
      const strip = page.getByRole("region", { name: "Подсказки по сценарию" });
      const instant = page.getByRole("button", { name: "Показать сразу" });
      const capture = async () => {
        await tap(page.getByRole("button", { name: /Удерживайте, чтобы говорить/ }));
        await tap(page.getByRole("button", { name: "Показать без микрофона" }));
        await tap(page.getByRole("button", { name: "Готово" }));
        if (await instant.isVisible().catch(() => false)) await tap(instant);
        await page.getByRole("button", { name: "Верно" }).last().waitFor({ timeout: 15_000 });
        await tap(page.getByRole("button", { name: "Верно" }).last());
      };
      await tap(page.getByRole("button", { name: /Смена → учёт/ }));
      await page.waitForURL(/\/capture/);
      await capture();
      await tap(page.getByRole("button", { name: "Дальше по сценарию" }));
      await page.waitForURL(/\/today/);
      await tap(strip.getByRole("button", { name: /Дальше: ПТО → документ/ }));
      await page.waitForURL(/\/check/);
      await tap(page.locator("main article").first().getByRole("button", { name: "Принять" }));
      // Шаг ПТО засчитывается двумя файлами: сводка смены и черновик ведомости
      for (const name of ["Скачать сводку смены", "Скачать черновик ведомости"]) {
        const file = page.waitForEvent("download");
        await tap(page.getByRole("button", { name }));
        await file;
      }
      await tap(strip.getByRole("button", { name: /Дальше: Объект → снабжение/ }));
      await page.waitForURL(/\/capture/);
      await capture();
      await tap(page.getByRole("button", { name: "Дальше по сценарию" }));
      await page.waitForURL(/\/inbox/);
      const request = page.getByRole("listitem").filter({ hasText: "Кронштейн несущий" }).first();
      await request.getByRole("slider", { name: "Сдвиньте, чтобы принять" }).press("End");
      await tapCount.add();
      await tap(strip.getByRole("button", { name: /Глазами: прораб/ }));
      await tap(strip.getByRole("button", { name: "Итоги показа" }));
      await page.getByRole("heading", { name: "Вы прошли три сценария" }).waitFor();
    },
  },
];

/** Счётчик для жестов, которые не являются кликом (сдвиг ползунка) */
const tapCount = { value: 0, add: async () => void (tapCount.value += 1) };

async function measure(browser: Browser, flow: Flow) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("neeklo-fieldops-theme", "light");
    } catch {
      // без хранилища считаем всё равно
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  tapCount.value = 0;
  const tap = async (target: Locator) => {
    if (process.env["UI_TAPS_DEBUG"]) console.log(`  ${tapCount.value + 1}: ${String(target)}`);
    await target.click();
    tapCount.value += 1;
  };
  try {
    await flow.run(page, tap);
    return { taps: tapCount.value, error: null as string | null };
  } catch (error) {
    return { taps: tapCount.value, error: String(error).split("\n")[0]!.slice(0, 200) };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  ...(process.env["PW_CHROMIUM"] ? { executablePath: process.env["PW_CHROMIUM"] } : {}),
});
const rows: string[] = [];
const json: Record<string, { taps: number; error: string | null }> = {};
const only = process.env["UI_METRICS_ONLY"]?.split(",").filter(Boolean) ?? null;
for (const flow of FLOWS) {
  if (only && !only.includes(flow.key)) continue;
  const result = await measure(browser, flow);
  json[flow.key] = result;
  console.log(`${flow.key}: ${result.taps}${result.error ? ` (ошибка: ${result.error})` : ""}`);
  rows.push(
    `| ${flow.title} | ${flow.span} | ${result.error ? `не дошёл: ${result.error}` : result.taps} |`,
  );
}
await browser.close();

mkdirSync("docs/design", { recursive: true });
writeFileSync(join("docs/design", `ui-taps-${label}.json`), `${JSON.stringify(json, null, 2)}\n`);
writeFileSync(
  join("docs/design", `ui-taps-${label}.md`),
  `# Касания по сценариям: ${label}

Скрипт \`scripts/ui-taps.ts\`, телефон 390x844, светлая тема, ${new Date().toISOString().slice(0, 10)}.
Считается каждое нажатие человека. Следующие шаги не должны увеличивать эти числа.

| Сценарий | Что считаем | Касаний |
|---|---|---|
${rows.join("\n")}
`,
);
console.log(`Отчёт: docs/design/ui-taps-${label}.md`);
