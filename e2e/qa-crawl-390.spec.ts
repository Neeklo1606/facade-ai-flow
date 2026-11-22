import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

/**
 * Дефекты обхода всех кнопок за все роли на 390 (QA перед показом 23.11.2026,
 * `scripts/qa-crawl.ts`, раздел 2 плана `docs/qa/CRITICAL_TEST_PLAN.md`). На каждый
 * исправленный дефект своя проверка, чтобы он не вернулся.
 */

/** Обрезанные многоточием тексты без подсказки с полным текстом (то же правило, что в обходчике) */
async function clippedWithoutHint(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>("main *").forEach((el) => {
      if (!el.innerText || el.children.length > 3) return;
      const s = getComputedStyle(el);
      if (s.textOverflow !== "ellipsis" || s.overflow === "visible") return;
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        if (n.getAttribute("title") || n.getAttribute("aria-label")) return;
        if (n.tagName === "BUTTON" || n.tagName === "A") break;
      }
      out.push(el.innerText.slice(0, 60));
    });
    return out;
  });
}

test.describe("обход кнопок, 390 @mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "gaika-tour-seen",
        JSON.stringify(["foreman", "manager", "director", "prorab", "supply", "pto", "admin"]),
      );
    });
  });

  test("бригадир: статус записи под адресом, адрес не сжат @mobile", async ({ page }) => {
    await open(page, "/gas");
    await gasRole(page, "Бригадир");
    await open(page, "/gas/brigade");
    const rows = page.locator("section[aria-labelledby='my-entries'] li");
    await expect(rows.first()).toBeVisible();
    const boxes = await rows.evaluateAll((items) =>
      items.slice(0, 5).map((li) => {
        const title = li.querySelector("p")!.getBoundingClientRect();
        const status = li.querySelector("[data-entry-status]")!.getBoundingClientRect();
        return { width: title.width, titleBottom: title.bottom, statusTop: status.top };
      }),
    );
    for (const box of boxes) {
      // Было 100 px: статус справа съедал строку, запись шла в шесть строк
      expect(box.width).toBeGreaterThan(220);
      expect(box.statusTop).toBeGreaterThanOrEqual(box.titleBottom - 1);
    }
    expect(await clippedWithoutHint(page)).toEqual([]);
  });

  test("журнал: строка времени записи читается, не 33 px @mobile", async ({ page }) => {
    await open(page, "/gas");
    await gasRole(page, "Администратор");
    await open(page, "/gas/entries");
    const lines = page.locator("[data-queue-card] [data-row-line]");
    await expect(lines.first()).toBeVisible();
    const widths = await lines.evaluateAll((spans) =>
      spans.slice(0, 8).map((span) => span.getBoundingClientRect().width),
    );
    for (const width of widths) expect(width).toBeGreaterThan(150);
    expect(await clippedWithoutHint(page)).toEqual([]);
  });

  test("списки смет, сотрудников, бригад, объектов: обрезка с подсказкой @mobile", async ({
    page,
  }) => {
    await open(page, "/gas");
    await gasRole(page, "Администратор");
    for (const path of ["/gas/estimates", "/gas/employees", "/gas/brigades", "/gas/objects"]) {
      await open(page, path);
      expect(await clippedWithoutHint(page), path).toEqual([]);
    }
  });

  test("нижняя панель: подписи «Документы» и «Материалы» целиком @mobile", async ({ page }) => {
    await open(page, "/gas");
    await gasRole(page, "ПТО");
    await open(page, "/gas/docs");
    const labels = page.locator("nav[aria-label='Основные разделы'] .mono-tab > span:last-child");
    await expect(labels.first()).toBeVisible();
    const cut = await labels.evaluateAll((spans) =>
      spans.filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent),
    );
    expect(cut).toEqual([]);
  });

  test("инверсная плитка показателей читается: снабженец и ПТО @mobile", async ({ page }) => {
    // Стекло красило `mono-card-inverse` светлым фоном при светлом тексте
    for (const [role, path] of [
      ["Снабженец", "/gas/supply"],
      ["ПТО", "/gas/docs"],
    ] as const) {
      await open(page, "/gas");
      await gasRole(page, role);
      await open(page, path);
      const card = page.locator("main .mono-card-inverse").first();
      await expect(card).toBeVisible();
      const ratio = await card.evaluate((el) => {
        const ctx = document.createElement("canvas").getContext("2d")!;
        const rgb = (color: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
          return [r!, g!, b!];
        };
        const lum = ([r, g, b]: number[]) => {
          const c = [r!, g!, b!].map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
        };
        const s = getComputedStyle(el);
        const a = lum(rgb(s.backgroundColor));
        const b = lum(rgb(s.color));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ratio, `${role} ${path}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("окно приглашения: крестик закрытия от 44 px @mobile", async ({ page }) => {
    await open(page, "/gas");
    await gasRole(page, "Администратор");
    await open(page, "/gas/employees");
    await page.getByRole("button", { name: "Пригласить сотрудника" }).first().click();
    const close = page.getByRole("dialog").getByRole("button", { name: "Закрыть окно" });
    await expect(close).toBeVisible();
    const box = (await close.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("табель, «Вид и фильтры»: флажки и порядок от 44 px @mobile", async ({ page }) => {
    await open(page, "/gas");
    await gasRole(page, "Менеджер проверки");
    await open(page, "/gas/tabel");
    // На телефоне табель открывается списком, шторка вида у таблицы
    await page.getByRole("button", { name: "Открыть как таблицу" }).click();
    await page.getByRole("button", { name: /^Вид и фильтры/ }).click();
    const dialog = page.getByRole("dialog");
    const targets = [
      ...(await dialog.getByRole("list", { name: "Показатели" }).locator("label").all()),
      ...(await dialog.getByRole("radio").all()),
    ];
    expect(targets.length).toBeGreaterThan(2);
    for (const target of targets) {
      const box = (await target.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});
