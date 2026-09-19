import { expectA11y, expectEmber, open, test } from "./fixtures";

/**
 * Правила EMBER и доступность на всех экранах — на десктопе и на телефоне (@mobile).
 * Роль руководителя: ему открыты все разделы.
 */
const screens: [string, string][] = [
  ["дашборд", "/"],
  ["реестр объектов", "/projects"],
  ["карточка объекта", "/projects/p-korona"],
  ["ход работ", "/projects/p-korona?tab=progress"],
  ["команда", "/projects/p-korona?tab=team"],
  ["документация", "/projects/p-korona/documents"],
  ["проверка позиций", "/projects/p-korona/documents/pd-korona-spec"],
  ["материалы", "/projects/p-korona/materials"],
  ["закупки", "/projects/p-korona/procurement"],
  ["поставщики", "/projects/p-korona/procurement?view=suppliers"],
  ["сравнение предложений", "/projects/p-korona/procurement/sr-323"],
  ["поставки", "/projects/p-korona/deliveries"],
  ["отчёты с площадки", "/projects/p-korona/field-reports"],
  ["история и решения", "/projects/p-korona/timeline"],
  ["ассистент", "/agent"],
  ["права доступа", "/access"],
  ["справочники", "/catalogs"],
  ["материалы без загруженных позиций", "/projects/p-meridian/materials"],
];

test.describe("экраны", () => {
  test.use({ persona: "e-sokolov" });
  for (const [name, path] of screens) {
    test(`${name} @mobile`, async ({ page }) => {
      await open(page, path);
      await expectEmber(page, name);
      await expectA11y(page, name);
    });
  }
});

test.describe("экран «Нет доступа»", () => {
  test.use({ persona: "e-gareev" });
  test("прораб в чужом разделе @mobile", async ({ page }) => {
    await page.goto("/projects/p-korona/procurement", { waitUntil: "domcontentloaded" });
    await page.locator("[data-screen=no-access]").waitFor();
    await expectEmber(page, "нет доступа");
    await expectA11y(page, "нет доступа");
  });
});
