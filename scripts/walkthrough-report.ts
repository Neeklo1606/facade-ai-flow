/**
 * Сводка обхода продукта (Q8, ADR-015): из отчёта `bun run walkthrough` (папка .walkthrough)
 * собирает docs/state/walkthrough.md и контактные листы снимков экранов на трёх ширинах —
 * docs/state/screens-375.jpg, -390.jpg, -430.jpg.
 * Запуск: bun run walkthrough:report
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
};

const lines: string[] = [
  "# Обход продукта: отчёт",
  "",
  "Сгенерировано `bun run walkthrough:report` из отчёта `bun run walkthrough` (ADR-015).",
  "Итог и выводы — в [STATE.md](../STATE.md).",
  "",
  "## Нажатия",
  "",
  "| Роль | Экранов | Элементов нажато | Тупиков | Ошибок в консоли | Без действия |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
];
const effects = new Map<string, number>();
const silent: string[] = [];
const disabled: string[] = [];
for (const walk of walks) {
  const dead = walk.pages.filter((page) => page.exits === 0).length;
  const errors = walk.pages.reduce((sum, page) => sum + page.errors.length, 0);
  const none = walk.elements.filter((element) => element.effect.length === 0);
  for (const element of walk.elements) {
    const key = element.effect[0] ?? "без действия";
    effects.set(key, (effects.get(key) ?? 0) + 1);
    if (element.effect[0] === "недоступна") {
      disabled.push(
        `| ${walk.role} | \`${element.page}\` | ${element.label || "—"} | ${element.note ?? ""} |`,
      );
    }
  }
  for (const element of none) {
    silent.push(
      `| ${walk.role} | \`${element.page}\` | ${element.label || element.signature} | ${element.note ?? ""} |`,
    );
  }
  lines.push(
    `| ${walk.role} | ${walk.pages.length} | ${fmt(walk.elements.length)} | ${dead} | ${errors} | ${none.length} |`,
  );
}
lines.push("", "Что произошло после нажатия:", "", "| Результат | Нажатий |", "| --- | ---: |");
for (const [key, count] of [...effects].sort((a, b) => b[1] - a[1])) {
  lines.push(`| ${effectLabel[key] ?? key} | ${fmt(count)} |`);
}
lines.push("", "### Без действия", "");
lines.push(
  ...(silent.length
    ? ["| Роль | Экран | Элемент | Заметка |", "| --- | --- | --- | --- |", ...silent]
    : ["Нет."]),
);
lines.push("", "### Недоступные элементы", "");
lines.push(
  ...(disabled.length
    ? ["| Роль | Экран | Элемент | Причина |", "| --- | --- | --- | --- |", ...disabled]
    : ["Нет."]),
);

lines.push("", "## Мобильная версия", "");
lines.push(
  "| Ширина | Проверок экранов | Переполнение | Цели меньше 44 px | Только по наведению | Фокус за краем | Без пометки демо |",
  "| ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
);
for (const width of [375, 390, 430]) {
  const rows = mobile.filter((row) => row.width === width);
  lines.push(
    `| ${width} | ${rows.length} | ${rows.filter((r) => r.overflow.offenders.length).length} | ${rows.reduce((s, r) => s + r.small.length, 0)} | ${rows.reduce((s, r) => s + r.hoverOnly.length, 0)} | ${rows.reduce((s, r) => s + r.offscreenCount, 0)} | ${rows.filter((r) => !r.demoMarked).length} |`,
  );
}
const problems = mobile.filter(
  (r) =>
    r.overflow.offenders.length ||
    r.small.length ||
    r.hoverOnly.length ||
    r.offscreenCount ||
    !r.demoMarked,
);
if (problems.length) {
  lines.push("", "Найдено:", "");
  for (const row of problems) {
    lines.push(
      `- ${row.role}, ${row.width}, \`${row.page}\`: ${[
        ...row.overflow.offenders,
        ...row.small.map((s) => `${s.element} ${s.width}×${s.height}`),
        ...row.hoverOnly,
        ...row.offscreenFocusable,
        row.demoMarked ? "" : "нет пометки демонстрации",
      ]
        .filter(Boolean)
        .join("; ")}`,
    );
  }
}
lines.push(
  "",
  "Снимки экранов руководителя проекта: [375](screens-375.jpg), [390](screens-390.jpg), [430](screens-430.jpg).",
  "",
);
writeFileSync(join(OUT, "walkthrough.md"), lines.join("\n"));

// Контактные листы: все снимки ширины на одной картинке, подпись — адрес экрана
const browser = await chromium.launch(
  process.env["PW_CHROMIUM"] ? { executablePath: process.env["PW_CHROMIUM"] } : {},
);
for (const width of [375, 390, 430]) {
  const dir = resolve(IN, "screens", String(width));
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
    `<style>body{margin:0;padding:16px;background:#111;font:12px system-ui;color:#bbb}
      main{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
      figure{margin:0}img{width:100%;border-radius:8px;display:block}
      figcaption{margin-top:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      h1{font-size:16px;color:#eee;margin:0 0 12px}</style>
      <h1>neeklo FieldOps · ширина ${width} px · экранов: ${shots.length}</h1><main>${cells}</main>`,
    { waitUntil: "load" },
  );
  await page.screenshot({
    path: join(OUT, `screens-${width}.jpg`),
    type: "jpeg",
    quality: 70,
    fullPage: true,
  });
  await page.close();
}
await browser.close();
console.log(`Сводка: ${OUT}/walkthrough.md, снимки: ${OUT}/screens-{375,390,430}.jpg`);
