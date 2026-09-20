import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";

/**
 * Сквозной сценарий показа из docs/STATE.md (Q8, п. 5) — одной вкладкой, как на демонстрации:
 * дашборд → объект → проверка спецификации → передача в закупку → запрос → ответы →
 * решение → поставка → приёмка с замечанием → закрытие замечания → история → отчёт с площадки
 * → новый объект. Ожидания — связи между цифрами до и после шага, а не значения из прогона.
 */

const num = (text: string | null | undefined) =>
  Number((text ?? "").replace(/[\s\u00a0\u202f]/g, "").match(/\d+/)?.[0] ?? NaN);

const toast = (page: Page, text: RegExp | string) =>
  page.locator("[data-sonner-toast]", { hasText: text });

async function reviewProgress(page: Page) {
  const match = (await page.locator("main").innerText()).match(
    /Проверено\s+(\d[\d\u00a0\u202f]*)\s+из\s+(\d[\d\u00a0\u202f]*)/,
  );
  return { verified: num(match?.[1]), total: num(match?.[2]) };
}

test.describe("сценарий показа", () => {
  test.use({ persona: "e-sokolov" });

  test("от спецификации до поставки, истории и нового объекта", async ({ page }) => {
    test.setTimeout(240_000);

    // 1. Дашборд: плитка ведёт в реестр, отфильтрованный по непроверенным
    await open(page, "/");
    await expect(page.getByRole("heading", { name: "Требует решения" })).toBeVisible();
    await page.getByRole("link", { name: /Позиций ждёт проверки/ }).click();
    await expect(page).toHaveURL(/\/projects\?.*unverified=true/);

    // 2. Реестр → карточка объекта
    await page.locator("main").getByText("Северная Корона").first().click();
    await expect(page).toHaveURL(/\/projects\/p-korona$/);

    // 3. Проверка спецификации: подтвердить пачкой всё с высокой уверенностью
    await open(page, "/projects/p-korona/documents/pd-korona-spec");
    const start = await reviewProgress(page);
    const confirmAll = page.getByRole("button", { name: /Подтвердить все проверенные/ });
    const auto = num(await confirmAll.innerText());
    expect(auto).toBeGreaterThan(0);
    await confirmAll.click();
    await expect(toast(page, `Подтверждено ${auto}`)).toBeVisible();
    await expect
      .poll(async () => (await reviewProgress(page)).verified)
      .toBe(start.verified + auto);

    // 4. Передача закрыта, пока есть «Не удалось определить»; исключаем их — передача открывается
    const handOver = page.getByRole("button", { name: /^Передать в закупку/ });
    await expect(handOver).toBeDisabled();
    // Фильтр называет число позиций; список ждём ровно такой длины и после каждого исключения
    const filterUnclear = page.getByRole("button", { name: /Не удалось определить/ }).first();
    const blocking = num(await filterUnclear.innerText());
    expect(blocking).toBeGreaterThan(0);
    await filterUnclear.click();
    const unclear = page.locator("[data-position-id]");
    await expect(unclear).toHaveCount(blocking);
    for (let left = blocking; left > 0; left -= 1) {
      await unclear.first().click();
      await page.getByRole("button", { name: "Исключить", exact: true }).first().click();
      await expect(unclear).toHaveCount(left - 1);
    }
    await expect(handOver).toBeEnabled();
    await handOver.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Передать \d/ })
      .click();
    await expect(toast(page, /В закупку переданы позиции/)).toBeVisible();

    // 5. Запрос поставщикам из материалов; демонстрация говорит, что письма не уходят
    await open(page, "/projects/p-korona/materials?purchase=none");
    await page.locator("[data-tour=create-request]:visible:not([disabled])").first().click();
    const wizard = page.getByRole("dialog");
    for (let step = 0; step < 3; step += 1) {
      await wizard.getByRole("button", { name: /^Далее/ }).click();
    }
    await expect(wizard.getByText(/В демонстрации письма не отправляются/)).toBeVisible();
    await wizard.getByRole("button", { name: /^Отправить/ }).click();
    await expect(toast(page, /Запрос З-2026\/326/)).toBeVisible();

    // 6. Ответы поставщиков приходят имитацией через несколько секунд
    await expect(toast(page, /предложение/).first()).toBeVisible({ timeout: 45_000 });

    // 7. Решение по сравнению с полными ответами создаёт поставку
    await open(page, "/projects/p-korona/procurement/sr-323");
    await page.getByRole("button", { name: "Зафиксировать решение" }).first().click();
    await page
      .getByRole("dialog")
      .locator("textarea")
      .fill("Лучшая цена и полный объём по спецификации");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Зафиксировать", exact: true })
      .click();
    await expect(toast(page, "Решение зафиксировано")).toBeVisible();

    // 8. Поставка: на старте видны все стадии, симулятор отмечает отгрузку новой поставки
    await open(page, "/projects/p-korona/deliveries");
    await expect(page.getByText("В пути, позиций")).toBeVisible();
    await expect(page.locator("main li button", { hasText: "Мембрана" }).first()).toBeVisible();
    await page.locator("main li button", { hasText: "Керамогранит" }).first().click();
    await expect(page.getByText(/статус «в пути» имитирован/).first()).toBeVisible({
      timeout: 45_000,
    });
    await page.getByRole("button", { name: "Поставка прибыла на объект" }).click();
    await page.getByRole("button", { name: "Принять поставку" }).click();
    const act = page.getByRole("dialog");
    const qty = act.locator("input[inputmode=decimal]").first();
    const declared = Number((await qty.inputValue()).replace(",", "."));
    await qty.fill(String(Math.round(declared * 0.9)));
    const groups = act.getByRole("radiogroup");
    for (let i = 0; i < (await groups.count()); i += 1) {
      await groups.nth(i).getByRole("radio", { name: "Да" }).click();
    }
    const photo = await page.screenshot({
      type: "jpeg",
      quality: 60,
      clip: { x: 0, y: 0, width: 64, height: 64 },
    });
    await act
      .getByLabel("Добавить фото")
      .setInputFiles({ name: "недостача.jpg", mimeType: "image/jpeg", buffer: photo });
    await act.getByRole("checkbox").check();
    await act.getByRole("button", { name: /Принять с замечаниями/ }).click();
    await expect(toast(page, /[Пп]оставка принята|[Пп]ринята с замечаниями/)).toBeVisible();

    // 9. Замечание — в очереди «Требует решения», закрытие видно в поставке
    await open(page, "/");
    await expect(page.getByText(/Замечание по поставке/).first()).toBeVisible();
    await open(page, "/projects/p-korona/deliveries");
    await page.locator("main li button", { hasText: "Керамогранит" }).first().click();
    await page.getByRole("button", { name: "Закрыть замечание…" }).click();
    await page.getByLabel("Чем решено замечание").fill("Поставщик довезёт в следующей партии");
    await page.getByRole("button", { name: "Закрыть замечание", exact: true }).click();
    await expect(page.getByText(/Поставщик довезёт в следующей партии/).first()).toBeVisible();

    // 10. История: решение по З-2026/323 с причиной
    await open(page, "/projects/p-korona/timeline");
    await expect(
      page.getByText(/Лучшая цена и полный объём по спецификации/).first(),
    ).toBeVisible();

    // 11. Отчёт с площадки: принять объём
    await open(page, "/projects/p-korona/field-reports");
    await page.getByRole("button", { name: "Принять", exact: true }).first().click();
    await expect(toast(page, "Отчёт принят")).toBeVisible();

    // 12. Новый объект: появляется в реестре и переживает перезагрузку
    await open(page, "/projects");
    await page.getByRole("button", { name: "Добавить объект" }).first().click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Название").fill("ЖК «Север», корпус 2");
    await form.getByLabel("Код").fill("СЕВ-2");
    await form.getByLabel("Регион").fill("Москва");
    await form.getByLabel("Заказчик").fill("ООО «Север-Девелопмент»");
    await form.getByRole("button", { name: "Создать объект" }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    await page.reload();
    await open(page, "/projects");
    await expect(page.locator("main").getByText("ЖК «Север», корпус 2").first()).toBeVisible();
  });
});
