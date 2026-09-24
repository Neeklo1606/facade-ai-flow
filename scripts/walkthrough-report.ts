/**
 * Сводка обхода продукта (Q8, ADR-015 с дополнением S4): из отчётов `bun run walkthrough`
 * (папка .walkthrough, по файлу на тему и роль) собирает docs/state/walkthrough.md и контактные
 * листы снимков — docs/state/screens-<тема>-<ширина>.jpg.
 * Запуск: bun run walkthrough:report
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import type { RoleReport } from "../e2e/walkthrough/helpers";
import type { MobileFinding } from "../e2e/walkthrough/mobile.spec";

const IN = process.env["WALK_OUT"] ?? ".walkthrough";
const OUT = "docs/state";
if (!existsSync(IN)) {
  console.error(`Нет отчёта обхода в ${IN}: сначала bun run walkthrough`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const read = <T>(prefix: string) =>
  readdirSync(IN)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(IN, file), "utf8")) as T);

const walks = read<RoleReport>("walk-");
const mobile = read<MobileFinding[]>("mobile-").flat();
const fmt = (n: number) => n.toLocaleString("ru-RU");
const themeLabel: Record<string, string> = { dark: "тёмная", light: "светлая" };
/** Темы, которые реально прошли: отчёт не выдумывает то, чего не запускали */
const themes = [...new Set(walks.map((walk) => walk.theme ?? "dark"))].sort();
const widths = [...new Set(mobile.map((row) => row.width))].sort((a, b) => a - b);
const PHONES = [375, 390, 430];

/** Что считается действием: переход, диалог, изменение экрана, файл, прокрутка, поле ввода */
const effectLabel: Record<string, string> = {
  переход: "переход на другой экран",
  диалог: "открыл диалог или панель",
  "закрыл диалог": "закрыл диалог",
  "изменение экрана": "изменение на экране",
  уведомление: "уведомление",
  "поле ввода": "поле ввода",
  "уже выбрано": "уже выбрано (текущий раздел, выбранная вкладка)",
  "выбор файла": "выбор файла",
  файл: "скачивание файла",
  прокрутка: "прокрутка к нужному месту",
  "прокрутка (вид был уже нужный)": "прокрутка: вид был уже нужный, после сброса вернула его",
  "внешняя ссылка": "ссылка tel: или mailto:",
  недоступна: "недоступна, причина рядом",
  "предел обхода": "предел обхода экрана: остальные элементы — однотипные строки списка",
};

/**
 * На каком коде прогнан обход. Отметку ставит сам обход и кладёт в свой отчёт: снимать её
 * здесь нельзя — сводку пересобирают отдельной командой, и через неделю она проставила бы
 * сегодняшний коммит прогону недельной давности (находка второго круга проверки).
 *
 * Если роли прогнаны на разном коде, отчёт называет все отметки: это и есть признак того,
 * что половина обхода устарела.
 */
/** Когда прогнан обход — по самому позднему отчёту роли, а не по времени сборки сводки */
const ranAt = (() => {
  const dates = walks.map((walk) => walk.at).filter((value): value is string => !!value);
  if (!dates.length) return "неизвестно когда";
  return new Date(dates.sort().at(-1)!).toLocaleDateString("ru-RU");
})();

const stamp = (() => {
  const marks = [...new Set(walks.map((walk) => walk.commit ?? null))];
  const known = marks.filter((mark): mark is string => !!mark).sort();
  const head = (() => {
    try {
      return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  })();
  const notes: string[] = [];
  // Роли прогнаны на разном коде — половина обхода старше другой половины
  if (known.length > 1) {
    notes.push("Роли прогнаны на разном коде: часть обхода старше остальных, нужен общий прогон.");
  }
  // Отметки нет вовсе: старый обход или подложенные данные. Сказать это, а не домысливать
  if (marks.includes(null)) {
    notes.push(
      "У части ролей отметки нет: отчёт сделан обходом до того, как отметку стали ставить — на каком коде он шёл, неизвестно.",
    );
  }
  // Сравнивать с текущим кодом можно, только когда отметка одна и она известна
  if (head && known.length === 1 && known[0] && !known[0].startsWith(head)) {
    notes.push(`Сводка собрана на ${head}: код с тех пор менялся, обход этих правок не видел.`);
  }
  const label = known.length ? known.join(", ") : "без отметки";
  return `${label}.${notes.length ? " " + notes.join(" ") : ""}`;
})();

const lines: string[] = [
  "# Обход продукта: отчёт",
  "",
  "Сгенерировано `bun run walkthrough:report` из отчётов `bun run walkthrough` (ADR-015).",
  `Темы: ${themes.map((theme) => themeLabel[theme] ?? theme).join(", ")}. Ширины: ${widths.join(", ")} px.`,
  `Прогнан ${ranAt} на коммите ${stamp}`,
  "Итог и выводы — в [STATE.md](../STATE.md).",
  "",
  "## Нажатия",
  "",
  "| Тема | Роль | Экранов | Элементов нажато | Тупиков | Ошибок в консоли | Без действия |",
  "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
];
const effects = new Map<string, number>();
const silent: string[] = [];
const disabled: string[] = [];
/** Связи, ведущие в никуда: «Раздел не найден» и «Нет доступа» (ADR-015, дополнение S4) */
const deadLinks: string[] = [];
for (const walk of walks) {
  const dead = walk.pages.filter((page) => page.exits === 0).length;
  const errors = walk.pages.reduce((sum, page) => sum + page.errors.length, 0);
  const none = walk.elements.filter((element) => element.effect.length === 0);
  for (const element of walk.elements) {
    const key = element.effect[0] ?? "без действия";
    if (key.startsWith("переход: ")) {
      deadLinks.push(
        `| ${themeLabel[walk.theme ?? "dark"] ?? walk.theme} | ${walk.role} | \`${element.page}\` | ${element.label || element.signature} | ${key.replace("переход: ", "")} |`,
      );
    }
    effects.set(key, (effects.get(key) ?? 0) + 1);
    if (element.effect[0] === "недоступна") {
      disabled.push(
        `| ${themeLabel[walk.theme ?? "dark"] ?? walk.theme} | ${walk.role} | \`${element.page}\` | ${element.label || "—"} | ${element.note ?? ""} |`,
      );
    }
  }
  for (const element of none) {
    silent.push(
      `| ${themeLabel[walk.theme ?? "dark"] ?? walk.theme} | ${walk.role} | \`${element.page}\` | ${element.label || element.signature} | ${element.note ?? ""} |`,
    );
  }
  lines.push(
    `| ${themeLabel[walk.theme ?? "dark"] ?? walk.theme} | ${walk.role} | ${walk.pages.length} | ${fmt(walk.elements.length)} | ${dead} | ${errors} | ${none.length} |`,
  );
}
lines.push("", "Что произошло после нажатия:", "", "| Результат | Нажатий |", "| --- | ---: |");
for (const [key, count] of [...effects].sort((a, b) => b[1] - a[1])) {
  lines.push(`| ${effectLabel[key] ?? key} | ${fmt(count)} |`);
}
const budget = walks.flatMap((walk) =>
  walk.elements
    .filter((element) => element.effect[0] === "предел обхода")
    .map(
      (element) =>
        `| ${themeLabel[walk.theme ?? "dark"] ?? walk.theme} | ${walk.role} | \`${element.page}\` | ${element.note ?? ""} |`,
    ),
);
lines.push("", "### Экраны, обойдённые не полностью", "");
lines.push(
  ...(budget.length
    ? ["| Тема | Роль | Экран | Сколько нажато |", "| --- | --- | --- | --- |", ...budget]
    : ["Нет: каждый экран обойдён целиком."]),
);
/*
 * Какие экраны обойдены. Без списка по отчёту нельзя проверить, что новый экран в него попал:
 * отчёт перечислял только экраны с находками, и появление справки в нём не читалось никак.
 */
const screens = new Map<string, Set<string>>();
for (const walk of walks) {
  for (const page of walk.pages) {
    if (!screens.has(page.pattern)) screens.set(page.pattern, new Set());
    screens.get(page.pattern)!.add(walk.role);
  }
}
lines.push("", "### Какие экраны обойдены", "");
lines.push(`Всего шаблонов адресов: ${screens.size}. Роли, которым экран доступен:`, "");
lines.push("| Экран | Роли |", "| --- | --- |");
for (const [screen, roles] of [...screens.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`| \`${screen}\` | ${[...roles].sort().join(", ")} |`);
}

lines.push("", "### Ссылки, ведущие в никуда", "");
lines.push(
  ...(deadLinks.length
    ? [
        "| Тема | Роль | Экран | Элемент | Куда привело |",
        "| --- | --- | --- | --- | --- |",
        ...deadLinks,
      ]
    : ["Нет."]),
);
lines.push("", "### Без действия", "");
lines.push(
  ...(silent.length
    ? ["| Тема | Роль | Экран | Элемент | Заметка |", "| --- | --- | --- | --- | --- |", ...silent]
    : ["Нет."]),
);
lines.push("", "### Недоступные элементы", "");
lines.push(
  ...(disabled.length
    ? [
        "| Тема | Роль | Экран | Элемент | Причина |",
        "| --- | --- | --- | --- | --- |",
        ...disabled,
      ]
    : ["Нет."]),
);

lines.push("", "## Ширины экрана", "");
lines.push(
  "Цели нажатия меньше 44 px считаются только на телефонах (375, 390, 430): мышь попадает точнее пальца.",
  "",
  "| Тема | Ширина | Проверок экранов | Переполнение | Цели меньше 44 px | Только по наведению | Фокус за краем | Без пометки демо |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
);
for (const theme of themes) {
  for (const width of widths) {
    const rows = mobile.filter((row) => (row.theme ?? "dark") === theme && row.width === width);
    if (!rows.length) continue;
    const small = PHONES.includes(width)
      ? String(rows.reduce((sum, row) => sum + row.small.length, 0))
      : "—";
    lines.push(
      `| ${themeLabel[theme] ?? theme} | ${width} | ${rows.length} | ${rows.filter((r) => r.overflow.offenders.length).length} | ${small} | ${rows.reduce((s, r) => s + r.hoverOnly.length, 0)} | ${rows.reduce((s, r) => s + r.offscreenCount, 0)} | ${rows.filter((r) => !r.demoMarked).length} |`,
    );
  }
}
const problems = mobile.filter(
  (r) =>
    r.overflow.offenders.length ||
    (PHONES.includes(r.width) && r.small.length) ||
    r.hoverOnly.length ||
    r.offscreenCount ||
    !r.demoMarked,
);
if (problems.length) {
  lines.push("", "Найдено:", "");
  for (const row of problems) {
    lines.push(
      `- ${themeLabel[row.theme ?? "dark"] ?? row.theme}, ${row.role}, ${row.width}, \`${row.page}\`: ${[
        ...row.overflow.offenders,
        ...(PHONES.includes(row.width)
          ? row.small.map((s) => `${s.element} ${s.width}×${s.height}`)
          : []),
        ...row.hoverOnly,
        ...row.offscreenFocusable,
        row.demoMarked ? "" : "нет пометки демонстрации",
      ]
        .filter(Boolean)
        .join("; ")}`,
    );
  }
}
const sheets = themes.flatMap((theme) =>
  [375, 768, 1440]
    .filter((width) => widths.includes(width))
    .map((width) => `[${themeLabel[theme] ?? theme}, ${width}](screens-${theme}-${width}.jpg)`),
);
lines.push("", `Снимки экранов руководителя проекта: ${sheets.join(", ")}.`, "");
writeFileSync(join(OUT, "walkthrough.md"), lines.join("\n"));

// Контактные листы: все снимки ширины на одной картинке, подпись — адрес экрана
const browser = await chromium.launch(
  process.env["PW_CHROMIUM"] ? { executablePath: process.env["PW_CHROMIUM"] } : {},
);
for (const { theme, width } of themes.flatMap((theme) =>
  [375, 768, 1440].map((width) => ({ theme, width })),
)) {
  const dir = resolve(IN, "screens", theme, String(width));
  if (!existsSync(dir)) continue;
  const shots = readdirSync(dir)
    .filter((file) => file.endsWith(".jpg"))
    .sort();
  const cells = shots
    .map(
      (file) =>
        // Страница из setContent не грузит file://, поэтому снимок — прямо в разметке
        `<figure><img src="data:image/jpeg;base64,${readFileSync(join(dir, file)).toString("base64")}"><figcaption>${file.replace(/\.jpg$/, "").replace(/-/g, " ")}</figcaption></figure>`,
    )
    .join("");
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.setContent(
    `<style>body{margin:0;padding:16px;background:${theme === "light" ? "#f4f2ee" : "#111"};font:12px system-ui;color:${theme === "light" ? "#5a544c" : "#bbb"}}
      main{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
      figure{margin:0}img{width:100%;border-radius:8px;display:block}
      figcaption{margin-top:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      h1{font-size:16px;color:${theme === "light" ? "#1c1814" : "#eee"};margin:0 0 12px}</style>
      <h1>neeklo FieldOps · тема ${themeLabel[theme] ?? theme} · ширина ${width} px · экранов: ${shots.length}</h1><main>${cells}</main>`,
    { waitUntil: "load" },
  );
  await page.screenshot({
    path: join(OUT, `screens-${theme}-${width}.jpg`),
    type: "jpeg",
    quality: 70,
    fullPage: true,
  });
  await page.close();
}
await browser.close();
console.log(`Сводка: ${OUT}/walkthrough.md, снимки: ${OUT}/screens-<тема>-<ширина>.jpg`);
