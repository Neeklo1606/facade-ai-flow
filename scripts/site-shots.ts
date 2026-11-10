/**
 * Снимки продукта для сайта (ADR-067, раздел 7.2): настоящие экраны демо на публичном наборе
 * «Демо-подрядчик», светлая тема, deviceScaleFactor 2. Скрипт проходит путь демо одной
 * вкладкой (учёт времени, снабжение, документы), кадрирует до смыслового блока, прячет
 * тосты и подсказки оболочки и сверяет текст кадра со списком запретов: название заказчика,
 * его населённые пункты и итоги, фамилии и улицы исходного файла. Совпадение роняет скрипт.
 *
 * Выход: public/site/shots/<имя>-<ширина>.webp и .avif (640, 960, 1440) и размеры
 * в src/lib/site/shots.gen.ts. Нужны cwebp, avifenc и ffmpeg (Homebrew).
 *
 * Запуск: сервер демо-сборки, затем `bun run site:shots [адрес]` (по умолчанию :4630).
 * Экран, которого нет, не снимается: причина печатается, сайт покажет живой фрагмент.
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { factReport } from "@/data/mock/fact-report";
import { CUSTOMER_BRAND } from "@/server/customer-data";

const base = (process.argv[2] ?? "http://localhost:4630").replace(/\/+$/, "");
const OUT = "public/site/shots";
const GEN = "src/lib/site/shots.gen.ts";
const WIDTHS = [640, 960, 1440];
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 960 };

/** Фамилии и улицы исходного файла заказчика (тот же список, что в scripts/gas-shots.ts) */
const SURNAMES = [
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

function forbidden(): string[] {
  const list = new Set<string>([
    ...SURNAMES,
    CUSTOMER_BRAND.clientShort,
    CUSTOMER_BRAND.clientShort.toLowerCase(),
  ]);
  for (const object of factReport.objects) if (object.settlement) list.add(object.settlement);
  const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const total = factReport.grandTotal.total.amount;
  if (total) {
    list.add(String(total));
    list.add(grouped(total));
  }
  return [...list].filter((word) => word.length >= 3);
}
const FORBIDDEN = forbidden();
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

/** Что прячется на кадре: тосты, подсказки тура, кнопка помощника, полоса показа */
const HIDE_CSS = `
  [data-sonner-toaster], [data-gas-tour], [data-testid="tour-card"], [data-testid="tour-paused"],
  [data-testid="assistant-open"], [data-testid="guide-show"], [data-testid="gas-start-show"],
  [data-gas-show-dock], nav[aria-label="Основные разделы"] { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; transition: none !important; animation: none !important; }
`;

const sizes: Record<string, { w: number; h: number; widths: number[] }> = {};
const skipped: string[] = [];
const work = mkdtempSync(join(tmpdir(), "site-shots-"));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: DESKTOP,
  deviceScaleFactor: 2,
  locale: "ru-RU",
  timezoneId: "Europe/Moscow",
  colorScheme: "light",
  reducedMotion: "reduce",
});
await context.addInitScript(() => {
  try {
    localStorage.setItem("neeklo-fieldops-theme", "light");
    // Тур первого входа закрыл бы экран подсказкой
    localStorage.setItem(
      "gaika-tour-seen",
      JSON.stringify(["foreman", "manager", "director", "prorab", "supply", "pto", "admin"]),
    );
    // Снабжение и ПТО в публичном демо за флагом (ADR-061): на сайте их открывает плитка /demo
    sessionStorage.setItem("gaika-gas-only", "0");
  } catch {
    // без хранилища снимки всё равно снимутся, но с подсказками
  }
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);

async function open(path: string) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("html[data-booted]", { timeout: 60_000 });
  await page.waitForTimeout(300);
}

async function role(label: string) {
  await page.getByRole("button", { name: /^Вы: / }).filter({ visible: true }).first().click();
  const list = page.getByRole("list", { name: "Роли" });
  if (!(await list.isVisible())) await page.getByRole("button", { name: /^Сменить роль/ }).click();
  await list.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  await page.waitForTimeout(600);
}

async function pick(label: string, option: RegExp) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: option }).click();
}

function encode(id: string, png: string, pxWidth: number, pxHeight: number) {
  const widths = WIDTHS.filter((w) => w <= pxWidth);
  if (!widths.length) widths.push(pxWidth);
  for (const w of widths) {
    const scaled = join(work, `${id}-${w}.png`);
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      png,
      "-vf",
      `scale=${w}:-2:flags=lanczos`,
      scaled,
    ]);
    execFileSync("cwebp", [
      "-quiet",
      "-q",
      "82",
      "-m",
      "6",
      scaled,
      "-o",
      `${OUT}/${id}-${w}.webp`,
    ]);
    execFileSync(
      "avifenc",
      ["--speed", "6", "-q", "62", "--jobs", "4", scaled, `${OUT}/${id}-${w}.avif`],
      {
        stdio: "ignore",
      },
    );
  }
  sizes[id] = { w: Math.round(pxWidth / 2), h: Math.round(pxHeight / 2), widths };
}

/** Кадр смыслового блока: прокрутить к нему, отрезать по высоте окна, проверить текст */
async function shoot(id: string, target: Locator, maxHeight: number, pad = 0) {
  // Тосты и подсказки прячутся только на время кадра: шаги пути ждут текст тостов
  const hide = await page.addStyleTag({ content: HIDE_CSS });
  try {
    await frame(id, target, maxHeight, pad);
  } finally {
    await hide.evaluate((el) => (el as HTMLElement).remove());
  }
}

async function frame(id: string, target: Locator, maxHeight: number, pad: number) {
  // Кольцо фокуса поля ввода на снимок не попадает
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await target.first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -16));
  await page.waitForTimeout(250);
  const text = plain(await target.first().innerText());
  const leaked = FORBIDDEN.filter((word) => text.includes(word));
  if (leaked.length) throw new Error(`${id}: на кадре данные заказчика: ${leaked.join(", ")}`);
  const box = (await target.first().boundingBox())!;
  const viewport = page.viewportSize()!;
  // Поле вокруг блока без своих отступов: текст не прилипает к краю кадра
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const clip = {
    x,
    y,
    width: Math.min(box.width + 2 * pad, viewport.width - x),
    height: Math.min(box.height + 2 * pad, maxHeight, viewport.height - y),
  };
  const png = join(work, `${id}.png`);
  writeFileSync(png, await page.screenshot({ clip }));
  encode(id, png, Math.round(clip.width * 2), Math.round(clip.height * 2));
  console.log(`снимок ${id}: ${Math.round(clip.width)} x ${Math.round(clip.height)}`);
}

async function step(id: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    skipped.push(`${id}: ${String(error).split("\n")[0]}`);
    console.warn(`пропущен ${id}: ${String(error).split("\n")[0]}`);
  }
}

const main = () => page.locator("main").first();

// Учёт времени: бригадир на телефоне, менеджер, руководитель и табель на компьютере
await page.setViewportSize(PHONE);
await open("/gas");
await step("time-brigade", async () => {
  await role("Бригадир");
  await page.waitForURL(/\/gas\/brigade/);
  await shoot("time-brigade", main(), 760);
});
await page.setViewportSize(DESKTOP);
await step("time-review", async () => {
  await role("Менеджер проверки");
  await page.waitForURL(/\/gas\/moderation/);
  await page.locator("[data-queue-card]").first().waitFor();
  await shoot("time-review", main(), 820);
});
await step("time-tabel", async () => {
  await open("/gas/tabel");
  await page.getByRole("grid").first().waitFor();
  await shoot("time-tabel", main(), 760);
});
await step("time-week", async () => {
  await role("Руководитель");
  await page.waitForURL(/\/gas\/week/);
  await page.waitForTimeout(800);
  await shoot("time-week", main(), 820);
});

// Документы до поставки: пакет с тем, чего не хватает, и карточка акта
const ACT = /АОСР №\s1(?!\d)/;
await step("docs-package", async () => {
  await role("ПТО");
  await page.waitForURL(/\/gas\/docs$/);
  await page.getByRole("list", { name: "Предложенные акты" }).waitFor();
  await shoot("docs-package", main(), 820);
});
await step("docs-act", async () => {
  await page.getByRole("button", { name: "Создать черновики актов" }).click();
  await page
    .getByText(/Черновиков создано/)
    .first()
    .waitFor();
  await page.getByRole("button", { name: ACT }).first().click();
  await page.getByRole("list", { name: "Чего не хватает" }).waitFor();
  await shoot("docs-act", main(), 820);
  await page.getByRole("button", { name: "Отправить на проверку" }).click();
});

// Снабжение: заявка прораба, предложения, приёмка, сводка руководителя
let number = "";
await page.setViewportSize(PHONE);
await step("supply-request", async () => {
  await role("Прораб");
  await page.waitForURL(/\/gas\/site/);
  await page.getByRole("button", { name: "Новая заявка" }).click();
  await page.getByLabel("Что нужно").fill("труба вгп 20 50 метров к пятнице");
  await page.getByRole("button", { name: "Разобрать текст" }).click();
  const draft = page.getByRole("region", { name: "Позиции черновика" });
  await draft.waitFor();
  const sheet = page.getByRole("dialog").filter({ has: draft });
  await shoot("supply-request", (await sheet.count()) ? sheet : draft, 760, 16);
  await page.getByRole("button", { name: "Проверить" }).click();
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  const heading = await page.getByRole("heading", { name: /Заявка ЗК-\d+ принята/ }).textContent();
  number = /ЗК-\d+/.exec(heading ?? "")![0];
  await page.getByRole("button", { name: "Готово" }).click();
});
await page.setViewportSize(DESKTOP);
await step("supply-offers", async () => {
  if (!number) throw new Error("нет заявки прораба");
  await role("Снабженец");
  await page.waitForURL(/\/gas\/supply$/);
  await page
    .getByRole("button", { name: new RegExp(number) })
    .first()
    .click();
  await page.getByRole("button", { name: "Взять в работу" }).click();
  await page.getByRole("button", { name: "Запросить предложения" }).click();
  for (const [supplier, price, days] of [
    [/^Поставщик А/, "210", "5"],
    [/^Поставщик Б/, "200", "2"],
  ] as const) {
    await pick("Поставщик", supplier);
    await page.getByLabel("Цена за м, ₽: Труба стальная ВГП 20 мм").fill(price);
    await page.getByLabel("Срок поставки, дней").fill(days);
    await page.getByRole("button", { name: "Добавить предложение" }).click();
    await page.getByText("Предложение внесено").first().waitFor();
  }
  await page.waitForTimeout(6500);
  const compare = page.getByRole("list", { name: "Сравнение предложений" });
  await compare.waitFor();
  // Кадр: обе карточки сравнения без формы ввода ниже
  await shoot("supply-offers", compare, 760, 24);
  await compare
    .getByRole("listitem")
    .filter({ hasText: "Поставщик Б" })
    .getByRole("button", { name: "Выбрать: Поставщик Б" })
    .click();
  await page.getByRole("button", { name: "Отметить заказано" }).click();
  await page.getByLabel("Ожидаемая дата доставки").fill("2026-10-08");
  await page.getByRole("button", { name: "Отметить в пути" }).click();
  await page.getByText("ожидается 08.10.2026", { exact: true }).waitFor();
});
await page.setViewportSize(PHONE);
await step("supply-receive", async () => {
  if (!number) throw new Error("нет заявки прораба");
  await role("Прораб");
  await page.getByRole("button", { name: `Принять поставку ${number}` }).click();
  await page.getByLabel("Привезли, м").fill("48");
  await page
    .locator("label", { hasText: "Сертификат или паспорт" })
    .locator("input[type=file]")
    .setInputFiles({
      name: "сертификат_ВГП20.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });
  await page.getByLabel("Расхождение").fill("Не довезли 2 м трубы");
  await page.waitForTimeout(400);
  const form = page.getByRole("dialog").last();
  await shoot("supply-receive", (await form.count()) ? form : main(), 780);
  await page.getByRole("button", { name: "Принять с расхождением" }).click();
  await page.getByText(`Поставка ${number} принята с расхождением`).first().waitFor();
});
await page.setViewportSize(DESKTOP);
await step("supply-overview", async () => {
  await role("Руководитель");
  await open("/gas/supply-overview");
  await page.waitForTimeout(600);
  await shoot("supply-overview", main(), 820);
});

// Документы после поставки: материалы с сертификатом, подпись, реестр
await step("docs-materials", async () => {
  await role("ПТО");
  await open("/gas/materials");
  await page.getByText("Сертификат есть").first().waitFor();
  await shoot("docs-materials", main(), 760);
});
await step("docs-registry", async () => {
  await open("/gas/docs");
  await page.getByRole("button", { name: ACT }).first().click();
  await page.getByText("Полный", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Передать на подпись" }).click();
  await page
    .locator("label", { hasText: "Загрузить скан подписанного" })
    .locator("input[type=file]")
    .setInputFiles({
      name: "АОСР-1_скан.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });
  await page.getByText("Подписан", { exact: true }).first().waitFor();
  await open("/gas/docs-registry");
  await page.getByRole("button", { name: "Закрыть реестр версией" }).click();
  await page.getByText("Реестр закрыт: версия 1").first().waitFor();
  await page.waitForTimeout(6500);
  await shoot("docs-registry", main(), 560);
});

await browser.close();
rmSync(work, { recursive: true, force: true });

const entries = Object.keys(sizes)
  .sort()
  .map((id) => {
    const s = sizes[id]!;
    return `  "${id}": { w: ${s.w}, h: ${s.h}, widths: [${s.widths.join(", ")}] },`;
  });
writeFileSync(
  GEN,
  [
    "/**",
    " * Размеры снимков продукта в public/site/shots (ADR-067, раздел 7.2). Файл пишет",
    " * `bun run site:shots`, руками не править. Нет строки: снимка нет, сайт показывает живой",
    " * фрагмент.",
    " */",
    "export const SHOT_SIZES: Record<string, { w: number; h: number; widths: readonly number[] }> = {",
    ...entries,
    "};",
    "",
  ].join("\n"),
);
console.log(`\nснимков: ${Object.keys(sizes).length}, пропущено: ${skipped.length}`);
for (const line of skipped) console.log(`  ${line}`);
