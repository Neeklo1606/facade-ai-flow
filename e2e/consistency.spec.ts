import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";

/**
 * Одна цифра — одинаковая на всех экранах (Q8, п. 2). Скрипт читает то, что видит человек:
 * подписанные числа дашборда, реестра, карточки объекта, документации, проверки, материалов,
 * закупок и поставок, — и сверяет их между собой. Затем меняет данные действием на экране
 * и сверяет снова. Порты сверяет tests/consistency; здесь — что экраны показывают их одинаково.
 */

const number = (text: string) => {
  const clean = text.replace(/[\s\u00a0\u202f]/g, "");
  return clean === "—" || clean === "" ? 0 : Number(clean.match(/-?\d+/)?.[0] ?? NaN);
};

/** Число под подписью: в тексте экрана подпись и значение идут строками подряд */
async function tile(page: Page, label: string) {
  const lines = (await page.locator("main").innerText())
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const at = lines.indexOf(label);
  expect(at, `подпись «${label}» на экране ${page.url()}`).toBeGreaterThanOrEqual(0);
  return number(lines[at + 1] ?? "");
}

/** Строки реестра объектов: значения по заголовкам колонок */
async function registryRows(page: Page) {
  const table = page.locator("main table").first();
  const headers = (await table.locator("thead th").allInnerTexts()).map((text) => text.trim());
  const rows = await table.locator("tbody tr").all();
  return Promise.all(
    rows.map(async (row) => {
      const cells = (await row.locator("th, td").allInnerTexts()).map((text) => text.trim());
      const value = (header: string) => number(cells[headers.indexOf(header)] ?? "");
      return {
        name: cells.join(" "),
        positions: value("Позиций"),
        unverified: value("Непроверено"),
        overdue: value("Просрочено"),
        changes: value("Изменений"),
      };
    }),
  );
}

interface Numbers {
  dashboard: { unverified: number; overdue: number };
  registry: { unverified: number; overdue: number; changes: number };
  rows: Awaited<ReturnType<typeof registryRows>>;
  card: {
    positions: number;
    unverified: number;
    overdue: number;
    inTransit: number;
    delivered: number;
  };
  documents: { extracted: number; verified: number };
  review: { verified: number; total: number };
  materials: { positions: number; verified: number; delivered: number };
  procurement: { overdue: number };
  deliveries: { delivered: number; inTransit: number };
}

async function read(page: Page): Promise<Numbers> {
  await open(page, "/");
  const dashboard = {
    unverified: await tile(page, "Позиций ждёт проверки"),
    overdue: await tile(page, "Просроченных ответов"),
  };
  await open(page, "/projects");
  const registry = {
    unverified: await tile(page, "Непроверенных строк"),
    overdue: await tile(page, "Просроченных ответов"),
    changes: await tile(page, "Открытых изменений"),
  };
  const rows = await registryRows(page);

  await open(page, "/projects/p-korona");
  // Воронка «Материалы и закупки»: число шага в отдельном элементе, рядом с процентом
  const funnelDelivered = await page
    .locator("main li")
    .filter({ has: page.locator("span.truncate", { hasText: /^Поставлено$/ }) })
    .locator("span.tnum.font-semibold")
    .innerText();
  const card = {
    positions: await tile(page, "Позиций материалов"),
    unverified: await tile(page, "Непроверенных"),
    overdue: await tile(page, "Просроченных запросов"),
    inTransit: await tile(page, "В пути"),
    delivered: number(funnelDelivered),
  };

  await open(page, "/projects/p-korona/documents");
  const documents = {
    extracted: await tile(page, "Извлечено позиций"),
    verified: await tile(page, "Проверено"),
  };

  await open(page, "/projects/p-korona/documents/pd-korona-spec");
  const progress = (await page.locator("main").innerText()).match(
    /Проверено\s+(\d[\d\u00a0\u202f]*)\s+из\s+(\d[\d\u00a0\u202f]*)/,
  );
  const review = { verified: number(progress?.[1] ?? ""), total: number(progress?.[2] ?? "") };

  await open(page, "/projects/p-korona/materials");
  const summary = (await page.locator("main").innerText()).match(
    /Позиций\s+(\d[\d\u00a0\u202f]*)\s+·\s+проверено\s+(\d[\d\u00a0\u202f]*)\s+·/,
  );
  const materials = {
    positions: number(summary?.[1] ?? ""),
    verified: number(summary?.[2] ?? ""),
    delivered: await tile(page, "Поставлено"),
  };

  await open(page, "/projects/p-korona/procurement");
  const procurement = { overdue: await tile(page, "Просрочены") };

  await open(page, "/projects/p-korona/deliveries");
  const deliveries = {
    delivered: await tile(page, "Поставлено позиций"),
    inTransit: await tile(page, "В пути, позиций"),
  };

  return { dashboard, registry, rows, card, documents, review, materials, procurement, deliveries };
}

function mismatches(n: Numbers) {
  const issues: string[] = [];
  const same = (what: string, values: Record<string, number>) => {
    const distinct = new Set(Object.values(values));
    if (distinct.size !== 1) {
      issues.push(
        `${what}: ${Object.entries(values)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ")}`,
      );
    }
  };
  const sum = (key: "unverified" | "overdue" | "changes") =>
    n.rows.reduce((acc, row) => acc + row[key], 0);
  const korona = n.rows.find((row) => row.name.includes("Северная Корона"));
  if (!korona) return ["в реестре нет строки «Северная Корона»"];

  same("ждут проверки, все объекты", {
    дашборд: n.dashboard.unverified,
    "шапка реестра": n.registry.unverified,
    "сумма строк реестра": sum("unverified"),
  });
  same("просроченные ответы, все объекты", {
    дашборд: n.dashboard.overdue,
    "шапка реестра": n.registry.overdue,
    "сумма строк реестра": sum("overdue"),
  });
  same("открытые изменения", {
    "шапка реестра": n.registry.changes,
    "сумма строк": sum("changes"),
  });
  same("позиций на объекте", {
    реестр: korona.positions,
    карточка: n.card.positions,
    документация: n.documents.extracted,
    проверка: n.review.total,
    материалы: n.materials.positions,
  });
  same("непроверенных на объекте", {
    реестр: korona.unverified,
    карточка: n.card.unverified,
    "документация (извлечено − проверено)": n.documents.extracted - n.documents.verified,
    "проверка (всего − проверено)": n.review.total - n.review.verified,
    "материалы (позиций − проверено)": n.materials.positions - n.materials.verified,
  });
  same("просроченные запросы объекта", {
    реестр: korona.overdue,
    карточка: n.card.overdue,
    закупки: n.procurement.overdue,
  });
  same("поставлено позиций", {
    "карточка, воронка": n.card.delivered,
    материалы: n.materials.delivered,
    поставки: n.deliveries.delivered,
  });
  same("в пути, позиций", { карточка: n.card.inTransit, поставки: n.deliveries.inTransit });
  return issues;
}

test.describe("одна цифра на всех экранах", () => {
  test.use({ persona: "e-sokolov" });

  test("стартовые данные и после проверки пачкой — цифры сходятся", async ({ page }) => {
    test.setTimeout(180_000);
    const before = await read(page);
    expect(mismatches(before)).toEqual([]);

    // Действие на экране меняет цифры: подтверждаем все позиции с высокой уверенностью
    await open(page, "/projects/p-korona/documents/pd-korona-spec");
    await page.getByRole("button", { name: "Подтвердить все проверенные" }).click();
    await expect(page.locator("[data-sonner-toast]", { hasText: /Подтверждено/ })).toBeVisible();

    const after = await read(page);
    expect(mismatches(after)).toEqual([]);
    expect(after.review.verified, "проверенных стало больше").toBeGreaterThan(
      before.review.verified,
    );
    expect(after.dashboard.unverified).toBe(
      before.dashboard.unverified - (after.review.verified - before.review.verified),
    );
  });
});
