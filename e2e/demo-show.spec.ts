import { mkdir, readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Полный показ канона 18.10 (ADR-038) одной сессией: экран входа → три сценария цепочкой →
 * финал. Проверяется то, ради чего демо делается: данные идут по цепочке (отчёт прораба у ПТО,
 * заявка у снабжения), файлы — настоящие xlsx, касаний мало.
 *
 * Ширины и темы канона D5: 375, 390, 430 в тёмной, 390 в светлой и 390 с reduced-motion.
 * С `SHOTS_DIR` каждый шаг снимается в `<сценарий>/<шаг>-<ширина>-<тема>.png`.
 * Флаг `legacy_modules` снят: тест видит то же, что зритель.
 */

const RUNS = [
  { width: 375, theme: "dark", motion: "no-preference" },
  { width: 390, theme: "dark", motion: "no-preference" },
  { width: 430, theme: "dark", motion: "no-preference" },
  { width: 390, theme: "light", motion: "no-preference" },
  { width: 390, theme: "dark", motion: "reduce" },
] as const;

/** Файл результата — настоящий xlsx: zip с книгой Excel внутри */
async function expectXlsx(download: Download, name: RegExp) {
  expect(download.suggestedFilename()).toMatch(name);
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(bytes.includes(Buffer.from("xl/workbook.xml"))).toBe(true);
}

/** Кнопка полосы шагов: одна, справа от текста шага */
const strip = (page: Page) => page.getByRole("region", { name: "Подсказки по сценарию" });

for (const run of RUNS) {
  const tag = `${run.width}-${run.theme}${run.motion === "reduce" ? "-reduced" : ""}`;

  test.describe(`показ ${tag}`, () => {
    test.use({
      viewport: { width: run.width, height: 844 },
      persona: null,
      theme: run.theme,
      colorScheme: run.theme,
      reducedMotion: run.motion,
    });
    // Показ проверяется в проекте телефона: ширина задаётся здесь, а не проектом
    test.skip(({ isMobile }) => !isMobile, "показ — проект телефона");

    test(`полный показ трёх сценариев от входа до финала ${tag} @mobile`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.addInitScript(() => {
        try {
          sessionStorage.removeItem("neeklo-fieldops-legacy");
        } catch {
          // Приватный режим
        }
      });
      const dir = process.env["SHOTS_DIR"];
      const shot = async (scenario: string, step: string) => {
        if (!dir) return;
        await mkdir(`${dir}/${scenario}`, { recursive: true });
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${dir}/${scenario}/${step}-${tag}.png` });
      };

      /* ---------- Вход ---------- */
      // Экран входа переехал на /demo вторым блоком (ADR-047)
      await page.goto("/demo", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Голос с объекта" })).toBeVisible();
      await expect(page.getByText("1 минута")).toHaveCount(3);
      await shot("0-vhod", "01-ekran-vhoda");
      await page.getByRole("button", { name: /Смена → учёт/ }).click();

      /* ---------- Сценарий 1: смена → учёт ---------- */
      await expect(page).toHaveURL(/\/capture/);
      await expect(strip(page)).toContainText("Смена → учёт");
      await shot("1-smena", "01-zapis-pokoy");
      await page.getByRole("button", { name: /Удерживайте, чтобы говорить/ }).click();
      await page.getByRole("button", { name: "Показать без микрофона" }).click();
      await shot("1-smena", "02-zapis-idyot");

      // Касания прораба от «Готово» до «Верно»: не больше трёх (D3)
      let taps = 0;
      await page.getByRole("button", { name: "Готово" }).click();
      taps++;
      await shot("1-smena", "03-rasshifrovka");
      // При reduced-motion расшифровка появляется сразу, и кнопки «Показать сразу» нет
      const instant = page.getByRole("button", { name: "Показать сразу" });
      if (await instant.isVisible().catch(() => false)) {
        await instant.click().catch(() => undefined);
        taps++;
      }
      await expect(page.getByText("Демо: разбор подготовлен заранее")).toBeVisible({
        timeout: 15_000,
      });
      await shot("1-smena", "04-razbor");
      await page.getByRole("button", { name: /Объём: 96 м²/ }).click();
      await shot("1-smena", "05-istochnik");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Верно" }).last().click();
      taps++;
      expect(taps).toBeLessThanOrEqual(3);
      await expect(page.getByRole("heading", { name: "Готово" })).toBeVisible();
      await shot("1-smena", "06-gotovo");

      await page.getByRole("button", { name: "Дальше по сценарию" }).click();
      await expect(page).toHaveURL(/\/today/);
      await expect(page.locator("main")).toContainText(/96\s*м²/u);
      await shot("1-smena", "07-segodnya");

      /* ---------- Сценарий 2: ПТО → документ ---------- */
      await strip(page)
        .getByRole("button", { name: /Дальше: ПТО → документ/ })
        .click();
      await expect(page).toHaveURL(/\/check/);
      // Первым стоит отчёт прораба из записи: цепочка данных, а не подготовленный факт
      const first = page.locator("main article").first();
      await expect(first).toContainText("Стилобат");
      await shot("2-pto", "01-proverka");
      // Решение ПТО по карточке: одно касание
      await first.getByRole("button", { name: "Принять" }).click();
      await shot("2-pto", "02-prinyato");

      const shift = page.waitForEvent("download");
      await page.getByRole("button", { name: "Скачать сводку смены" }).click();
      await expectXlsx(await shift, /Сводка/u);
      const statement = page.waitForEvent("download");
      await page.getByRole("button", { name: "Скачать черновик ведомости" }).click();
      await expectXlsx(await statement, /Ведомость-черновик/u);
      await shot("2-pto", "03-fayly");

      /* ---------- Сценарий 3: объект → снабжение ---------- */
      await strip(page)
        .getByRole("button", { name: /Дальше: Объект → снабжение/ })
        .click();
      await expect(page).toHaveURL(/\/capture/);
      await page.getByRole("button", { name: /Удерживайте, чтобы говорить/ }).click();
      await page.getByRole("button", { name: "Показать без микрофона" }).click();
      await page.getByRole("button", { name: "Готово" }).click();
      if (await instant.isVisible().catch(() => false))
        await instant.click().catch(() => undefined);
      await expect(page.getByText(/40 шт · к /)).toBeVisible({ timeout: 15_000 });
      await shot("3-snabzhenie", "01-razbor-nehvatki");
      await page.getByRole("button", { name: "Верно" }).last().click();
      await expect(page.getByRole("link", { name: /Заявка снабжению/ })).toBeVisible();
      await shot("3-snabzhenie", "02-zayavka-sozdana");

      await page.getByRole("button", { name: "Дальше по сценарию" }).click();
      await expect(page).toHaveURL(/\/inbox/);
      // Снабжение решает сдвигом: один жест на карточке
      const request = page.getByRole("listitem").filter({ hasText: "Кронштейн несущий" }).first();
      await shot("3-snabzhenie", "03-vhodyashchie-snabzheniya");
      await request.getByRole("slider", { name: "Сдвиньте, чтобы принять" }).press("End");
      await expect(request.getByText("Принята").first()).toBeVisible();
      await shot("3-snabzhenie", "04-prinyata");

      // Показ идёт сам: следующий шаг — глазами прораба, переключение в одно касание
      await strip(page)
        .getByRole("button", { name: /Глазами: прораб/ })
        .click();
      await expect(page).toHaveURL(/\/inbox/);
      await expect(
        page.getByRole("listitem").filter({ hasText: "Кронштейн несущий" }).first(),
      ).toContainText("Принята");
      await shot("3-snabzhenie", "05-status-u-proraba");

      /* ---------- Финал ---------- */
      await strip(page).getByRole("button", { name: "Итоги показа" }).click();
      await expect(page.getByRole("heading", { name: "Вы прошли три сценария" })).toBeVisible();
      await shot("4-final", "01-itogi");
      const files: Download[] = [];
      page.on("download", (download) => files.push(download));
      await page.getByRole("button", { name: "Скачать файлы" }).click();
      await expect.poll(() => files.length).toBe(2);
      for (const file of files) await expectXlsx(file, /\.xlsx$/u);

      // «Пройти заново»: сброс с подтверждением возвращает к экрану входа и к исходным данным
      await page.getByRole("button", { name: "Пройти заново" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Сбросить" }).click();
      // Экран входа показа теперь на /demo (ADR-047)
      await expect(page).toHaveURL(/\/demo$/);
      await expect(page.getByRole("heading", { name: "Голос с объекта" })).toBeVisible();
    });
  });
}
