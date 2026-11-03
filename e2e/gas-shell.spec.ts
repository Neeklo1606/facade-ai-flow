import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { mobileCheck } from "./mobile-checks";

/**
 * Оболочка табеля по образцу ПТО Онлайн (ADR-061, T1, разделы 3.1-3.3): меню по ролям
 * на 390, 768 и 1440, без переполнения, Tab проходит оболочку, поиск ⌘K, сворачивание меню.
 * Флаг газового контура включён: снабжения и ПТО в навигации нет.
 */

const VIEWPORTS = [
  ["390", { width: 390, height: 844 }],
  ["768", { width: 768, height: 1024 }],
  ["1440", { width: 1440, height: 900 }],
] as const;

/** Пункты меню роли по таблице 3.3: компьютер — левое меню, телефон — нижняя панель */
const ROLES = {
  // Финальный промт, 2.3–2.4 (ADR-064): разделы дня роли, остальное группой «Ещё»
  manager: {
    home: /\/gas\/moderation$/,
    side: [
      "Проверка",
      "Табель",
      "Неделя",
      "Справочники",
      "Журнал",
      "Сметы",
      "Объекты",
      "Бригады",
      "Сотрудники",
    ],
    tabs: ["Проверка", "Табель", "Неделя", "Справочн\\.", "Ещё"],
  },
  director: {
    home: /\/gas\/week$/,
    side: ["Неделя", "Табель", "Журнал", "Объекты", "Бригады", "Справочники"],
    tabs: ["Неделя", "Ещё"],
  },
  foreman: {
    home: /\/gas\/brigade$/,
    side: [],
    tabs: ["Сегодня", "Бот", "Мои записи", "Профиль"],
  },
} as const;

const FROZEN = ["Снабжение", "Заявки", "Документы", "Реестр ИД", "Готовность ИД", "ПТО"];

/** Флаг газового контура в силе: оснастка e2e по умолчанию его снимает (fixtures.ts) */
async function gasOnly(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.removeItem("gaika-gas-only");
    } catch {
      // Приватный режим: флаг включён по умолчанию
    }
  });
}

for (const [name, viewport] of VIEWPORTS) {
  const desktop = viewport.width >= 1024;
  test.describe(`оболочка табеля, ${name}`, () => {
    test.use({ viewport });

    for (const [role, spec] of Object.entries(ROLES)) {
      test(`${role}: меню роли, стартовый экран, без переполнения`, async ({ page }) => {
        await gasOnly(page);
        await open(page, "/gas");
        await page.getByTestId(`gas-role-${role}`).click();
        await expect(page).toHaveURL(spec.home);

        if (desktop && spec.side.length) {
          const side = page.getByRole("navigation", { name: "Разделы", exact: true });
          await expect(side).toBeVisible();
          await expect(side.getByRole("link")).toHaveText(
            spec.side.map((s) => new RegExp(`^${s}`)),
          );
          await expect(side.locator("[aria-current=page]")).toHaveCount(1);
          for (const frozen of FROZEN)
            await expect(side.getByText(frozen, { exact: true })).toHaveCount(0);
          // Меню-таблетки и плавающей капсулы «Сервиса v1» больше нет
          await expect(page.getByRole("complementary", { name: "Панель действий" })).toHaveCount(0);
        } else if (!desktop) {
          const tabs = page.getByRole("navigation", { name: "Основные разделы" });
          await expect(tabs.getByRole("link")).toHaveText(
            spec.tabs.map((s) => new RegExp(`^${s}$`)),
          );
        }

        const check = await mobileCheck(page);
        expect(check.overflow.offenders, "переполнение по ширине").toEqual([]);
        expect(check.overflow.scrollWidth).toBeLessThanOrEqual(viewport.width);
      });
    }

    test("бригадир не видит меню менеджера", async ({ page }) => {
      await gasOnly(page);
      await open(page, "/gas");
      await page.getByTestId("gas-role-foreman").click();
      await expect(page).toHaveURL(/\/gas\/brigade$/);
      await expect(page.getByRole("navigation", { name: "Разделы", exact: true })).toHaveCount(0);
      for (const label of ["Проверка", "Неделя", "Табель"])
        await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    });

    test("в выборе роли нет снабжения и ПТО", async ({ page }) => {
      await gasOnly(page);
      await open(page, "/gas");
      for (const role of ["prorab", "supply", "pto"])
        await expect(page.getByTestId(`gas-role-${role}`)).toHaveCount(0);
    });
  });
}

test.describe("оболочка табеля, 1440: действия шапки", () => {
  // Роль по умолчанию в контуре газа — менеджер проверки
  test.use({ viewport: { width: 1440, height: 900 } });

  test("⌘K раскрывает поиск в шапке, действие ведёт на экран", async ({ page }) => {
    await open(page, "/gas/moderation");
    await page.keyboard.press("ControlOrMeta+k");
    const field = page.getByRole("combobox", { name: "Что найти" });
    await expect(field).toBeFocused();
    const box = await field.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
    await field.fill("Бригада 3");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(field).toHaveCount(0);
  });

  test("меню сворачивается до иконок и помнит это после перезагрузки", async ({ page }) => {
    await open(page, "/gas/moderation");
    const side = page.getByRole("navigation", { name: "Разделы", exact: true });
    await side.getByRole("button", { name: "Свернуть меню" }).click();
    expect((await side.boundingBox())?.width).toBe(64);
    await page.reload();
    await page.locator("main").waitFor();
    await expect(side.getByRole("button", { name: "Развернуть меню" })).toBeVisible();
    expect((await side.boundingBox())?.width).toBe(64);
    await side.getByRole("button", { name: "Развернуть меню" }).click();
    expect((await side.boundingBox())?.width).toBe(240);
  });

  test("крошки, заголовок с ⓘ и строка счётчиков", async ({ page }) => {
    await open(page, "/gas/moderation");
    await expect(page.getByRole("navigation", { name: "Где вы" })).toHaveText(
      /Учёт времени.*Работа.*Проверка/,
    );
    await page.getByRole("button", { name: "Справка: Проверка" }).click();
    await expect(page.getByText("Проверка: что делать здесь")).toBeVisible();
  });

  test("Tab проходит оболочку: компания, модуль, поиск, колокольчик, справка, профиль, меню", async ({
    page,
  }) => {
    await open(page, "/gas/moderation");
    await page.locator("body").focus();
    const reached: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      reached.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute("aria-label") ??
            document.activeElement?.textContent?.trim() ??
            "",
        ),
      );
    }
    const text = reached.join(" | ");
    for (const stop of [
      /меню компании/,
      /Учёт времени/,
      /Поиск/,
      /Требует внимания/,
      /Справка/,
      /^Вы: |Вы: /,
      /Проверка/,
    ])
      expect(text, `Tab: ${text}`).toMatch(stop);
  });
});
