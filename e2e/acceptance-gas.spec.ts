import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Locator, Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { expect, expectA11y, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";
import { mobileCheck } from "./mobile-checks";

/**
 * Приёмка заказчика П1–П6 и перезагрузка страницы (план критического тестирования, раздел 1;
 * чек-лист промпта C). Весь путь Оксаны и бригадира на демо-сборке, на 1440 и 390:
 *
 * П1. Обезличенная ресурсная смета 14 граф (gas-acceptance-estimate.cli.ts): пустой первый лист,
 *     шапка, три раздела, материалы, опрессовка строкой внутри раздела 3. Разбор находит шапку
 *     со строками файла, разделы сходятся с итогом без НДС, у раздела 3 материалы и опрессовка.
 * П2. «Создать объект» из шапки; повторная загрузка того же файла объект не дублирует.
 * П3. Раздел 3 бригаде 1, раздел 1 бригаде 2: каждая бригада видит в форме только свой.
 * П4. Бригадир 1: 8-17, перерыв 60, двойное нажатие «Отправить» даёт одну запись 480 мин,
 *     повтор той же записи форма не отправляет.
 * П5. Оксана принимает запись бригады 1 с долей; запись бригады 2 не проверена. Утверждённый
 *     Excel содержит только принятую, с суммой доли.
 * П6. Доля 120 % не принимается, 40 % начисляет 40 % стоимости работ раздела; вторая запись
 *     с «Раздел завершён» добирает ровно остаток: начислено равно стоимости, остаток 0.
 *     Запись бригады без назначения (без раздела) принимается с часами, но без суммы: доли
 *     всей сметы по минутам поверх начислений разделов нет (ADR-085).
 * Перезагрузка страницы: объект, разделы, назначения, начисление и статусы на месте.
 *
 * П7 (сверка с контрольным отчётом) и П8 (перезапуск сервера) — направления estimates и server.
 */

/**
 * Файл собирается один раз: повторная загрузка в П2 — те же байты, как у Оксаны, которая
 * перетаскивает тот же файл из папки (exceljs пишет время сборки, новый файл — другой хеш)
 */
let built: string | null = null;
const estimateFile = () => {
  if (built) return built;
  built = join(tmpdir(), `gas-acceptance-estimate-${process.pid}.xlsx`);
  execFileSync("bun", ["run", "e2e/gas-acceptance-estimate.cli.ts", built]);
  return built;
};

const LABEL = /ул\. Учебная, 7/;
const NUMBER = "777001-Д-26-СМР";
/** Работы раздела 3: итог 17 599,00 минус материалы 5 988,00 */
const WORK_3 = 11_611;
/** 40 % от работ раздела 3, целые рубли вниз: floor(11 611 × 0,4) */
const STEP_40 = 4_644;

const rub = (value: number) =>
  new RegExp(value.toLocaleString("ru-RU").replace(/\s/g, "\\s") + "\\s₽");

const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });

async function upload(page: Page) {
  await open(page, "/gas/objects");
  await page.getByTestId("estimate-flow-open").click();
  const flow = page.getByTestId("estimate-flow");
  await expect(flow).toBeVisible();
  await page.getByTestId("estimate-flow-input").setInputFiles(estimateFile());
  await expect(page.getByTestId("estimate-flow-checks")).toBeVisible({ timeout: 20_000 });
  return flow;
}

/** Время бригадира формой: объект, время фразой, перерыв, проверка */
async function fillTime(page: Page, opts: { day?: "Вчера"; time: string; breakMin: string }) {
  await page.getByRole("button", { name: "Добавить время" }).first().click();
  await page
    .getByRole("button", { name: /^Объект/ })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: LABEL }).first().click();
  if (opts.day) await page.getByRole("radio", { name: new RegExp(`^${opts.day}`) }).click();
  await page.getByRole("textbox", { name: "Время работы" }).fill(opts.time);
  await page.getByTestId("form-defaults").getByRole("button", { name: "Изменить" }).click();
  await page
    .getByRole("radiogroup", { name: "Перерыв, минут" })
    .getByRole("radio", { name: opts.breakMin, exact: true })
    .click();
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.getByText("Проверьте перед отправкой")).toBeVisible();
}

async function openRecord(page: Page, number: string): Promise<Locator> {
  await open(page, "/gas/moderation");
  const card = page.locator("[data-queue-card]").filter({ hasText: number });
  await card.click();
  const block = page.getByTestId("accrual-block").filter({ visible: true });
  await expect(block).toBeVisible();
  return block;
}

async function closeSheet(page: Page, phone: boolean) {
  if (!phone) return;
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-review-sheet]")).toBeHidden();
}

async function exportApproved(page: Page, phone: boolean, name: string) {
  await open(page, "/gas/tabel");
  if (!phone) await page.locator('[data-tour="export"]').click();
  const button = phone
    ? page.getByRole("button", { name: "Выгрузить Excel", exact: true })
    : page.getByRole("menuitem", { name: /Excel утверждённый/ });
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  const path = join(tmpdir(), `gas-acceptance-${name}-${process.pid}.xlsx`);
  await download.saveAs(path);
  const book = XLSX.read(readFileSync(path));
  return XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets["Записи"]!, {
    header: 1,
    raw: true,
  });
}

async function customerPath(page: Page, phone: boolean) {
  // П1. Смета: шапка, разделы, сходимость, материалы и опрессовка внутри раздела
  let flow = await upload(page);
  const checks = page.getByTestId("estimate-flow-checks");
  await expect(checks.locator("li")).toHaveCount(5);
  await expect(checks).toContainText("3 раздела");
  const sections = flow.getByTestId("estimate-section");
  await expect(sections).toHaveCount(3);
  // Подземный газопровод: земля и сталь в отчёте, субподряд нет (ADR-089, ADR-090)
  await expect(flow.getByTestId("estimate-flow-kind")).toHaveAttribute("data-kind", "underground");
  await expect(sections.nth(1)).toContainText("Монтаж стальных газопроводов");
  await expect(sections.nth(1)).toContainText(rub(WORK_3));
  await sections.nth(1).click();
  const table = flow.getByTestId("flow-sections-table");
  await expect(table).toContainText(/Итого по разделу\s*17\s599\s₽ · стр\. 57/);
  await expect(table).toContainText(/Материалы\s*5\s988\s₽ · стр\. 52/);
  await expect(table).toContainText("строки испытаний");
  await flow.getByTestId("estimate-flow-fix-open").click();
  await flow.getByText("Шапка сметы: объект, адрес, номер").click();
  const header = flow.getByTestId("estimate-header");
  await expect(header).toContainText(NUMBER);
  await expect(header).toContainText("· строка 6");
  await expect(header).toContainText(/ул\. Учебная, 7, кв\. 3/);
  await expect(header).toContainText("· строка 12");
  if (phone) expect((await mobileCheck(page)).overflow.offenders).toEqual([]);

  // П2. Объект из шапки
  await flow.getByTestId("estimate-flow-next").click();
  await expect(flow).toHaveAttribute("data-step", "object");
  await expect(flow).toContainText("Такого объекта в справочнике нет");
  await flow.getByTestId("estimate-create-object").click();
  await expect(flow.getByRole("textbox", { name: "Номер объекта" })).toHaveValue(NUMBER);
  await expect(flow.getByRole("textbox", { name: "Адрес или название" })).toHaveValue(LABEL);
  await flow.getByTestId("estimate-create-confirm").click();
  await expect(flow).toHaveAttribute("data-step", "brigades");

  // П3. Разные разделы разным бригадам
  const rows = flow.getByTestId("flow-section");
  await expect(rows).toHaveCount(3);
  // Землю — бригаде 2 (выполняет землю и П/Э), сталь — бригаде 1
  await expect(rows.nth(0).getByRole("combobox")).toContainText(
    "Бригада 2 · выполняет землю и П/Э",
  );
  await rows.nth(1).getByRole("combobox").selectOption({ label: "Бригада 1" });
  await expect(rows.nth(1)).toContainText("Бригада 1");
  await rows
    .nth(0)
    .getByRole("combobox")
    .selectOption({ label: "Бригада 2 · выполняет землю и П/Э" });
  await expect(rows.nth(0)).toContainText("Бригада 2");
  await expect(flow.getByTestId("flow-brigades-summary")).toContainText("Назначено 2 из 3");
  await flow.getByTestId("flow-open-object").click();
  await expect(page).toHaveURL(/\/gas\/objects\//, { timeout: 15_000 });
  const objectUrl = page.url();

  // Полоса пути: текущий шаг «Стоимость», Оксана подтверждает смету по правилу компании
  await expect(page.getByTestId("object-path-hint")).toContainText("Стоимость");
  await page.getByRole("link", { name: "Подтвердить стоимость" }).click();
  // Ссылка открывает шторку именно этой сметы, искать её в списке не нужно
  await expect(page).toHaveURL(/\/gas\/estimates\?open=/);
  await page
    .getByRole("dialog")
    .filter({ hasText: LABEL })
    .getByRole("button", { name: "Подтвердить смету" })
    .click();
  // Всего без НДС 26 869,89 минус материалы 5 988,00 = 20 881,89, целые рубли
  await expect(toast(page, /Смета подтверждена: 20\s882\s₽/)).toBeVisible();

  // П2. Тот же файл ещё раз: «уже загружали», объект найден, второго нет
  flow = await upload(page);
  await expect(flow).toContainText("Этот файл уже загружали");
  await flow.getByTestId("estimate-flow-next").click();
  await expect(flow.getByTestId("estimate-create-object")).toHaveCount(0);
  await expect(flow).toContainText(NUMBER);
  await page.keyboard.press("Escape");
  await open(page, "/gas/objects");
  await expect(page.getByText(LABEL)).toHaveCount(1);

  // П3. Бригада 2 видит в форме только раздел 1 (менеджер вводит за бригаду)
  await open(page, "/gas/brigade");
  await page
    .getByRole("combobox", { name: "Ввод за бригаду" })
    .selectOption({ label: "Бригада 2" });
  await page.getByRole("button", { name: "Добавить время" }).first().click();
  await page
    .getByRole("button", { name: /^Объект/ })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: LABEL }).first().click();
  await expect(page.getByTestId("section-auto")).toHaveText(/Земляные работы/);
  await page.getByRole("textbox", { name: "Время работы" }).fill("9-13");
  await page.getByRole("button", { name: "Проверить" }).click();
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  const pendingNumber = /ГЗ-\d{5}/.exec(
    await page.getByRole("heading", { name: /Запись ГЗ-\d{5} принята/ }).innerText(),
  )![0];

  // П4. Бригадир 1: только раздел 3, перерыв вычитается, двойное нажатие без дубля
  await gasRole(page, "Бригадир");
  await expect(page).toHaveURL(/\/gas\/brigade$/);
  await page.getByRole("button", { name: "Добавить время" }).first().click();
  await page
    .getByRole("button", { name: /^Объект/ })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: LABEL }).first().click();
  await expect(page.getByTestId("section-auto")).toHaveText(/Монтаж стальных газопроводов/);
  await page.getByRole("button", { name: /Назад/ }).click();
  await fillTime(page, { time: "8-17", breakMin: "60" });
  await expect(page.getByText("08:00 – 17:00, перерыв 60 мин")).toBeVisible();
  await page.getByRole("button", { name: "Отправить", exact: true }).dblclick();
  const sent = page.getByRole("heading", { name: /Запись ГЗ-\d{5} принята/ });
  await expect(sent).toBeVisible();
  const first = /ГЗ-\d{5}/.exec(await sent.innerText())![0];
  await expect(page.getByTestId("section-done")).toBeVisible();
  await page.getByRole("button", { name: "Готово" }).click();
  const mine = page.locator("section[aria-labelledby='my-entries']");
  await expect(mine.getByText(first)).toHaveCount(1);
  // Повтор той же записи: форма показывает существующую и не отправляет
  await fillTime(page, { time: "8-17", breakMin: "60" });
  await expect(page.getByRole("alert")).toContainText(`Такая запись уже есть: ${first}`);
  await expect(page.getByRole("button", { name: "Отправить", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Открыть существующую запись" }).click();
  // Вторая запись на раздел 3 вчера: для завершения раздела
  await fillTime(page, { day: "Вчера", time: "8-12", breakMin: "0" });
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  const second = /ГЗ-\d{5}/.exec(
    await page.getByRole("heading", { name: /Запись ГЗ-\d{5} принята/ }).innerText(),
  )![0];
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.locator("main")).not.toContainText("₽");

  // П6. Оксана: 120 % не проходит, 40 % начисляет 40 % работ раздела
  await gasRole(page, "Менеджер");
  let block = await openRecord(page, first);
  await expect(block).toContainText("Монтаж стальных газопроводов");
  await expect(block.getByTestId("accrual-suggested")).toContainText(
    // 8 ч × 4 человека бригады 1 = 32 чел.-ч из 96,4 нормативных: 33,19 %, ниже порога 90 %
    /Доля выполнения раздела: предложено 33,19\s% \(по нормативу: 32,0 из 96,4 чел\.-ч\) · было 0\s%/,
  );
  const percent = block.getByRole("textbox", { name: "Доля, %" });
  await percent.fill("120");
  await expect(block.getByTestId("accrual-amount")).toHaveText("Доля числом от 0 до 100 %.");
  // Принять с такой долей нельзя: запись остаётся в очереди, начисления нет
  await page.locator('[data-tour="review-confirm"]:visible').click();
  await expect(toast(page, "Доля числом от 0 до 100 %.")).toBeVisible();
  await expect(block.getByTestId("accrual-suggested")).toBeVisible();
  await percent.fill("40");
  await expect(block.getByTestId("accrual-amount")).toContainText(
    new RegExp(`Начисление: ${rub(STEP_40).source} при доле 40\\s%`),
  );
  await expect(block).toContainText(rub(WORK_3));
  await page.locator('[data-tour="review-confirm"]:visible').click();
  await expect(toast(page, "Принято")).toBeVisible();
  await closeSheet(page, phone);

  // П6. Запись без раздела на объекте с разделами (бригада 3 без назначения): часы
  // принимаются, а доли всей сметы по минутам сверх начислений разделов она не получает
  await open(page, "/gas/brigade");
  await page
    .getByRole("combobox", { name: "Ввод за бригаду" })
    .selectOption({ label: "Бригада 3" });
  await page.getByRole("button", { name: "Добавить время" }).first().click();
  await page
    .getByRole("button", { name: /^Объект/ })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: LABEL }).first().click();
  await expect(page.getByTestId("section-auto")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Время работы" }).fill("8-17");
  await page.getByRole("button", { name: "Проверить" }).click();
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  const loose = /ГЗ-\d{5}/.exec(
    await page.getByRole("heading", { name: /Запись ГЗ-\d{5} принята/ }).innerText(),
  )![0];
  await open(page, "/gas/moderation");
  await page.locator("[data-queue-card]").filter({ hasText: loose }).click();
  await expect(page.getByTestId("accrual-block").filter({ visible: true })).toHaveCount(0);
  await expect(page.getByTestId("amount-line").filter({ visible: true })).toContainText(
    "Сумма не рассчитана",
  );
  await page.locator('[data-tour="review-confirm"]:visible').click();
  await expect(toast(page, "Принято")).toBeVisible();
  await closeSheet(page, phone);

  // П5. Утверждённый Excel: принятая запись с суммой доли, непроверенной нет
  await gasRole(page, "Руководитель");
  let records = await exportApproved(page, phone, `a-${phone ? 390 : 1440}`);
  let head = records[0]!.map(String);
  const row = records.find((r) => r[0] === first);
  expect(row, `строка ${first} в листе «Записи»`).toBeTruthy();
  expect(row![head.indexOf("Минуты")]).toBe(480);
  expect(Number(row![head.indexOf("Сумма начислений")])).toBeCloseTo(STEP_40, 2);
  expect(records.some((r) => r[0] === pendingNumber)).toBe(false);
  expect(records.some((r) => r[0] === second)).toBe(false);

  // П6. Вторая запись: «Раздел завершён» добирает ровно остаток
  await gasRole(page, "Менеджер");
  block = await openRecord(page, second);
  await expect(block.getByTestId("accrual-suggested")).toContainText(/было 40\s%/);
  // Вручную больше остатка раздела нельзя
  await block.getByRole("button", { name: "Начислить вручную с причиной" }).click();
  await block.getByRole("textbox", { name: "Сумма, ₽" }).fill(String(WORK_3));
  await block.getByRole("textbox", { name: "Причина" }).fill("акт заказчика");
  await expect(block.getByTestId("accrual-amount")).toContainText(
    new RegExp(`Больше остатка раздела: осталось ${rub(WORK_3 - STEP_40).source}`),
  );
  await block.getByRole("button", { name: "Начислить по доле" }).click();
  await block.getByRole("button", { name: "Раздел завершён" }).click();
  await expect(block.getByTestId("accrual-amount")).toContainText(
    new RegExp(`Начисление: ${rub(WORK_3 - STEP_40).source} при доле 100\\s%`),
  );
  await page.locator('[data-tour="review-confirm"]:visible').click();
  await expect(toast(page, "Принято")).toBeVisible();
  await closeSheet(page, phone);

  // Перезагрузка: объект, разделы, назначения, начисление на месте
  await page.goto(objectUrl);
  await page.reload();
  await open(page, new URL(objectUrl).pathname);
  const objectSections = page.getByTestId("object-sections");
  const s3 = objectSections.getByTestId("section-row").filter({ hasText: "Монтаж" });
  await expect(s3).toContainText(/Доля 100\s%/);
  await expect(s3).toContainText(new RegExp(`начислено ${rub(WORK_3).source}`));
  await expect(s3.getByTestId("section-remaining")).toHaveText(/остаток 0\s₽/);
  await expect(s3).toContainText("Бригада 1");
  const s1 = objectSections.getByTestId("section-row").filter({ hasText: "Земляные" });
  await expect(s1).toContainText("Бригада 2");
  await expect(s1).toContainText(/начислено 0\s₽/);
  if (phone) expect((await mobileCheck(page)).overflow.offenders).toEqual([]);
  await expectA11y(page, "объект после приёмки");

  // П5 ещё раз после перезагрузки: обе записи бригады 1, сумма равна работам раздела
  await gasRole(page, "Руководитель");
  records = await exportApproved(page, phone, `b-${phone ? 390 : 1440}`);
  head = records[0]!.map(String);
  const sum = records
    .filter((r) => r[0] === first || r[0] === second)
    .reduce((a, r) => a + Number(r[head.indexOf("Сумма начислений")]), 0);
  expect(sum).toBeCloseTo(WORK_3, 2);
  expect(records.some((r) => r[0] === pendingNumber)).toBe(false);
  // Запись без раздела в отчёте с часами, но без суммы: денег сверх разделов нет
  const looseRow = records.find((r) => r[0] === loose);
  expect(looseRow, `строка ${loose} в листе «Записи»`).toBeTruthy();
  expect(looseRow![head.indexOf("Минуты")]).toBe(480);
  expect(Number(looseRow![head.indexOf("Сумма начислений")] ?? 0)).toBe(0);
}

test.describe.configure({ timeout: 240_000 });

test.describe("приёмка заказчика 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("П1–П6: смета, объект без дубля, разделы бригадам, время, проверка, Excel, перезагрузка", async ({
    page,
  }) => {
    await open(page, "/gas");
    await gasRole(page, "Менеджер");
    await customerPath(page, false);
  });
});

test.describe("приёмка заказчика 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("П1–П6 на телефоне: тот же путь, без переполнения @mobile", async ({ page }) => {
    await open(page, "/gas");
    await gasRole(page, "Менеджер");
    await customerPath(page, true);
  });
});
