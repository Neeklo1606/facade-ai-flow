import { expect, expectA11y, open, test } from "./fixtures";

/**
 * Нижняя панель (ADR-026, карта ГАЙКИ — ADR-034, п. 1; вид ADR-045 «Финальный интерфейс», 4.3).
 * Решение владельца 21.10.2026: панель плоская, 56 + safe-area, активный пункт иконкой
 * и подписью акцентом с точкой под подписью, без таблетки. Оранжевый в панели только у
 * активного пункта: ни заливки, ни свечения у голосовой кнопки (правка `032b15b` от 18.10
 * про свечение остаётся). Голосовая кнопка строго по центру экрана при любом числе пунктов
 * (refs/16: у снабжения на «Объектах» она уезжала вправо). Набор позиций одинаков для всех
 * ролей, меняется только первая.
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
      // Акцент разрешён только активному пункту: иконка, подпись и точка «где я»
      if (el.closest('[aria-current="page"]')) continue;
      if (isOrange(style.backgroundColor) || isOrange(style.color)) {
        orange.push((el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24));
      }
      if (
        (el.tagName === "A" || el.tagName === "BUTTON") &&
        (rect.height < 44 || rect.width < 40)
      ) {
        small.push(`${(el.textContent || "").trim().slice(0, 16)}: ${Math.round(rect.height)}px`);
      }
    }
    const active = nav.querySelector('[aria-current="page"]');
    /*
     * Голосовая капсула. С 18.10.2026 (правка владельца `032b15b`) она без свечения:
     * 56 px, в обводке линии, на фоне `--pill`. Раньше была 64 px с оранжевым свечением
     * (ADR-041) — поменялось решение, а не проверка под код. Поэтому здесь возвращается
     * её подпись и то, светится ли она, а сравнение живёт в самих проверках.
     */
    const capsule = nav.querySelector('[data-tour="nav-plus"]');
    const glow = capsule ? getComputedStyle(capsule).boxShadow : "";
    const box = capsule?.getBoundingClientRect();
    return {
      capsuleOffset: box ? Math.round(box.left + box.width / 2 - window.innerWidth / 2) : null,
      capsuleSize: box ? Math.round(Math.min(box.width, box.height)) : null,
      capsule: capsule?.getAttribute("aria-label")?.slice(0, 24) ?? null,
      capsuleGlows: /255,\s*122,\s*69/u.test(glow),
      // Пустые ячейки держат микрофон по центру: в набор позиций они не входят
      labels: [...nav.children]
        .filter((child) => child.getAttribute("aria-hidden") !== "true")
        .map((child) => (child.textContent || "").replace(/\s+/g, " ").trim().slice(0, 18)),
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

    test("позиции роли, оранжевый только у активной, микрофон по центру @mobile", async ({
      page,
    }) => {
      await open(page, "/projects/p-korona/procurement");
      const state = await panel(page);
      expect(state, "панель не найдена").not.toBeNull();
      expect(state!.height).toBeGreaterThanOrEqual(56);
      // Обзор, Объект, кнопка записи, Входящие, Ещё — карта ГАЙКИ (ADR-034, п. 1)
      expect(state!.labels).toHaveLength(5);
      expect(state!.labels.join(" ")).toContain("Обзор");
      expect(state!.labels.join(" ")).toContain("Входящие");
      // Модулей прежнего контура в панели нет: они за флагом (ADR-034, п. 4)
      expect(state!.labels.join(" ")).not.toContain("Закупки");
      expect(state!.labels.join(" ")).not.toContain("Документ");
      /*
       * Панель — хром: оранжевый только у активной позиции (4.3), у голосовой кнопки нет
       * ни заливки, ни свечения. Кнопка 56, строго по центру экрана, называется «Говорить».
       */
      expect(state!.orange).toHaveLength(0);
      expect(state!.capsule).toContain("Говорить");
      expect(state!.capsuleGlows).toBe(false);
      expect(state!.capsuleSize).toBeGreaterThanOrEqual(56);
      expect(Math.abs(state!.capsuleOffset ?? 99)).toBeLessThanOrEqual(1);
      // На закупках объекта ни одна позиция не «здесь»; если активная есть, она акцентом
      expect(state!.activeOrange ?? true).toBe(true);
      expect(state!.small).toEqual([]);
      await expectA11y(page, "нижняя панель");
    });

    test("центральная кнопка ведёт на запись @mobile", async ({ page }) => {
      await open(page, "/projects/p-korona/procurement");
      // Касание открывает экран записи: кнопка называется «Говорить» и больше не обещает форму
      await page.locator('[data-tour="nav-plus"]').click();
      await expect(page).toHaveURL(/\/capture$/);
      await expect(page.getByRole("heading", { name: "Запись", level: 1 })).toBeVisible();
      await expectA11y(page, "экран записи");
    });

    test("создание роли открывается из «Ещё» @mobile", async ({ page }) => {
      await open(page, "/projects/p-korona/procurement");
      await page.getByRole("button", { name: /Ещё/ }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      const text = await sheet.innerText();
      // Прогон идёт с включённым флагом legacy_modules: действия модулей на месте.
      // Что видно без флага, проверяет legacy.spec.ts
      expect(text).toContain("Запрос поставщикам");
      expect(text).toContain("Поставщик");
      // Бота в продукте нет
      expect(text.toLowerCase()).not.toContain("telegram");
      await expectA11y(page, "шторка «Ещё»");
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    });

    test("на «Объектах» три позиции, микрофон всё равно по центру (refs/16) @mobile", async ({
      page,
    }) => {
      await open(page, "/projects");
      const state = await panel(page);
      expect(state!.capsule).toContain("Говорить");
      expect(Math.abs(state!.capsuleOffset ?? 99)).toBeLessThanOrEqual(1);
      // «Объекты» активна: иконка и подпись акцентом, остального оранжевого в панели нет
      expect(state!.activeOrange).toBe(true);
      expect(state!.orange).toEqual([]);
    });
  });

  test.describe("прораб", () => {
    test.use({ persona: "e-gareev" });

    test("прорабу не предлагается закрытый раздел @mobile", async ({ page }) => {
      await open(page, "/projects/p-korona/field-reports");
      const state = await panel(page);
      // Сегодня, Объект, кнопка записи, Входящие, Ещё
      expect(state!.labels.join(" ")).toContain("Сегодня");
      expect(state!.labels.join(" ")).toContain("Входящие");
      expect(state!.labels.join(" ")).not.toContain("Документ");
      expect(state!.labels.join(" ")).not.toContain("Закупки");
      // Первая позиция — рабочий экран роли: панель начинается там же, где начинается день
      expect(state!.labels[0]).toBe("Сегодня");
      expect(state!.capsule).toContain("Говорить");
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
