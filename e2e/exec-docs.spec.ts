import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Сквозной путь исполнительной документации (ADR-058, S6) на 390 и 1440:
 *
 * 1. ПТО формирует пакет по подтверждённым работам ОБ-101: в акте не хватает сертификата;
 * 2. прораб видит, чего не хватает актам его объектов;
 * 3. снабжение везёт трубу, прораб принимает поставку с сертификатом;
 * 4. комплект полный, черновик docx скачан, акт передан на подпись;
 * 5. скан загружен, статус «Подписан»; реестр закрыт версией 1.
 *
 * Публичный контур с исходным набором: сессия вкладки своя у каждого теста.
 */
test.describe.configure({ timeout: 240_000 });

async function pick(page: Page, label: string, option: RegExp) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: option }).click();
}

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("html[data-booted]", { timeout: 60_000 });
}

const ACT = /АОСР №\s1(?!\d)/;

for (const [name, viewport] of [
  ["390", { width: 390, height: 844 }],
  ["1440", { width: 1440, height: 900 }],
] as const) {
  test.describe(`исполнительная документация, ${name}`, () => {
    test.use({ viewport });

    test("работы → пакет АОСР → сертификат из поставки → docx → подписан → реестр v1", async ({
      page,
    }) => {
      // 1. ПТО: «Документы» стартовый экран, пакет по работам объекта
      await open(page, "/gas");
      await gasRole(page, "ПТО");
      await expect(page).toHaveURL(/\/gas\/docs$/);
      const proposals = page.getByRole("list", { name: "Предложенные акты" });
      await expect(proposals.getByText(/Прокладка газопровода в футлярах/)).toBeVisible();
      await expect(proposals.getByText(/РО-0001 .* не хватает: нет сертификата$/)).toBeVisible();
      await page.getByRole("button", { name: "Создать черновики актов" }).click();
      await expect(page.getByText("Черновиков создано: 2")).toBeVisible();
      await page.getByRole("button", { name: ACT }).first().click();
      await expect(page.getByRole("heading", { name: ACT })).toBeVisible();
      const missing = page.getByRole("list", { name: "Чего не хватает" });
      await expect(missing.getByText("Нет сертификата: Труба стальная ВГП 20 мм")).toBeVisible();
      await expect(missing.getByText("Ответственный: Снабжение")).toBeVisible();
      // У значения есть источник: запись объёма
      await expect(
        page.getByText("Источник: Запись РО-0001, объём подтвердил Прораб").first(),
      ).toBeVisible();
      await page.getByRole("button", { name: "Отправить на проверку" }).click();
      await expect(page.getByText("На проверке ПТО").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Передать на подпись" })).toBeDisabled();

      // 2-3. Прораб видит, чего не хватает, и заказывает трубу
      await gasRole(page, "Прораб");
      await expect(page).toHaveURL(/\/gas\/site$/);
      await expect(page.getByRole("region", { name: "Не хватает актам" })).toContainText(
        "Подтвердите объём: Монтаж коаксиального дымохода котла",
      );
      await page.getByRole("button", { name: "Новая заявка" }).click();
      await page.getByLabel("Что нужно").fill("труба вгп 20 50 метров к пятнице");
      await page.getByRole("button", { name: "Разобрать текст" }).click();
      await page.getByRole("button", { name: "Проверить" }).click();
      await page.getByRole("button", { name: "Отправить заявку" }).click();
      const heading = await page
        .getByRole("heading", { name: /Заявка ЗК-\d+ принята/ })
        .textContent();
      const number = /ЗК-\d+/.exec(heading ?? "")![0];
      await page.getByRole("button", { name: "Готово" }).click();

      await gasRole(page, "Снабженец");
      await page
        .getByRole("button", { name: new RegExp(number) })
        .first()
        .click();
      await page.getByRole("button", { name: "Взять в работу" }).click();
      await page.getByRole("button", { name: "Запросить предложения" }).click();
      await pick(page, "Поставщик", /^Поставщик А/);
      await page.getByLabel("Цена за м, ₽: Труба стальная ВГП 20 мм").fill("210");
      await page.getByLabel("Срок поставки, дней").fill("3");
      await page.getByRole("button", { name: "Добавить предложение" }).click();
      await page
        .getByRole("list", { name: "Сравнение предложений" })
        .getByRole("button", { name: "Выбрать: Поставщик А" })
        .click();
      await page.getByRole("button", { name: "Отметить заказано" }).click();
      await page.getByLabel("Ожидаемая дата доставки").fill("2026-10-08");
      await page.getByRole("button", { name: "Отметить в пути" }).click();
      await expect(page.getByText("ожидается 08.10.2026")).toBeVisible();

      await gasRole(page, "Прораб");
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
      await page.getByRole("button", { name: "Принять с расхождением" }).click();
      await expect(page.getByText(`Поставка ${number} принята с расхождением`)).toBeVisible();

      // 4. ПТО: комплект полный, источник сертификата — поставка; docx и подпись
      await gasRole(page, "ПТО");
      await page.getByRole("button", { name: ACT }).first().click();
      await expect(page.getByText("Полный", { exact: true })).toBeVisible();
      await expect(
        page.getByText(new RegExp(`Источник: Поставка ${number}, .*сертификат_ВГП20\\.pdf`)),
      ).toBeVisible();
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Скачать docx" }).click();
      expect((await download).suggestedFilename()).toBe("АОСР-1_ОБ-101_v1_черновик.docx");
      await page.getByRole("button", { name: "Передать на подпись" }).click();
      await expect(page.getByText("Передан на подпись").first()).toBeVisible();

      // 5. Скан подписанного: «Подписан»; реестр закрывается версией 1
      await page
        .locator("label", { hasText: "Загрузить скан подписанного" })
        .locator("input[type=file]")
        .setInputFiles({
          name: "АОСР-1_скан.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4"),
        });
      await expect(page.getByText("Подписан", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Скан: АОСР-1_скан.pdf.", { exact: false })).toBeVisible();

      await open(page, "/gas/docs-registry");
      const current = page.getByRole("list", { name: "Документы реестра" });
      await expect(current).toContainText("Акт освидетельствования скрытых работ АОСР");
      await page.getByRole("button", { name: "Закрыть реестр версией" }).click();
      await expect(page.getByText("Реестр закрыт: версия 1")).toBeVisible();
      await expect(
        page.getByRole("list", { name: "Версии реестра" }).getByText("Версия 1"),
      ).toBeVisible();
      await expect(current.getByText("В реестре")).toBeVisible();
      await expect(page.getByRole("button", { name: "Закрыть реестр версией" })).toBeDisabled();
    });
  });
}
