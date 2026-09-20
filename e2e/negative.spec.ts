import { expect, open, test } from "./fixtures";

/**
 * Негативные сценарии через интерфейс (Q6, ADR-013, п. 4). Правило держит адаптер
 * (tests/negative); здесь — что экран не даёт сделать запрещённое и объясняет почему.
 */

test.describe("руководитель", () => {
  test.use({ persona: "e-sokolov" });

  test("передача в закупку недоступна, пока есть «Не удалось определить»", async ({ page }) => {
    await open(page, "/projects/p-korona/documents/pd-korona-spec");
    await page.locator("[data-position-id]").first().waitFor();
    // Подтверждаем позицию — появляется что передавать, но «Не удалось определить» остались
    await page
      .getByRole("button", { name: /Требуют внимания/ })
      .first()
      .click();
    await page.locator("[data-position-id]").first().click();
    await page.getByRole("button", { name: "Подтвердить", exact: true }).first().click();
    const send = page.locator("[data-tour=hand-over]:visible");
    await expect(send).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /Не удалось определить: \d+ — показать/ }),
    ).toBeVisible();
  });

  test("решение без причины не фиксируется", async ({ page }) => {
    await open(page, "/projects/p-korona/procurement/sr-323");
    await page.getByRole("button", { name: "Зафиксировать решение" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("textarea").fill("коротко");
    await dialog.getByRole("button", { name: "Зафиксировать", exact: true }).click();
    // Форма не закрылась, причина подсвечена, решения нет
    await expect(dialog.getByText("Опишите причину — не короче 15 символов")).toBeVisible();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText(/^Решение: «/)).toHaveCount(0);
  });

  test("повторно зафиксировать решение нельзя: кнопки больше нет, решение показано", async ({
    page,
  }) => {
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
    await expect(page.getByText(/^Решение: «/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Зафиксировать решение" })).toHaveCount(0);
    await page.reload();
    await page.locator("main").waitFor();
    await expect(page.getByText(/^Решение: «/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Зафиксировать решение" })).toHaveCount(0);
  });

  test("приёмка с недостачей без фото и подтверждения недоступна", async ({ page }) => {
    // Поставка по решению: прибыла, открыта форма приёмки
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
    await expect(page.getByText(/^Решение: «/)).toBeVisible();
    await open(page, "/projects/p-korona/deliveries");
    await page.locator("main li button", { hasText: "Керамогранит" }).first().click();
    await page.getByRole("button", { name: "Поставка прибыла на объект" }).click();
    await page.getByRole("button", { name: "Принять поставку" }).click();

    const dialog = page.getByRole("dialog");
    const qty = dialog.locator("input[inputmode=decimal]").first();
    const declared = Number((await qty.inputValue()).replace(",", "."));
    await qty.fill(String(Math.round(declared * 0.9)));
    const groups = dialog.getByRole("radiogroup");
    for (let i = 0; i < (await groups.count()); i += 1) {
      await groups.nth(i).getByRole("radio", { name: "Да" }).click();
    }
    const accept = dialog.getByRole("button", { name: /Принять с замечаниями/ });
    await expect(accept).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    // Подтверждение есть, фото нет — всё равно нельзя, и экран говорит почему
    await expect(accept).toBeDisabled();
    await expect(dialog.getByText("При расхождении нужно хотя бы одно фото")).toBeVisible();
  });
});

test.describe("раздел открыт на чтение — экран работает без данных закрытого раздела", () => {
  test.use({ persona: "e-volkova" });

  test("ПТО видит список запросов: контакты поставщиков ему закрыты, но экран цел", async ({
    page,
  }) => {
    await open(page, "/projects/p-korona/procurement");
    await expect(page.getByText("Не удалось")).toHaveCount(0);
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("table").getByText("З-2026/323")).toBeVisible();
    // Вкладки «Поставщики» у роли нет: раздел закрыт (ADR-012)
    await expect(page.getByRole("button", { name: "Поставщики", exact: true })).toHaveCount(0);
  });
});

test.describe("доступ без прав", () => {
  const cases = [
    { persona: "e-dorohov", path: "/projects/p-korona/timeline", section: "История и решения" },
    { persona: "e-volkova", path: "/projects/p-korona/deliveries", section: "Поставки" },
    { persona: "e-gareev", path: "/projects/p-korona/documents", section: "Документация" },
    { persona: "e-gareev", path: "/projects/p-meridian", section: null },
    { persona: "e-belyaev", path: "/projects/p-korona/documents", section: undefined },
  ] as const;

  for (const item of cases) {
    test.describe(item.persona, () => {
      test.use({ persona: item.persona });
      test(`${item.path} @mobile`, async ({ page }) => {
        await page.goto(item.path, { waitUntil: "domcontentloaded" });
        const screen = page.locator("[data-screen=no-access]");
        if (item.section === undefined) {
          // Директору раздел открыт на чтение: экрана «Нет доступа» нет, кнопок записи тоже
          await page.locator("main").waitFor();
          await expect(page.getByRole("heading", { level: 1 }).first()).toBeAttached();
          await expect(screen).toHaveCount(0);
          await expect(page.getByRole("button", { name: /Загрузить документ/ })).toHaveCount(0);
          return;
        }
        await expect(screen).toBeVisible();
        await expect(screen.getByRole("heading")).toHaveText(
          item.section ? `Нет доступа к разделу «${item.section}»` : "Нет доступа к этому объекту",
        );
        const link = screen.getByRole("link");
        await expect(link).toBeVisible();
        await link.click();
        await expect(page.locator("[data-screen=no-access]")).toHaveCount(0);
      });
    });
  }
});
