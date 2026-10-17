import { expect, expectEmber, expectMobile, open, test } from "./fixtures";

/**
 * Модули прежнего контура за флагом `legacy_modules` и экран «Входящие» (ADR-034).
 *
 * Остальные прогоны идут с включённым флагом: код модулей остаётся в продукте, и его проверки
 * удалять нельзя. Здесь проверяется продукт таким, каким его видит зритель показа, — с флагом
 * выключенным: пунктов меню нет, адреса ведут на рабочий экран роли, тупиков нет.
 */

/** Выключить флаг, который общая оснастка ставит всем прогонам */
const withoutLegacy = (page: import("@playwright/test").Page) =>
  page.addInitScript(() => {
    try {
      sessionStorage.removeItem("neeklo-fieldops-legacy");
    } catch {
      // Приватный режим: флага и так нет
    }
  });

test.describe("модули за флагом", () => {
  test.use({ persona: "e-sokolov" });

  const addresses = [
    "/projects/p-korona/materials",
    "/projects/p-korona/procurement",
    "/projects/p-korona/deliveries",
    "/projects/p-korona/documents",
    "/settings",
    "/quality",
  ];

  for (const address of addresses) {
    test(`адрес ${address} ведёт на рабочий экран роли @mobile`, async ({ page }) => {
      await withoutLegacy(page);
      await page.goto(address, { waitUntil: "domcontentloaded" });
      // Руководителю рабочий экран — «Обзор»; важно, что это не пустая страница и не отказ
      await expect(page).toHaveURL(/\/attention$/);
      await expect(page.getByRole("heading", { name: "Обзор", level: 1 })).toBeVisible();
    });
  }

  test("в меню и панели нет модулей прежнего контура", async ({ page }) => {
    await withoutLegacy(page);
    await open(page, "/attention");
    for (const label of ["Материалы", "Закупки", "Поставки", "Поставщики", "Документация"]) {
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    }
    // Рабочие разделы на месте
    await expect(page.getByRole("link", { name: "Входящие", exact: true }).first()).toBeVisible();
  });

  test("«Обзор» без модулей не показывает ссылок в скрытые разделы @mobile", async ({ page }) => {
    await withoutLegacy(page);
    await open(page, "/attention");
    const hrefs = await page
      .locator("main a[href]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? ""));
    const legacy = hrefs.filter((href) =>
      /\/projects\/[^/]+\/(materials|procurement|deliveries|documents)/u.test(href),
    );
    expect(legacy, "ссылки в модули за флагом").toEqual([]);
  });
});

test.describe("шторка записи без модулей", () => {
  // Нижняя панель живёт до 1024 px (ADR-026, п. 1): на десктопе её место занимает боковая
  test.skip(({ viewport }) => (viewport?.width ?? 1440) >= 1024, "от 1024 px панели нет");
  test.use({ persona: "e-dorohov" });

  test("в шторке остаются только действия контура ГАЙКИ @mobile", async ({ page }) => {
    await withoutLegacy(page);
    await open(page, "/attention");
    await page.locator('[data-tour="nav-plus"]').click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const text = await sheet.innerText();
    expect(text).not.toContain("Запрос поставщикам");
    expect(text).not.toContain("Приёмка поставки");
    // Справочники остаются: это контекст объекта для шлюза моделей
    expect(text).toContain("Номенклатура из Excel");
  });
});

test.describe("входящие", () => {
  test.use({ persona: "e-volkova" });

  test("ПТО видит очередь проверки во «Входящих» @mobile", async ({ page }) => {
    await withoutLegacy(page);
    await open(page, "/inbox");
    await expect(page.getByRole("heading", { name: "Входящие", level: 1 })).toBeVisible();
    await expect(page.getByText("Ждут вашей проверки")).toBeVisible();
    await expectEmber(page, "входящие");
    await expectMobile(page, "входящие");
  });
});
