import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, type Browser, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

/**
 * Живой прогон рабочего контура (ADR-069): сборка `server`, PostgreSQL, вход по ссылкам.
 * Не входит в `bun run ci`: нужен запущенный сервер и пустая база с командами пилота.
 * Порядок и переменные — docs/runbook/pilot.md, раздел «Проверка перед пилотом».
 *
 * Ссылки приглашений приходят переменными окружения: PILOT_ADMIN, PILOT_MANAGER,
 * PILOT_DIRECTOR. Ссылку бригадира прогон заводит сам после импорта бригад: PILOT_FOREMAN_CMD
 * не нужен, команда db:gas-user зовётся тем же окружением базы.
 */

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Задайте ${name}: ссылку приглашения из db:gas-init / db:gas-user`);
  return value;
};

const xlsxRows = (name: string, rows: (string | number | null)[][]) => {
  const path = join(tmpdir(), `pilot-${name}-${process.pid}.xlsx`);
  execFileSync("bun", ["run", "e2e/xlsx-rows.cli.ts", path, JSON.stringify(rows)]);
  return path;
};

const estimateFile = () => {
  const path = join(tmpdir(), `pilot-estimate-${process.pid}.xlsx`);
  execFileSync("bun", ["run", "e2e/gas-estimate-file.cli.ts", path, "--extras"]);
  return path;
};

const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });

/** Войти по ссылке в своём окне: у каждого человека своя сессия */
async function signIn(browser: Browser, link: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(link);
  await page.getByRole("button", { name: "Войти по приглашению" }).click();
  await page.waitForURL(/\/gas/);
  await expect(page.getByText("Учёт времени недоступен")).toHaveCount(0);
  return page;
}

const ADDRESS = "ст. Северная, ул. Пилотная, 300";
const todayRu = (() => {
  const day = new Intl.DateTimeFormat("ru-RU", {
    timeZone: process.env["APP_TIME_ZONE"] || "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
  return day;
})();

test.describe.configure({ timeout: 240_000 });

test("рабочий контур: вход по ссылкам, пустая компания, путь до Excel", async ({ browser }) => {
  // Без входа: причина и кнопка входа, а не демо-цифры
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/gas");
  await expect(anon).toHaveURL(/\/login/);

  // 1. Администратор: пустая компания, бригады и сотрудники из Excel
  const admin = await signIn(browser, env("PILOT_ADMIN"));
  await expect(admin.locator("body")).not.toContainText("Демо-подрядчик");
  await admin.goto("/gas/directory");
  await admin.getByRole("button", { name: "Бригады из Excel" }).click();
  await admin.getByTestId("directory-file-brigades").setInputFiles(
    xlsxRows("brigades", [
      ["Бригада", "Бригадир", "Телефон"],
      ["Бригада 1", "Петров Илья", "+7 921 000-00-03"],
    ]),
  );
  await expect(admin.getByTestId("import-check")).toContainText("Добавится 1", { timeout: 15_000 });
  await admin.getByRole("button", { name: "Всё верно, применить" }).click();
  await expect(admin.getByText("Бригады: добавлено 1")).toBeVisible();

  // Бригадир заводится командой пилота: бригада уже в справочнике
  const out = execFileSync(
    "bun",
    [
      "run",
      "db:gas-user",
      "--name",
      "Петров Илья",
      "--phone",
      "+79210000003",
      "--role",
      "foreman",
      "--brigade",
      "Бригада 1",
      "--url",
      process.env["PILOT_URL"] ?? "http://localhost:4700",
    ],
    { encoding: "utf8" },
  );
  const foremanLink = /https?:\/\/\S+invite=\S+/.exec(out)?.[0];
  expect(foremanLink, out).toBeTruthy();

  // 2. Менеджер: объект, график на сегодня, смета, формула
  const manager = await signIn(browser, env("PILOT_MANAGER"));
  await manager.goto("/gas/objects");
  await manager.getByRole("button", { name: "Добавить объект" }).click();
  const sheet = manager.getByRole("dialog", { name: "Новый объект" });
  await sheet.getByLabel("Адрес").fill(ADDRESS);
  await sheet.getByLabel("Номер объекта").fill("ОБ-300");
  await sheet.getByLabel("Вид работ").fill("котел");
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(manager.getByText("Объект добавлен: ОБ-300").first()).toBeVisible();
  await manager.getByRole("button", { name: "Загрузить график недели" }).click();
  await manager.getByTestId("schedule-file").setInputFiles(
    xlsxRows("schedule", [
      ["Объект", "Номер", "Бригада", "Дата"],
      [ADDRESS, "ОБ-300", "Бригада 1", todayRu],
    ]),
  );
  await expect(manager.getByTestId("import-check")).toContainText("Все строки прочитаны: 1");
  await manager.getByRole("button", { name: "Всё верно, применить" }).click();
  await expect(toast(manager, "График применён: строк 1")).toBeVisible();

  await manager.goto("/gas/estimates");
  await manager.getByRole("button", { name: "Загрузить смету" }).click();
  await manager.getByTestId("estimate-file").setInputFiles(estimateFile());
  await manager.getByRole("button", { name: "Всё верно, применить" }).click();
  const parsed = manager.getByTestId("estimate-parsed");
  await expect(parsed).toBeVisible({ timeout: 15_000 });
  await parsed.getByRole("button", { name: "Выбрать объект" }).click();
  await manager
    .getByRole("dialog")
    .last()
    .getByRole("button")
    .filter({ hasText: "ОБ-300" })
    .first()
    .click();
  await parsed.getByRole("button", { name: "Замечания проверены" }).click();
  await manager.getByRole("button", { name: "Подтвердить смету" }).click();
  await expect(toast(manager, /Смета подтверждена: 100\s000\s₽/)).toBeVisible();
  await manager.getByRole("button", { name: "Настроить", exact: true }).click();
  await manager
    .getByTestId("rule-term-extra:Технадзор")
    .getByRole("radio", { name: "плюс" })
    .click();
  await manager.getByRole("button", { name: "Сохранить редакцию" }).click();
  await expect(manager.getByTestId("cost-rule-formula")).toHaveText(
    "Всего без НДС плюс технадзор минус материалы",
  );

  // 3. Бригадир в боте: объект по графику, время фразой; денег не видит
  const foreman = await signIn(browser, foremanLink!);
  await foreman.goto("/gas/foreman");
  const bot = foreman.locator('[data-tour="bot"]');
  const current = bot.locator("[data-stage]");
  await current.getByRole("button", { name: "Внести время" }).click();
  await current.getByRole("button", { name: /Пилотная, 300/ }).click();
  await current.getByRole("button", { name: /^Сегодня/ }).click();
  const message = foreman.getByLabel("Сообщение боту: объект, день и время одной фразой");
  await message.fill("с 8 до 17");
  await message.press("Enter");
  await current.getByRole("button", { name: "Верно" }).click();
  await current.getByRole("button", { name: /^60 мин/ }).click();
  await expect(current.getByTestId("bot-total")).toHaveText("480 мин = 8,00 ч");
  await expect(bot).not.toContainText("₽");
  await current.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(current).toContainText(/Отправлено\. Запись ГЗ-\d{5} ждёт проверки/);
  const number = /ГЗ-\d{5}/.exec(await current.innerText())![0];

  // 4. Менеджер принимает: стоимость из сметы с источником
  await manager.goto("/gas/moderation");
  const card = manager.locator("[data-queue-card]").filter({ hasText: number });
  await card.click();
  const cost = manager.getByRole("region", { name: "Стоимость" }).filter({ visible: true });
  await expect(cost).toContainText(/105\s000\s₽/);
  await manager.locator('[data-tour="review-confirm"]:visible').click();
  await expect(toast(manager, "Принято")).toBeVisible();

  // 5. Руководитель: Excel из базы с контрольной суммой
  const director = await signIn(browser, env("PILOT_DIRECTOR"));
  await director.goto("/gas/tabel");
  await director.locator('[data-tour="export"]').click();
  const [download] = await Promise.all([
    director.waitForEvent("download"),
    director.getByRole("menuitem", { name: /Excel утверждённый/ }).click(),
  ]);
  const path = join(tmpdir(), `pilot-out-${process.pid}.xlsx`);
  await download.saveAs(path);
  const book = XLSX.read(readFileSync(path));
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets["Записи"]!, {
    header: 1,
    raw: true,
  });
  const head = rows[0]!.map(String);
  const row = rows.find((r) => r[0] === number);
  expect(row, `строка ${number}`).toBeTruthy();
  expect(row![head.indexOf("Объект")]).toBe(ADDRESS);
  expect(Number(row![head.indexOf("Сумма начислений")])).toBe(105_000);
  // В файле только данные этой компании: демо-объектов нет
  expect(rows.length).toBe(2);

  // Записи пережили перезагрузку: они в базе, а не во вкладке
  await manager.reload();
  await manager.goto("/gas/entries");
  await expect(manager.locator("main")).toContainText(number);
});
