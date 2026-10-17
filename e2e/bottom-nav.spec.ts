import { expect, expectA11y, open, test } from "./fixtures";

/**
 * Нижняя панель (ADR-026). Проверяется то, что правило одного оранжевого по содержимому
 * не проверяет: панель — хром, и внутри неё пятно должно быть ровно одно — кнопка «+».
 * Плюс набор позиций по роли и активная позиция без акцентного цвета.
 */

/** Сколько оранжевых пятен внутри панели и какого цвета активная позиция */
async function panel(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Основная навигация"]');
    if (!nav) return null;
    const isOrange = (color: string) => {
      const parts = color.match(/rgba?\(([^)]+)\)/);
      if (!parts?.[1]) return false;
      const [r = 0, g = 0, b = 0, a = 1] = parts[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      if (a < 0.1) return false;
      const R = r / 255;
      const G = g / 255;
      const B = b / 255;
      const max = Math.max(R, G, B);
      const min = Math.min(R, G, B);
      const l = (max + min) / 2;
      const d = max - min;
      if (d === 0) return false;
      const s = d / (1 - Math.abs(2 * l - 1));
      const raw = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
      const h = (raw * 60 + 360) % 360;
      return s > 0.6 && h >= 8 && h <= 34 && l > 0.2 && l < 0.65;
    };
    const orange: string[] = [];
    const small: string[] = [];
    for (const el of nav.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (isOrange(style.backgroundColor) || isOrange(style.color)) {
        orange.push((el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24));
      }
      if (
        (el.tagName === "A" || el.tagName === "BUTTON") &&
        (rect.height < 48 || rect.width < 40)
      ) {
        small.push(`${(el.textContent || "").trim().slice(0, 16)}: ${Math.round(rect.height)}px`);
      }
    }
    const active = nav.querySelector('[aria-current="page"]');
    return {
      labels: [...nav.children].map((child) =>
        (child.textContent || "").replace(/\s+/g, " ").trim().slice(0, 18),
      ),
      orange,
      small,
      activeOrange: active ? isOrange(getComputedStyle(active).color) : null,
      height: Math.round(nav.getBoundingClientRect().height),
    };
  });
}

test.describe("нижняя панель @mobile", () => {
  // Панель живёт до 1024 px (ADR-026, п. 1): на десктопе её место занимает боковая
  test.skip(({ viewport }) => (viewport?.width ?? 1440) >= 1024, "от 1024 px панели нет");

  test.describe("снабжение", () => {
    test.use({ persona: "e-dorohov" });

    test("позиции роли, одно оранжевое пятно, активная без акцента @mobile", async ({ page }) => {
      await open(page, "/projects/p-korona/procurement");
      const state = await panel(page);
      expect(state, "панель не найдена").not.toBeNull();
      expect(state!.height).toBeGreaterThanOrEqual(64);
      // Обзор, Закупки, «+», Объект, Ещё — таблица целевой карты (ADR-026, поправка)
      expect(state!.labels).toHaveLength(5);
      expect(state!.labels.join(" ")).toContain("Обзор");
      expect(state!.labels.join(" ")).toContain("Закупки");
      expect(state!.labels.join(" ")).not.toContain("Документ");
      // Пятно ровно одно, и это «+»
      expect(state!.orange).toEqual(["Создать"]);
      expect(state!.activeOrange).toBe(false);
      expect(state!.small).toEqual([]);
      await expectA11y(page, "нижняя панель");
    });

    test("шторка «+» показывает только работающее @mobile", async ({ page }) => {
      await open(page, "/projects/p-korona/procurement");
      await page.locator('[data-tour="nav-plus"]').click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      const text = await sheet.innerText();
      expect(text).toContain("Запрос поставщикам");
      expect(text).toContain("Поставщик");
      // Голоса и бота в продукте нет — в шторке их тоже быть не должно
      expect(text.toLowerCase()).not.toContain("голос");
      expect(text.toLowerCase()).not.toContain("telegram");
      await expectA11y(page, "шторка «+»");
      // Esc закрывает и возвращает фокус на кнопку, которая её открыла
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(page.locator('[data-tour="nav-plus"]')).toBeFocused();
    });
  });

  test.describe("прораб", () => {
    test.use({ persona: "e-gareev" });

    test("прорабу не предлагается закрытый раздел @mobile", async ({ page }) => {
      await open(page, "/projects/p-korona/field-reports");
      const state = await panel(page);
      // Сегодня, Поставки, «+», Отчёты, Ещё
      expect(state!.labels.join(" ")).toContain("Сегодня");
      expect(state!.labels.join(" ")).toContain("Отчёты");
      expect(state!.labels.join(" ")).not.toContain("Документ");
      expect(state!.labels.join(" ")).not.toContain("Закупки");
      // Первая позиция — рабочий экран роли: панель начинается там же, где начинается день
      expect(state!.labels[0]).toBe("Сегодня");
      expect(state!.orange).toEqual(["Создать"]);
    });
  });

  test.describe("директор", () => {
    test.use({ persona: "e-belyaev" });

    test("у директора нет кнопки создания: прав на запись нет @mobile", async ({ page }) => {
      await open(page, "/projects");
      const state = await panel(page);
      expect(state!.labels).toHaveLength(4);
      expect(state!.orange).toEqual([]);
      await expect(page.locator('[data-tour="nav-plus"]')).toHaveCount(0);
    });
  });
});
