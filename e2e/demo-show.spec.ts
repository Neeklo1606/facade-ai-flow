import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Полный показ канона 18.10 (ADR-038) одной сессией на 390 px: экран входа → три сценария
 * цепочкой → финал. Проверяется то, ради чего демо делается: данные идут по цепочке (отчёт
 * прораба у ПТО, заявка у снабжения), файлы — настоящие xlsx, касаний мало.
 *
 * Флаг `legacy_modules` здесь снят: тест видит то же, что зритель.
 */

test.use({ viewport: { width: 390, height: 844 }, persona: null });
test.skip(({ viewport }) => (viewport?.width ?? 0) !== 390, "показ проверяется на 390 px");

/** Файл результата — настоящий xlsx: zip с книгой Excel внутри */
async function expectXlsx(download: Download, name: RegExp) {
  expect(download.suggestedFilename()).toMatch(name);
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(bytes.includes(Buffer.from("xl/workbook.xml"))).toBe(true);
}

/** Кнопка полосы шагов: одна, справа от текста шага */
const strip = (page: Page) => page.getByRole("region", { name: "Подсказки по сценарию" });

test("полный показ трёх сценариев от входа до финала @mobile", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    try {
      sessionStorage.removeItem("neeklo-fieldops-legacy");
    } catch {
      // Приватный режим
    }
  });

  /* ---------- Вход ---------- */
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Говорите с объекта/ })).toBeVisible();
  await expect(page.getByText("1 минута")).toHaveCount(3);
  await page.getByRole("button", { name: /Смена → учёт/ }).click();

  /* ---------- Сценарий 1: смена → учёт ---------- */
  await expect(page).toHaveURL(/\/capture/);
  await expect(strip(page)).toContainText("Смена → учёт");
  await page.getByRole("button", { name: /Удерживайте, чтобы говорить/ }).click();
  await page.getByRole("button", { name: "Показать без микрофона" }).click();

  // Касания прораба от «Готово» до «Верно»: не больше трёх (D3)
  let taps = 0;
  await page.getByRole("button", { name: "Готово" }).click();
  taps++;
  await page.getByRole("button", { name: "Показать сразу" }).click();
  taps++;
  await expect(page.getByText("Демо: разбор подготовлен заранее")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Верно" }).last().click();
  taps++;
  expect(taps).toBeLessThanOrEqual(3);
  await expect(page.getByRole("heading", { name: "Готово" })).toBeVisible();

  await page.getByRole("button", { name: "Дальше по сценарию" }).click();
  await expect(page).toHaveURL(/\/today/);
  await expect(page.locator("main")).toContainText(/96\s*м²/u);

  /* ---------- Сценарий 2: ПТО → документ ---------- */
  await strip(page)
    .getByRole("button", { name: /Дальше: ПТО → документ/ })
    .click();
  await expect(page).toHaveURL(/\/check/);
  // Первым стоит отчёт прораба из записи: цепочка данных, а не подготовленный факт
  const first = page.locator("main article").first();
  await expect(first).toContainText("Стилобат");
  // Решение ПТО по карточке: одно касание
  await first.getByRole("button", { name: "Принять" }).click();

  const shift = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать сводку смены" }).click();
  await expectXlsx(await shift, /Сводка/u);
  const statement = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать черновик ведомости" }).click();
  await expectXlsx(await statement, /Ведомость-черновик/u);

  /* ---------- Сценарий 3: объект → снабжение ---------- */
  await strip(page)
    .getByRole("button", { name: /Дальше: Объект → снабжение/ })
    .click();
  await expect(page).toHaveURL(/\/capture/);
  await page.getByRole("button", { name: /Удерживайте, чтобы говорить/ }).click();
  await page.getByRole("button", { name: "Показать без микрофона" }).click();
  await page.getByRole("button", { name: "Готово" }).click();
  await page.getByRole("button", { name: "Показать сразу" }).click();
  await expect(page.getByText(/12 шт · к /)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Верно" }).last().click();
  await expect(page.getByRole("link", { name: /Заявка снабжению/ })).toBeVisible();

  await page.getByRole("button", { name: "Дальше по сценарию" }).click();
  await expect(page).toHaveURL(/\/inbox/);
  // Снабжение решает сдвигом: один жест на карточке
  const request = page.getByRole("listitem").filter({ hasText: "Нащельника углового" }).first();
  await request.getByRole("slider", { name: "Сдвиньте, чтобы принять" }).press("End");
  await expect(request.getByText("Принята").first()).toBeVisible();

  // Показ идёт сам: следующий шаг — глазами прораба, переключение в одно касание
  await strip(page)
    .getByRole("button", { name: /Глазами: прораб/ })
    .click();
  await expect(page).toHaveURL(/\/inbox/);
  await expect(
    page.getByRole("listitem").filter({ hasText: "Нащельника углового" }).first(),
  ).toContainText("Принята");

  /* ---------- Финал ---------- */
  await strip(page).getByRole("button", { name: "Итоги показа" }).click();
  await expect(page.getByRole("heading", { name: "Вы прошли три сценария" })).toBeVisible();
  const files: Download[] = [];
  page.on("download", (download) => files.push(download));
  await page.getByRole("button", { name: "Скачать файлы" }).click();
  await expect.poll(() => files.length).toBe(2);
  for (const file of files) await expectXlsx(file, /\.xlsx$/u);
  // «Пройти заново»: сброс с подтверждением возвращает к экрану входа и к исходным данным
  await page.getByRole("button", { name: "Пройти заново" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Сбросить" }).click();
  await expect(page.getByRole("heading", { name: /Говорите с объекта/ })).toBeVisible();
});
