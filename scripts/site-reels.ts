/**
 * Ролики «как работает внутри» для главной (ADR-083): пять коротких записей экрана телефона
 * 390 x 844 на настоящем демо, публичный набор «Демо-подрядчик», светлая тема. Каждый сценарий
 * проходит по шагам, как человек: касание, пауза, следующий экран. Тосты и подсказки тура
 * спрятаны, текст каждого кадра сверяется со списком запретов site-shots (данные заказчика).
 *
 * Выход: public/site/reels/<имя>.mp4 (H.264, без звука, 30 к/с) и постер
 * <имя>.webp (первый осмысленный кадр). Размеры и длительность в src/lib/site/reels.gen.ts.
 *
 * Запуск: сервер демо-сборки, затем `bun run site:reels [адрес]` (по умолчанию :4630).
 * Нужен ffmpeg с libx264 и cwebp (Homebrew). Сценарий, который упал, не пишется:
 * причина печатается, на сайте вместо ролика останется снимок.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { factReport } from "@/data/mock/fact-report";
import { CUSTOMER_BRAND } from "@/server/customer-data";

const base = (process.argv[2] ?? "http://localhost:4630").replace(/\/+$/, "");
const only = process.argv[3];
const OUT = "public/site/reels";
const GEN = "src/lib/site/reels.gen.ts";
const PHONE = { width: 390, height: 844 };

const SURNAMES = ["Кусей", "Малый", "Козык", "Сыпченко", "Баев", "Габдумаликов", "Залесский"];
const FORBIDDEN = [
  ...SURNAMES,
  CUSTOMER_BRAND.clientShort,
  ...factReport.objects.map((object) => object.settlement).filter(Boolean),
].filter((word): word is string => Boolean(word) && word!.length >= 3);

const HIDE_CSS = `
  [data-sonner-toaster], [data-gas-tour], [data-testid="tour-card"], [data-testid="tour-paused"],
  [data-testid="assistant-open"], [data-testid="guide-show"], [data-testid="gas-start-show"],
  [data-gas-show-dock] { display: none !important; }
  * { caret-color: transparent !important; }
`;

/** Мягкий курсор-касание: кружок там, куда нажали, гаснет за 450 мс */
const TOUCH_JS = `
  addEventListener("pointerdown", (event) => {
    const dot = document.createElement("div");
    dot.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:999px;background:rgba(243,113,75,.35);border:2px solid rgba(243,113,75,.8);transition:opacity .45s,transform .45s;left:" + event.clientX + "px;top:" + event.clientY + "px";
    document.body.appendChild(dot);
    requestAnimationFrame(() => { dot.style.opacity = "0"; dot.style.transform = "scale(1.6)"; });
    setTimeout(() => dot.remove(), 500);
  }, true);
`;

type Reel = { id: string; run: (page: Page, s: Steps) => Promise<void> };
type Steps = {
  open: (path: string) => Promise<void>;
  /** Начать запись: до этого кадры не пишутся (вход, выбор роли) */
  start: () => Promise<void>;
  role: (label: string) => Promise<void>;
  tap: (target: Parameters<Page["getByRole"]>[1] & { role?: "button" | "link" }) => Promise<void>;
  pause: (ms?: number) => Promise<void>;
  type: (label: string, text: string) => Promise<void>;
  check: () => Promise<void>;
};

const DEMO_ESTIMATE = "tests/fixtures/estimates/grand-b.xlsx";

const REELS: Reel[] = [
  {
    id: "estimate",
    async run(page, s) {
      await s.open("/gas");
      await s.role("Администратор");
      await s.open("/gas/overview");
      await s.start();
      await s.pause(900);
      await page.getByTestId("estimate-flow-open").click();
      await s.pause(700);
      // Обезличенная ГРАНД-смета из фикстур: шапка, разделы, материалы, трудозатраты
      await page.getByTestId("estimate-flow-input").setInputFiles(DEMO_ESTIMATE);
      await page.getByTestId("estimate-flow-checks").waitFor({ timeout: 20_000 });
      await s.pause(1400);
      const flow = page.getByTestId("estimate-flow");
      await flow.getByTestId("estimate-section").first().click();
      await s.pause(1600);
      await flow.getByTestId("estimate-flow-next").click();
      await s.pause(800);
      await flow.getByTestId("estimate-create-object").click();
      await s.pause(500);
      const address = flow.getByRole("textbox", { name: "Адрес или название" });
      await address.fill("");
      await address.pressSequentially("ул. Ореховая, 6", { delay: 40 });
      const number = flow.getByRole("textbox", { name: "Номер объекта" });
      await number.fill("");
      await number.pressSequentially("ОБ-206", { delay: 40 });
      await s.pause(800);
      await flow.getByTestId("estimate-create-confirm").click();
      await s.pause(1000);
      await flow
        .getByRole("combobox", { name: "Всем разделам одну бригаду" })
        .selectOption({ label: "Бригада 1" });
      await s.pause(1600);
      await s.check();
    },
  },
  {
    id: "voice",
    async run(page, s) {
      await s.open("/gas");
      await s.role("Бригадир");
      await s.open("/gas/foreman");
      const bot = page.locator('[data-tour="bot"]');
      await bot.getByText("Добрый день").first().waitFor();
      await s.start();
      await s.pause(900);
      const current = bot.locator("[data-stage]");
      await current.getByRole("button", { name: "Внести время" }).click();
      await s.pause(700);
      await current.getByRole("button", { name: "Сказать голосом" }).click();
      await s.pause(2200);
      await current.getByRole("button", { name: "Готово" }).click();
      await bot.getByTestId("bot-total").first().waitFor({ timeout: 10_000 });
      await s.pause(2200);
      await current.getByRole("button", { name: "Отправить", exact: true }).click();
      await s.pause(1800);
      await s.check();
    },
  },
  {
    id: "tabel",
    async run(page, s) {
      await s.open("/gas");
      await s.role("Менеджер проверки");
      await s.open("/gas/moderation");
      await s.start();
      await s.pause(1200);
      await s.check();
      // Проверка записи: принять первую в очереди
      const accept = page.getByRole("button", { name: /^Принять/ }).first();
      if (await accept.isVisible().catch(() => false)) {
        await accept.click();
        await s.pause(1200);
      }
      await s.open("/gas/tabel");
      await s.pause(1500);
      await page.mouse.wheel(0, 260);
      await s.pause(1200);
      await page.mouse.wheel(0, -260);
      await s.pause(600);
      await s.role("Руководитель");
      await s.pause(2200);
      await page.mouse.wheel(0, 300);
      await s.pause(1400);
      await s.check();
    },
  },
  {
    id: "supply",
    async run(page, s) {
      await s.open("/gas/site");
      await s.role("Прораб");
      await s.start();
      await s.pause(900);
      await page.getByRole("button", { name: "Новая заявка" }).click();
      await s.pause(500);
      await s.type("Что нужно", "труба вгп 20 50 метров к пятнице");
      await page.getByRole("button", { name: "Разобрать текст" }).click();
      await page.getByRole("region", { name: "Позиции черновика" }).waitFor();
      await s.pause(1800);
      await page.getByRole("button", { name: "Проверить" }).click();
      await s.pause(900);
      await page.getByRole("button", { name: "Отправить заявку" }).click();
      const heading = await page
        .getByRole("heading", { name: /Заявка ЗК-\d+ принята/ })
        .textContent();
      const number = /ЗК-\d+/.exec(heading ?? "")![0];
      await s.pause(1200);
      await page.getByRole("button", { name: "Готово" }).click();
      await s.role("Снабженец");
      await s.pause(900);
      await page
        .getByRole("button", { name: new RegExp(number) })
        .first()
        .click();
      await s.pause(1000);
      await page.getByRole("button", { name: "Взять в работу" }).click();
      await s.pause(700);
      await page.getByRole("button", { name: "Запросить предложения" }).click();
      await s.pause(1600);
      await s.check();
    },
  },
  {
    id: "docs",
    async run(page, s) {
      await s.open("/gas");
      await s.role("ПТО");
      await s.start();
      await s.pause(1200);
      await page.getByRole("button", { name: "Создать черновики актов" }).click();
      await s.pause(1200);
      await page
        .getByRole("button", { name: /АОСР №\s1(?!\d)/ })
        .first()
        .click();
      await s.pause(1600);
      await page.mouse.wheel(0, 360);
      await s.pause(1500);
      await page.mouse.wheel(0, 360);
      await s.pause(1500);
      await s.check();
    },
  },
];

async function record(browser: Browser, reel: Reel, dir: string) {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("neeklo-fieldops-theme", "light");
      localStorage.setItem(
        "gaika-tour-seen",
        JSON.stringify(["foreman", "manager", "director", "prorab", "supply", "pto", "admin"]),
      );
      sessionStorage.setItem("gaika-gas-only", "0");
    } catch {
      // без хранилища ролик запишется с подсказками
    }
  });
  await context.addInitScript(TOUCH_JS);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  // Кадры экрана через CDP: у каждого метка времени, ffmpeg склеит их с настоящими паузами
  const cdp = await context.newCDPSession(page);
  const frames: { file: string; at: number; cut?: boolean }[] = [];
  let recording = false;
  cdp.on("Page.screencastFrame", (frame) => {
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined);
    if (!recording) return;
    const file = join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(frame.data, "base64"));
    frames.push({ file, at: Date.now() / 1000 });
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 88,
    maxWidth: PHONE.width * 2,
    maxHeight: PHONE.height * 2,
    everyNthFrame: 1,
  });
  const hide = async () => {
    await page.addStyleTag({ content: HIDE_CSS }).catch(() => undefined);
  };
  page.on("load", () => void hide());
  let started = false;
  /** Продолжить запись после входа или смены роли: свежий кадр, прошлый держится 0,3 с */
  const resume = async () => {
    if (!started) return;
    const file = join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, await page.screenshot({ type: "jpeg", quality: 88 }));
    frames.push({ file, at: Date.now() / 1000, cut: true });
    recording = true;
  };
  const steps: Steps = {
    async start() {
      started = true;
      await resume();
    },
    async open(path) {
      recording = false;
      await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("html[data-booted]", { timeout: 60_000 });
      await hide();
      await page.waitForTimeout(400);
      await page.waitForTimeout(500);
      await resume();
    },
    async role(label) {
      recording = false;
      await page.getByRole("button", { name: /^Вы: / }).filter({ visible: true }).first().click();
      const list = page.getByRole("list", { name: "Роли" });
      if (!(await list.isVisible()))
        await page.getByRole("button", { name: /^Сменить роль/ }).click();
      await page.waitForTimeout(350);
      await list.getByRole("button", { name: new RegExp(`^${label}`) }).click();
      await page.waitForTimeout(1200);
      await hide();
      await resume();
    },
    async tap({ role = "button", ...options }) {
      await page.getByRole(role, options).first().click();
    },
    pause: (ms = 800) => page.waitForTimeout(ms),
    async type(label, text) {
      await page.getByLabel(label).pressSequentially(text, { delay: 35 });
    },
    async check() {
      const text = (await page.locator("body").innerText()).replace(/[\u00a0\u202f]/g, " ");
      const leaked = FORBIDDEN.filter((word) => text.includes(word));
      if (leaked.length)
        throw new Error(`${reel.id}: в кадре данные заказчика: ${leaked.join(", ")}`);
    },
  };
  try {
    await reel.run(page, steps);
    await page.waitForTimeout(400);
  } catch (error) {
    await page
      .screenshot({ path: join(tmpdir(), `site-reel-${reel.id}-fail.png`) })
      .catch(() => undefined);
    throw error;
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => undefined);
    await context.close();
  }
  if (frames.length < 10) throw new Error(`${reel.id}: кадров ${frames.length}`);
  // Список для concat: каждый кадр держится до следующего
  const lines: string[] = [];
  frames.forEach((frame, index) => {
    const next = frames[index + 1];
    const hold = !next ? 0.6 : next.cut ? 0.3 : Math.max(1 / 60, next.at - frame.at);
    lines.push(`file '${frame.file}'`, `duration ${hold.toFixed(4)}`);
  });
  lines.push(`file '${frames.at(-1)!.file}'`);
  const list = join(dir, "frames.txt");
  writeFileSync(list, lines.join("\n"));
  return { list };
}

function encode(id: string, list: string) {
  const ff = (args: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
  const trim = ["-f", "concat", "-safe", "0", "-i", list];
  const scale = "scale=780:-2:flags=lanczos";
  ff([
    ...trim,
    "-an",
    "-vf",
    `${scale},fps=30,format=yuv420p`,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-crf",
    "26",
    "-preset",
    "slow",
    "-movflags",
    "+faststart",
    `${OUT}/${id}.mp4`,
  ]);
  const poster = join(tmpdir(), `${id}-poster.png`);
  ff(["-ss", "1.2", "-i", `${OUT}/${id}.mp4`, "-frames:v", "1", poster]);
  execFileSync("cwebp", ["-quiet", "-q", "80", poster, "-o", `${OUT}/${id}.webp`]);
  const seconds = Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      `${OUT}/${id}.mp4`,
    ])
      .toString()
      .trim(),
  );
  return Math.round(seconds * 10) / 10;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const durations: Record<string, number> = {};
const failed: string[] = [];
for (const reel of REELS) {
  if (only && reel.id !== only) continue;
  const dir = mkdtempSync(join(tmpdir(), `site-reel-${reel.id}-`));
  try {
    const { list } = await record(browser, reel, dir);
    durations[reel.id] = encode(reel.id, list);
    console.log(`ролик ${reel.id}: ${durations[reel.id]} с`);
  } catch (error) {
    failed.push(reel.id);
    console.error(`ролик ${reel.id} не записан: ${(error as Error).message.split("\n")[0]}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
await browser.close();

if (!only) {
  writeFileSync(
    GEN,
    `// Сгенерировано scripts/site-reels.ts. Не править руками.\n` +
      `export const REEL_SECONDS: Record<string, number> = ${JSON.stringify(durations, null, 2)};\n`,
  );
}
if (failed.length) process.exitCode = 1;
