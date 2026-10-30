import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Сквозной путь снабжения (ADR-057, S5) на 390 и 1440:
 *
 * 1. прораб создал заявку текстом и подтвердил черновик;
 * 2. снабженец взял в работу и ввёл 2 предложения;
 * 3. сравнил их, выбрал и отметил «заказано», затем «в пути»;
 * 4. прораб принял поставку с расхождением и сертификатом;
 * 5. материал с сертификатом виден ПТО.
 *
 * Публичный контур с исходным набором: сессия вкладки своя у каждого теста.
 */
test.describe.configure({ timeout: 180_000 });

async function pick(page: Page, label: string, option: RegExp) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: option }).click();
}

async function addOffer(page: Page, supplier: RegExp, price: string, days: string) {
  await pick(page, "Поставщик", supplier);
  await page.getByLabel("Цена за м, ₽: Труба стальная ВГП 20 мм").fill(price);
  await page.getByLabel("Срок поставки, дней").fill(days);
  await page.getByRole("button", { name: "Добавить предложение" }).click();
  await expect(page.getByText("Предложение внесено").first()).toBeVisible();
}

for (const [name, viewport] of [
  ["390", { width: 390, height: 844 }],
  ["1440", { width: 1440, height: 900 }],
] as const) {
  test.describe(`снабжение, ${name}`, () => {
    test.use({ viewport });

    test("заявка → 2 предложения → заказано → приёмка с расхождением → ПТО", async ({ page }) => {
      // 1. Прораб: «Новая заявка», черновик из текста, проверка, отправка
      await page.goto("/gas/site", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("html[data-booted]", { timeout: 60_000 });
      await gasRole(page, "Прораб");
      await expect(page).toHaveURL(/\/gas\/site$/);
      await page.getByRole("button", { name: "Новая заявка" }).click();
      await page.getByLabel("Что нужно").fill("труба вгп 20 50 метров к пятнице");
      await page.getByRole("button", { name: "Разобрать текст" }).click();
      const draft = page.getByRole("region", { name: "Позиции черновика" });
      await expect(draft.getByText("Из текста: «труба вгп 20 50 метров»")).toBeVisible();
      await expect(
        draft.getByText("по смете 120 м, заказано 0, в заявке 50: в пределах сметы (демо)"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Проверить" }).click();
      await page.getByRole("button", { name: "Отправить заявку" }).click();
      await expect(page.getByText("Принято сервером")).toBeVisible();
      const heading = await page
        .getByRole("heading", { name: /Заявка ЗК-\d+ принята/ })
        .textContent();
      const number = /ЗК-\d+/.exec(heading ?? "")![0];
      await page.getByRole("button", { name: "Готово" }).click();
      await expect(page.getByRole("region", { name: "Мои заявки" })).toContainText(number);
      // Цен прораб не видит
      await expect(page.locator("main")).not.toContainText("₽");

      // 2. Снабженец: заявка в таблице, в работу, запрос предложений, два ответа
      await gasRole(page, "Снабженец");
      await expect(page).toHaveURL(/\/gas\/supply$/);
      await page
        .getByRole("button", { name: new RegExp(number) })
        .first()
        .click();
      await expect(page).toHaveURL(/\/gas\/supply\/zk-/);
      await expect(page.getByRole("heading", { name: `Заявка ${number}` })).toBeVisible();
      await page.getByRole("button", { name: "Взять в работу" }).click();
      await page.getByRole("button", { name: "Запросить предложения" }).click();
      await expect(page.getByText(`по заявке ${number}`)).toBeVisible();
      await addOffer(page, /^Поставщик А/, "210", "5");
      await addOffer(page, /^Поставщик Б/, "200", "2");

      // 3. Сравнение: у второго и цена, и срок лучше; выбрать, отметить «заказано» и «в пути»
      const compare = page.getByRole("list", { name: "Сравнение предложений" });
      await expect(compare.getByRole("listitem")).toHaveCount(2);
      const second = compare.getByRole("listitem").filter({ hasText: "Поставщик Б" });
      await expect(second.getByText("Лучшая цена")).toBeVisible();
      await expect(second.getByText("Лучший срок")).toBeVisible();
      await second.getByRole("button", { name: "Выбрать: Поставщик Б" }).click();
      await expect(second.getByText("Выбрано")).toBeVisible();
      await page.getByRole("button", { name: "Отметить заказано" }).click();
      await page.getByLabel("Ожидаемая дата доставки").fill("2026-10-08");
      await page.getByRole("button", { name: "Отметить в пути" }).click();
      await expect(page.getByText("ожидается 08.10.2026")).toBeVisible();

      // 4. Прораб принимает с расхождением и сертификатом
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
      await expect(page.getByText("сертификат_ВГП20.pdf")).toBeVisible();
      // Количество не совпало: просто «Принять» недоступно
      await expect(page.getByRole("button", { name: "Принять", exact: true })).toBeDisabled();
      await page.getByLabel("Расхождение").fill("Не довезли 2 м трубы");
      await page.getByRole("button", { name: "Принять с расхождением" }).click();
      await expect(page.getByText(`Поставка ${number} принята с расхождением`)).toBeVisible();
      await expect(page.getByRole("region", { name: "Мои заявки" })).toContainText(
        "Доставлено частично",
      );

      // 5. ПТО: материал с сертификатом в «Материалах»
      await gasRole(page, "ПТО");
      await expect(page).toHaveURL(/\/gas\/materials$/);
      await expect(page.getByText("Труба стальная ВГП 20 мм").first()).toBeVisible();
      await expect(page.getByText("Сертификат есть")).toBeVisible();
      await expect(page.getByText("сертификат_ВГП20.pdf")).toBeVisible();
      await expect(page.getByRole("link", { name: number })).toBeVisible();
    });
  });
}
