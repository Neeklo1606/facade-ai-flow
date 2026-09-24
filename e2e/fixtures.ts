import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mobileCheck } from "./mobile-checks";

/**
 * Общая оснастка сквозных тестов (ADR-013, п. 3):
 * — любая ошибка в консоли или необработанное исключение роняет тест;
 * — `persona` открывает вкладку за сотрудника без экрана выбора роли (кроме тестов, где выбор
 *   роли и есть сценарий);
 * — проверки EMBER и axe вызываются на экранах явно.
 */
export type Options = { persona: string | null; theme: "light" | "dark" | null };

export const test = base.extend<Options & { consoleGuard: void }>({
  persona: [null, { option: true }],
  /** Тема вкладки: null — умолчание контура (в демонстрации тёмная) */
  theme: [null, { option: true }],

  // Второй аргумент фикстуры Playwright — функция, отдающая значение тесту
  page: async ({ page, persona, theme }, provide) => {
    await page.addInitScript(
      ({ id, mode }) => {
        try {
          if (id) {
            sessionStorage.setItem("neeklo-fieldops-role-chosen", "1");
            sessionStorage.setItem("neeklo-fieldops-start-applied", "1");
            sessionStorage.setItem("neeklo-fieldops-persona", id);
          }
          if (mode) localStorage.setItem("neeklo-fieldops-theme", mode);
        } catch {
          // Приватный режим: тест увидит экран выбора роли
        }
      },
      { id: persona, mode: theme },
    );
    await provide(page);
  },

  consoleGuard: [
    async ({ page }, provide) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text().slice(0, 200));
      });
      page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
      await provide();
      expect(errors, "ошибки в консоли за время теста").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Открыть экран и дождаться, пока уйдут скелетоны */
export async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.locator("main").waitFor();
  // Скелетоны экранов помечены aria-busy: ждём, пока все они уйдут
  await expect(page.locator("main [aria-busy='true'], main [aria-busy='']")).toHaveCount(0, {
    timeout: 20_000,
  });
}

/**
 * Дождаться конца анимаций: во время появления панели текст полупрозрачный, и контраст
 * и цвет, измеренные в этот момент, не те, что видит человек
 */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );
}

/**
 * Правила EMBER на экране: одно оранжевое пятно в содержимом (боковое меню, нижняя панель
 * и уведомления не считаются — у них своё активное состояние) и ни одного капса.
 * Критерии те же, что у проверки 12 пунктов EMBER.
 */
export async function expectEmber(page: Page, screen: string) {
  await settle(page);
  const result = await page.evaluate(() => {
    // Видимость по всей цепочке предков и ненулевой размер: кнопка мобильной панели внутри
    // скрытого на десктопе контейнера не пятно
    const rendered = (el: Element) => {
      const rect = el.getBoundingClientRect();
      return (
        el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const inContent = (el: Element) =>
      !el.closest("[data-sidebar='app']") &&
      !el.closest("[data-sonner-toaster]") &&
      !el.closest("nav[aria-label='Основная навигация']") &&
      !el.closest("section[aria-label='Подсказки по сценарию']");
    const hsl = (c: string) => {
      const x = c.match(/rgba?\(([^)]+)\)/);
      if (!x?.[1]) return null;
      const [r = 0, g = 0, b = 0, a = 1] = x[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      const R = r / 255,
        G = g / 255,
        B = b / 255;
      const max = Math.max(R, G, B),
        min = Math.min(R, G, B);
      const l = (max + min) / 2,
        d = max - min;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      const h =
        d === 0 ? 0 : max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
      return { h: (h * 60 + 360) % 360, s, l, a };
    };
    const isOrange = (c: string) => {
      const v = hsl(c);
      return !!v && v.a >= 0.1 && v.s > 0.6 && v.h >= 8 && v.h <= 34 && v.l > 0.2 && v.l < 0.65;
    };
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)}`;
    /*
     * Пятном считается только то, что видно глазу. Открытое модальное окно закрывает страницу
     * затемнением `bg-black/80` на z-50 (шапка — z-30): оранжевая кнопка под ним даёт почти
     * чёрный пиксель — замерено. Поэтому элемент проверяется на перекрытие в своей же точке:
     * если в центр элемента попадает что-то постороннее, глаз его не видит.
     *
     * Так проверка не зависит от разметки окна. Сужение по `role=dialog` было ошибкой: эту
     * роль носят и всплывающие подсказки Radix, которые ничего не закрывают, и проверка
     * переставала видеть страницу целиком (находка второго круга проверки). Признак «поверх
     * лежит полноэкранный тёмный слой» тоже не годится: под него попадает и оболочка
     * приложения, и декоративное свечение.
     */
    const visibleToEye = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const x = Math.min(Math.max(rect.left + rect.width / 2, 1), innerWidth - 1);
      const y = Math.min(Math.max(rect.top + rect.height / 2, 1), innerHeight - 1);
      const hit = document.elementFromPoint(x, y);
      return !!hit && (el.contains(hit) || hit.contains(el));
    };
    const all = [...document.querySelectorAll("body *")].filter(
      (el) => inContent(el) && rendered(el) && visibleToEye(el),
    );
    const orange: Element[] = [];
    const caps: string[] = [];
    for (const el of all) {
      const s = getComputedStyle(el);
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      const svg = el instanceof SVGElement;
      const hit =
        isOrange(s.backgroundColor) ||
        (parseFloat(s.borderTopWidth) > 0 && isOrange(s.borderTopColor)) ||
        (parseFloat(s.borderLeftWidth) > 0 && isOrange(s.borderLeftColor)) ||
        (ownText && isOrange(s.color)) ||
        (svg && (isOrange(s.stroke) || isOrange(s.fill)));
      if (hit) orange.push(el);
      if (ownText && s.textTransform === "uppercase") caps.push(describe(el));
    }
    const roots = orange.filter((el) => !orange.some((o) => o !== el && o.contains(el)));
    return { orange: roots.map(describe), caps };
  });
  expect(
    result.orange.length,
    `${screen}: оранжевых пятен ${result.orange.join(", ")}`,
  ).toBeLessThanOrEqual(1);
  expect(result.caps, `${screen}: текст капсом`).toEqual([]);
}

/** axe-core: нарушения уровня serious и critical роняют тест */
export async function expectA11y(page: Page, screen: string) {
  await settle(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}, узлов ${v.nodes.length}): ${v.nodes[0]?.target.join(" ")}`);
  expect(serious, `${screen}: нарушения доступности`).toEqual([]);
}

/**
 * Мобильная версия и честность экрана (ADR-015): пометка демонстрации видна в первом экране
 * на любой ширине; на телефоне — без переполнения, с областями нажатия от 44 px, без действий
 * только по наведению и без фокуса за краем экрана
 */
export async function expectMobile(page: Page, screen: string) {
  await settle(page);
  const check = await mobileCheck(page);
  expect(check.demoMarked, `${screen}: пометка демонстрации не видна`).toBe(true);
  if ((page.viewportSize()?.width ?? 1440) >= 768) return;
  expect(check.overflow.offenders, `${screen}: страница шире экрана`).toEqual([]);
  expect(check.small, `${screen}: области нажатия меньше 44 px`).toEqual([]);
  expect(check.hoverOnly, `${screen}: действия только по наведению`).toEqual([]);
  expect(check.offscreenFocusable, `${screen}: фокус уходит за край экрана`).toEqual([]);
}

/**
 * Читаемость текста на фирменном градиенте (ADR-017, п. 9). Пикселей взять неоткуда, поэтому
 * цвет под текстом считается честно: берём стопы `--ember`, проектируем центр строки на ось
 * градиента (135°), смешиваем соседние стопы и накладываем затемнение слоя поверх. Контраст —
 * по WCAG: 3:1 для крупного текста (≥ 24px или ≥ 18,66px полужирный), 4,5:1 для остального.
 */
export async function expectEmberGradient(page: Page, screen: string) {
  await settle(page);
  const bad = await page.evaluate(() => {
    const hero = document.querySelector("main section .bg-ember")?.closest("section");
    if (!hero) return null;
    const hex = (value: string) => {
      const v = value.trim().replace("#", "");
      const full = v.length === 3 ? [...v].map((c) => c + c).join("") : v;
      return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
        a: 1,
      };
    };
    type Rgb = { r: number; g: number; b: number; a: number };
    /*
     * Смешение слоёв рисует браузер: цвета приходят и как `rgba()`, и как `oklab(… / .3)`,
     * и разбирать их строкой — значит однажды тихо пропустить слой (так и случилось).
     */
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const blend = (layers: string[]): Rgb => {
      ctx.clearRect(0, 0, 1, 1);
      for (const layer of layers) {
        ctx.fillStyle = layer;
        ctx.fillRect(0, 0, 1, 1);
      }
      const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: 1 };
    };
    const css = (c: Rgb) => `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)})`;
    const lum = ({ r, g, b }: Rgb) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (a: Rgb, b: Rgb) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
      return (x + 0.05) / (y + 0.05);
    };

    // Стопы градиента из токена: «#hex доля%»
    const ember = getComputedStyle(document.documentElement).getPropertyValue("--ember");
    const stops = [...ember.matchAll(/(#[0-9a-f]{3,8})\s+([\d.]+)%/gi)].map((m) => ({
      color: hex(m[1] as string),
      at: Number(m[2]) / 100,
    }));
    if (stops.length < 2) return [`не разобрать стопы градиента: ${ember}`];

    // Слои поверх градиента: зерно (overlay, 4%) не меняет цвет заметно, затемнение — меняет
    const scrims = [...hero.querySelectorAll(":scope > [aria-hidden]")]
      .map((layer) => getComputedStyle(layer).backgroundColor)
      .filter((color) => color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent");

    const box = hero.getBoundingClientRect();
    // Ось градиента 135deg: слева сверху вправо вниз
    const axis = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    const length = Math.abs(box.width * axis.x) + Math.abs(box.height * axis.y);
    const colorAt = (x: number, y: number) => {
      const t = Math.min(
        1,
        Math.max(0, ((x - box.left) * axis.x + (y - box.top) * axis.y) / length),
      );
      let base = stops[stops.length - 1]!.color;
      for (let i = 0; i < stops.length - 1; i += 1) {
        const a = stops[i]!;
        const b = stops[i + 1]!;
        if (t >= a.at && t <= b.at) {
          const k = b.at === a.at ? 0 : (t - a.at) / (b.at - a.at);
          base = {
            r: a.color.r + (b.color.r - a.color.r) * k,
            g: a.color.g + (b.color.g - a.color.g) * k,
            b: a.color.b + (b.color.b - a.color.b) * k,
            a: 1,
          };
          break;
        }
      }
      return blend([css(base), ...scrims]);
    };

    const problems: string[] = [];
    const texts = [...hero.querySelectorAll("*")].filter((el) =>
      [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()),
    );
    for (const el of texts) {
      const style = getComputedStyle(el);
      const color = style.color;
      const size = parseFloat(style.fontSize);
      const weight = Number(style.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      // Меряем по строкам текста, а не по блоку: пустое место справа от короткой строки
      // фон не портит, а блок растянут на всю ширину карточки
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const rect of [...range.getClientRects()]) {
        if (rect.width < 1 || rect.height < 1) continue;
        // Худший край строки: в 135° это правый нижний, там градиент светлее всего
        const under = colorAt(rect.right, rect.bottom);
        const ratio = contrast(blend([css(under), color]), under);
        if (ratio < need) {
          const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
          problems.push(`«${text}» — ${ratio.toFixed(2)}:1 при норме ${need}:1`);
          break;
        }
      }
    }
    return problems;
  });
  if (bad === null) return; // на экране нет главной метрики
  expect(bad, `${screen}: текст на градиенте`).toEqual([]);
}
