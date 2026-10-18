import { expect, expectA11y, expectEmber, expectMobile, open, test } from "./fixtures";

/**
 * Экран записи (ADR-036). Проверяется то, из-за чего факт теряется: запрет микрофона
 * не должен оставлять прораба без способа сообщить, а повтор отправки — создавать дубль.
 *
 * Микрофон в прогоне не разрешён намеренно: браузер Playwright по умолчанию отказывает,
 * и это ровно тот случай, который обязан работать текстом.
 */

const fact = "Секция Б, смонтировали двадцать четыре метра лотка, работали втроём по восемь часов";

test.describe("вход из панели", () => {
  // Панель живёт до 1024 px (ADR-026, п. 1): на десктопе её место занимает боковая
  test.skip(({ viewport }) => (viewport?.width ?? 1440) >= 1024, "от 1024 px панели нет");
  test.use({ persona: "e-gareev" });

  test("экран открывается кнопкой «Говорить» @mobile", async ({ page }) => {
    await open(page, "/today");
    await page.locator('[data-tour="nav-plus"]').click();
    await expect(page).toHaveURL(/\/capture$/);
    await expect(page.getByRole("heading", { name: "Запись", level: 1 })).toBeVisible();
    // Экран честно говорит, чего он не делает: расшифровки без ключа и хранения файлов
    await expect(
      page.getByText(/речь не распознаётся|Распознавание речи подключается/),
    ).toBeVisible();
    await expect(page.getByText(/не хранятся|Хранение файлов/)).toBeVisible();
    await expectEmber(page, "запись");
    await expectMobile(page, "запись");
    await expectA11y(page, "запись");
  });
});

test.describe("запись факта", () => {
  test.use({ persona: "e-gareev" });

  test("без доступа к микрофону факт записывается текстом @mobile", async ({ page }) => {
    await open(page, "/capture");
    const text = page.getByLabel("Что произошло на объекте");
    await expect(text).toBeVisible();
    await text.fill(fact);
    await page.getByRole("button", { name: "Готово" }).click();
    // «Сохранено» ставится по ответу сервера, а не по нажатию: статус живёт в role="status"
    await expect(page.getByRole("status").filter({ hasText: "Сохранено" })).toBeVisible();
    await expect(page.getByText("Запись сохранена")).toBeVisible();
  });

  test("повтор отправки не создаёт дубль @mobile", async ({ page }) => {
    await open(page, "/capture");
    await page.getByLabel("Что произошло на объекте").fill(fact);
    await page.getByRole("button", { name: "Готово" }).click();
    await expect(page.getByText("Запись сохранена")).toBeVisible();

    /*
     * Перезагрузка возвращает тот же черновик с тем же ключом отправки: это и есть случай
     * «обрыв сети, человек нажал ещё раз». Второй источник появиться не должен.
     */
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("main").waitFor();
    await expect(page.getByLabel("Что произошло на объекте")).toHaveValue(fact);
    // Кнопка знает, что отправка уже была, но повтор остаётся безопасным: ключ тот же
    await page.getByRole("button", { name: "Отправлено" }).click();
    await expect(page.getByText("Эта запись уже была сохранена")).toBeVisible();
  });

  test("фото добавляется меткой времени и подписывается @mobile", async ({ page }) => {
    await open(page, "/capture");
    await page.getByRole("button", { name: "Фото" }).click();
    const caption = page.getByLabel("Подпись фото 1");
    await expect(caption).toBeVisible();
    await caption.fill("Лоток на отметке +6");
    // Подпись не обязательна, но метка времени есть всегда
    await expect(page.getByText("сохраняются метки времени")).toBeVisible();
  });
});
