/**
 * Снимки «до» и «после» Сервиса v1 (S0, п. 4; S8): 390 и 1440, светлая и тёмная тема,
 * ключевые экраны трёх модулей и лендинг.
 *
 * Запуск: собрать и поднять сервер (`bun run build`, `PORT=4631 node .output/server/index.mjs`),
 * затем `SHOTS_BASE=http://localhost:4631 SHOTS_OUT=docs/design/service-v1/before bun scripts/service-v1-shots.ts`
 *
 * Роль газа выбирается кнопкой стартового экрана, роль FieldOps — персоной в sessionStorage,
 * как в e2e/fixtures.ts. Снабжение и документы снимаются с флагом прежних модулей: без него
 * их адреса ведут на рабочий экран роли (ADR-038). Перед сохранением текст страницы
 * проверяется на фамилии и улицы из файла заказчика, как в gas-shots.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const base = process.env["SHOTS_BASE"] ?? "http://localhost:4631";
const out = process.env["SHOTS_OUT"] ?? "docs/design/service-v1/before";

interface Shot {
  name: string;
  path: string;
  /** Роль газового контура: testid кнопки на /gas */
  gasRole?: "foreman" | "manager" | "director" | "admin";
  /** Персона FieldOps */
  persona?: string;
}

const SHOTS: Shot[] = [
  { name: "01-landing", path: "/" },
  { name: "02-gas-foreman", path: "/gas/foreman", gasRole: "foreman" },
  { name: "03-gas-moderation", path: "/gas/moderation", gasRole: "manager" },
  { name: "04-gas-entries", path: "/gas/entries", gasRole: "manager" },
  { name: "05-gas-overview", path: "/gas/overview", gasRole: "director" },
  { name: "06-gas-reports", path: "/gas/reports", gasRole: "director" },
  { name: "07-gas-estimates", path: "/gas/estimates", gasRole: "admin" },
  { name: "08-gas-admin", path: "/gas/admin", gasRole: "admin" },
  { name: "09-supply-inbox", path: "/inbox", persona: "e-dorohov" },
  { name: "10-procurement", path: "/projects/p-korona/procurement", persona: "e-dorohov" },
  {
    name: "11-procurement-rfq",
    path: "/projects/p-korona/procurement/sr-323",
    persona: "e-dorohov",
  },
  { name: "12-deliveries", path: "/projects/p-korona/deliveries", persona: "e-gareev" },
  { name: "13-documents", path: "/projects/p-korona/documents", persona: "e-volkova" },
  { name: "14-foreman-today", path: "/today", persona: "e-gareev" },
];

/** Что не должно попасть на снимок: фамилии и улицы из исходного файла (как в gas-shots.ts) */
const FORBIDDEN = [
  "Кусей",
  "Малый",
  "Козык",
  "Сыпченко",
  "Баев",
  "Габдумаликов",
  "Залесский",
  "Вырвин",
  "Липка",
  "Супрун",
  "Должиков",
  "Дзержинск",
  "Благодатн",
  "Ветеринарн",
  "Тоннельн",
  "Партизанск",
];

const VIEWS = [
  { label: "390", width: 390, height: 844 },
  { label: "1440", width: 1440, height: 900 },
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  ...(process.env["PW_CHROMIUM"] ? { executablePath: process.env["PW_CHROMIUM"] } : {}),
});

const problems: string[] = [];
const made: string[] = [];

async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForTimeout(600);
}

for (const theme of ["light", "dark"] as const) {
  for (const view of VIEWS) {
    for (const shot of SHOTS) {
      // Своя вкладка на снимок: роль и персона не протекают между экранами
      const context = await browser.newContext({
        viewport: { width: view.width, height: view.height },
        locale: "ru-RU",
        timezoneId: "Europe/Moscow",
        colorScheme: theme,
      });
      await context.addInitScript(
        ({ persona, mode }) => {
          try {
            localStorage.setItem("neeklo-fieldops-theme", mode);
            sessionStorage.setItem("neeklo-fieldops-legacy", "1");
            if (persona) {
              sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
              sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
              sessionStorage.setItem("neeklo-fieldops-persona", persona);
            }
          } catch {
            // Приватный режим: снимок покажет экран выбора роли
          }
        },
        { persona: shot.persona ?? null, mode: theme },
      );
      const page = await context.newPage();
      const tag = `${shot.name} ${view.label} ${theme}`;
      try {
        if (shot.gasRole) {
          await page.goto(`${base}/gas`, { waitUntil: "domcontentloaded" });
          await page.getByTestId(`gas-role-${shot.gasRole}`).click();
          await settle(page);
        }
        await page.goto(`${base}${shot.path}`, { waitUntil: "domcontentloaded" });
        await settle(page);

        const text = await page.locator("body").innerText();
        const leaked = FORBIDDEN.filter((word) => text.includes(word));
        if (leaked.length > 0) {
          problems.push(`${tag}: ${leaked.join(", ")}`);
          continue;
        }
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        if (scrollWidth > view.width) problems.push(`${tag}: прокрутка вбок ${scrollWidth}`);
        const landed = new URL(page.url()).pathname;
        if (landed !== shot.path) problems.push(`${tag}: адрес ${landed} вместо ${shot.path}`);

        const file = `${out}/${shot.name}-${view.label}-${theme}.jpg`;
        writeFileSync(file, await page.screenshot({ type: "jpeg", quality: 70 }));
        made.push(file);
      } catch (error) {
        problems.push(`${tag}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
      } finally {
        await context.close();
      }
    }
  }
}

await browser.close();

console.log(`Снимков: ${made.length} из ${SHOTS.length * VIEWS.length * 2}`);
if (problems.length > 0) {
  // Замечания не роняют прогон: снимок «до» фиксирует состояние как есть
  console.log("\nЗамечания:");
  for (const problem of problems) console.log(`  ${problem}`);
}
