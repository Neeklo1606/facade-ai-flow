import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, type Browser, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

/**
 * П8 после перезапуска процесса сервера (ADR-086). Первая фаза — server-pilot.spec.ts
 * с P8_STATE_DIR: путь пилота до Excel и сохранённые сессии. Здесь новый процесс сервера
 * на той же базе и том же каталоге файлов: сессии живы, запись принята, исходный файл
 * сметы отдаётся теми же байтами, Excel с той же суммой. Затем «Люди и вход»: ссылка
 * на 72 часа, вход по ней, отзыв доступа закрывает сессию.
 *
 * Запуск только из scripts/check-server-p8.ts: он поднимает базу, сервер и перезапускает его.
 */

const DIR = process.env["P8_STATE_DIR"];
if (!DIR) throw new Error("Задайте P8_STATE_DIR: запуск из scripts/check-server-p8.ts");
const state = JSON.parse(readFileSync(join(DIR, "state.json"), "utf8")) as {
  number: string;
  address: string;
};

async function as(browser: Browser, role: string): Promise<Page> {
  const context = await browser.newContext({
    storageState: join(DIR!, `${role}.json`),
    viewport: { width: 1440, height: 900 },
  });
  return context.newPage();
}

test.describe.configure({ timeout: 180_000 });

test("после перезапуска сервера: сессии, запись, файл сметы, Excel на месте", async ({
  browser,
}) => {
  // Менеджер: сессия из базы, запись в списке и принята
  const manager = await as(browser, "manager");
  await manager.goto("/gas/entries");
  await expect(manager).not.toHaveURL(/\/login/);
  await expect(manager.locator("main")).toContainText(state.number);

  // Исходный файл сметы из мастера: опись в базе, байты в каталоге, сумма совпадает
  const fileId = process.env["P8_FILE_ID"];
  const fileSha = process.env["P8_FILE_SHA"];
  expect(fileId, "опись исходного файла сметы в gas_estimate_files").toBeTruthy();
  const res = await manager.request.get(`/api/gas/estimate-files?file=${fileId}`);
  expect(res.status()).toBe(200);
  expect(
    createHash("sha256")
      .update(await res.body())
      .digest("hex"),
  ).toBe(fileSha);

  // Бригадир: сессия жива, денег не видит
  const foreman = await as(browser, "foreman");
  await foreman.goto("/gas/foreman");
  await expect(foreman).not.toHaveURL(/\/login/);
  await expect(foreman.locator('[data-tour="bot"]')).not.toContainText("₽");

  // Руководитель: Excel из базы с той же суммой
  const director = await as(browser, "director");
  await director.goto("/gas/tabel");
  await director.locator('[data-tour="export"]').click();
  const [download] = await Promise.all([
    director.waitForEvent("download"),
    director.getByRole("menuitem", { name: /Excel утверждённый/ }).click(),
  ]);
  const path = join(tmpdir(), `p8-out-${process.pid}.xlsx`);
  await download.saveAs(path);
  const book = XLSX.read(readFileSync(path));
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets["Записи"]!, {
    header: 1,
    raw: true,
  });
  const head = rows[0]!.map(String);
  const row = rows.find((r) => r[0] === state.number);
  expect(row, `строка ${state.number}`).toBeTruthy();
  expect(row![head.indexOf("Объект")]).toBe(state.address);
  expect(Number(row![head.indexOf("Сумма начислений")])).toBe(105_000);

  // Администратор: «Люди и вход» — ссылка на 72 часа и отзыв доступа
  const admin = await as(browser, "admin");
  await admin.goto("/gas/admin");
  const people = admin.getByRole("region", { name: "Люди и вход" });
  await expect(people.getByRole("list", { name: "Люди учёта времени" })).toContainText(
    "Петров Илья",
  );
  const form = people.getByRole("form", { name: "Добавить человека" });
  await form.getByLabel("Имя и фамилия").fill("Сидорова Анна");
  await form.getByLabel("Телефон").fill("+7 921 000-00-09");
  await form.getByRole("button", { name: "Добавить и выдать ссылку" }).click();
  const link = await people.getByTestId("access-link").inputValue();
  expect(link).toMatch(/\/login\?invite=\w+/);
  await expect(people.getByTestId("access-link-box")).toContainText("72 часа");

  const invited = await (await browser.newContext()).newPage();
  await invited.goto(link);
  await invited.getByRole("button", { name: "Войти по приглашению" }).click();
  await invited.waitForURL(/\/gas/);
  await expect(invited.getByText("Учёт времени недоступен")).toHaveCount(0);

  await admin.reload();
  const row2 = people.getByRole("listitem").filter({ hasText: "Сидорова Анна" });
  await expect(row2).toContainText("Входил");
  await row2.getByRole("button", { name: "Отозвать доступ" }).click();
  await row2.getByRole("button", { name: "Да, отозвать" }).click();
  await expect(row2).toContainText("Доступ отозван");

  // Сессия отозванного гаснет на сервере: следующий заход ведёт на вход
  await invited.goto("/gas");
  await expect(invited).toHaveURL(/\/login/);
  // Ссылка второй раз не срабатывает
  const again = await (await browser.newContext()).newPage();
  await again.goto(link);
  await again.getByRole("button", { name: "Войти по приглашению" }).click();
  await expect(again).not.toHaveURL(/\/gas($|\/)/);
});
