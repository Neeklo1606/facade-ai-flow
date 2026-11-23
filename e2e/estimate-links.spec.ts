import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { mobileCheck } from "./mobile-checks";

/**
 * Связки после загрузки сметы (ручной проход 24.11.2026), на 1440 и 390:
 * - ноль чел.-ч в разделе — «норматива нет», а не «есть во всех разделах»;
 * - «Подтвердить стоимость» на странице объекта открывает шторку этой сметы, а не список;
 * - вторая смета того же номера — версия 2: мастер говорит, что разделы пока прежние;
 * - запись на странице объекта подписана названием раздела, а не служебным ключом.
 * Файлы — обезличенные копии из tests/fixtures/estimates (у обеих один номер сметы).
 */
const FIXTURES = join(process.cwd(), "tests/fixtures/estimates");
const GRAND = join(FIXTURES, "grand-b.xlsx");
const RESOURCE = join(FIXTURES, "resource-a.xls");

async function upload(page: Page, file: string) {
  await open(page, "/gas/objects");
  await page.getByTestId("estimate-flow-open").filter({ visible: true }).first().click();
  const flow = page.getByTestId("estimate-flow");
  await page.getByTestId("estimate-flow-input").setInputFiles(file);
  await expect(page.getByTestId("estimate-flow-checks")).toBeVisible({ timeout: 20_000 });
  return flow;
}

async function path(page: Page, phone: boolean) {
  // П1–П2 мастер: ноль чел.-ч в разделе 1 честно назван
  let flow = await upload(page, GRAND);
  await expect(page.getByTestId("estimate-flow-checks")).toContainText(
    "есть в 4 из 5 разделов: остальные начисляются вручную",
  );
  await flow.getByTestId("estimate-flow-next").click();
  await flow.getByTestId("estimate-create-object").click();
  await flow.getByTestId("estimate-create-confirm").click();
  await expect(flow).toHaveAttribute("data-step", "brigades");
  await flow
    .getByRole("combobox", { name: "Всем разделам одну бригаду" })
    .selectOption({ label: "Бригада 1" });
  await expect(flow.getByTestId("flow-brigades-summary")).toContainText("Назначено 5 из 5");
  await flow.getByTestId("flow-open-object").click();
  await expect(page).toHaveURL(/\/gas\/objects\//, { timeout: 15_000 });
  const objectUrl = page.url();
  await expect(page.getByTestId("object-sections")).toContainText(
    "норматива т/з нет: долю вводит менеджер",
  );

  // «Подтвердить стоимость» — шторка именно этой сметы
  await page.getByTestId("object-path-cost").click();
  await expect(page).toHaveURL(/\/gas\/estimates\?open=/);
  const sheet = page.getByRole("dialog").filter({ hasText: "Ореховая" });
  await expect(sheet.getByRole("button", { name: "Подтвердить смету" })).toBeVisible();
  if (phone) expect((await mobileCheck(page)).overflow.offenders).toEqual([]);

  // Вторая смета того же номера: версия 2, разделы пока по прежней версии
  flow = await upload(page, RESOURCE);
  await expect(page.getByTestId("estimate-flow-checks")).toContainText("по номеру сметы");
  await flow.getByTestId("estimate-flow-next").click();
  const note = flow.getByTestId("estimate-flow-new-version");
  await expect(note).toContainText("Это версия 2 сметы объекта");
  await expect(note).toContainText("Разделы и начисления пока идут по прежней версии");
  await expect(note.getByRole("link", { name: "Подтвердить стоимость версии 2" })).toBeVisible();
  if (phone) expect((await mobileCheck(page)).overflow.offenders).toEqual([]);

  return objectUrl;
}

test.describe("связки сметы 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("ноль чел.-ч, стоимость этой сметы, версия 2", async ({ page }) => {
    await path(page, false);
  });
});

test.describe("связки сметы 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("ноль чел.-ч, стоимость этой сметы, версия 2 @mobile", async ({ page }) => {
    await path(page, true);
  });
});
