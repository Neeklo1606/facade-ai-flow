import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { mobileCheck } from "./mobile-checks";

/**
 * Пошаговая загрузка сметы (ADR-089) на 1440 и 390: тип сметы и разделы отчёта, «Нет,
 * исправить», назад и вперёд, подтверждение стоимости в мастере, роли разделов на объекте,
 * бригада: изменить, привязать к объекту, удаление запрещено при записях, ручной ввод окном.
 * Файлы — обезличенные копии из tests/fixtures/estimates.
 */
const FIXTURES = join(process.cwd(), "tests/fixtures/estimates");
const UNDERGROUND = join(FIXTURES, "grand-b.xlsx");
const STEEL_PRESSURE = join(FIXTURES, "grand-a.xlsx");

async function noOverflow(page: Page, phone: boolean) {
  if (phone) expect((await mobileCheck(page)).overflow.offenders).toEqual([]);
}

async function startUpload(page: Page, file: string) {
  await open(page, "/gas/estimates");
  await page.getByTestId("estimate-flow-open").filter({ visible: true }).first().click();
  const flow = page.getByTestId("estimate-flow");
  await expect(flow).toHaveAttribute("data-step", "file");
  await page.getByTestId("estimate-flow-input").setInputFiles(file);
  await expect(flow).toHaveAttribute("data-step", "check", { timeout: 20_000 });
  return flow;
}

async function path(page: Page, phone: boolean) {
  // Проверка: тип сметы, в отчёт только сталь, остальное ниже и без подсветки
  const flow = await startUpload(page, UNDERGROUND);
  await expect(flow.getByTestId("estimate-flow-kind")).toHaveAttribute("data-kind", "underground");
  await expect(flow.getByTestId("estimate-flow-kind")).toContainText("Подземный газопровод");
  const sections = flow.getByTestId("estimate-section");
  await expect(sections).toHaveCount(5);
  await expect(sections.first()).toContainText("стальных");
  await expect(flow.locator("li[data-report='true']")).toHaveCount(1);
  await expect(flow).toContainText("в отчёт выработки: 1 из 5");
  await sections.first().click();
  await expect(flow).toContainText("СМР = итого − материалы");
  await noOverflow(page, phone);

  // «Нет, исправить» открывает правку; «Назад» и снова вперёд — разбор на месте
  await flow.getByTestId("estimate-flow-fix-open").click();
  await expect(flow.getByTestId("estimate-flow-fix")).toBeVisible();
  await flow.getByTestId("estimate-flow-back").click();
  await expect(flow).toHaveAttribute("data-step", "file");
  await flow.getByTestId("estimate-flow-continue").click();
  await expect(flow).toHaveAttribute("data-step", "check");

  // Да, верно → объект → бригады → стоимость
  await flow.getByTestId("estimate-flow-next").click();
  await expect(flow).toHaveAttribute("data-step", "object");
  await flow.getByTestId("estimate-create-object").click();
  await flow.getByTestId("estimate-create-confirm").click();
  await expect(flow).toHaveAttribute("data-step", "brigades");
  await expect(flow.getByTestId("flow-section").first()).toHaveAttribute("data-report", "true");
  await flow
    .getByRole("combobox", { name: "Всем разделам одну бригаду" })
    .selectOption({ label: "Бригада 1" });
  await expect(flow.getByTestId("flow-brigades-summary")).toContainText("Назначено 5 из 5");
  await noOverflow(page, phone);
  await flow.getByTestId("flow-brigades-next").click();
  await expect(flow).toHaveAttribute("data-step", "cost");
  await expect(flow.getByTestId("estimate-flow-cost")).toContainText("СМР");
  await flow.getByTestId("estimate-flow-confirm").click();
  await expect(flow.getByTestId("estimate-flow-confirmed")).toBeVisible();
  await flow.getByTestId("estimate-flow-to-object").click();
  await expect(page).toHaveURL(/\/gas\/objects\//, { timeout: 15_000 });

  // Объект: отчётные разделы первыми и подписаны
  const rows = page.getByTestId("section-row");
  await expect(rows.first()).toHaveAttribute("data-report", "true");
  await expect(page.getByTestId("object-sections")).toContainText("Другие работы");
  await noOverflow(page, phone);

  // Незаконченная загрузка продолжается с того же шага
  await startUpload(page, STEEL_PRESSURE);
  await expect(page.getByTestId("estimate-flow-kind")).toHaveAttribute(
    "data-kind",
    "steel-pressure",
  );
  await page.keyboard.press("Escape");
  await page.getByTestId("estimate-flow-open").filter({ visible: true }).first().click();
  await expect(page.getByTestId("estimate-flow")).toHaveAttribute("data-step", "check");
  await page.keyboard.press("Escape");

  // Ручной ввод — окно по центру с выбором объекта списком
  await page.getByTestId("estimate-manual-open").click();
  const manual = page.getByTestId("estimate-manual");
  await expect(manual).toBeVisible();
  await expect(manual.getByTestId("estimate-manual-object")).toBeVisible();
  const box = await manual.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(4);
  await noOverflow(page, phone);
  await page.keyboard.press("Escape");

  // Бригада: изменить, привязать к объекту, удалить нельзя — есть записи
  await open(page, "/gas/brigades");
  await page.getByRole("button", { name: /^Бригада 2 / }).click();
  const panel = page.getByRole("dialog", { name: "Бригада 2", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("brigade-delete-blocked")).toBeVisible();
  await panel.getByTestId("brigade-bind").click();
  const bind = page.getByTestId("brigade-bind-dialog");
  await bind.getByTestId("brigade-bind-object").selectOption({ index: 1 });
  await expect(bind.getByRole("checkbox", { name: /стальных/ })).toBeChecked();
  await expect(bind.getByRole("checkbox", { name: /Земляные/ })).not.toBeChecked();
  await noOverflow(page, phone);
  await bind.getByTestId("brigade-bind-save").click();
  await expect(panel.getByTestId("brigade-object")).toHaveCount(1);

  await panel.getByTestId("brigade-edit").click();
  const edit = page.getByTestId("brigade-edit-dialog");
  await edit.getByRole("textbox", { name: "Название", exact: true }).fill("Бригада Вторая");
  await edit.getByTestId("brigade-edit-save").click();
  await expect(page.getByText("Бригада сохранена")).toBeVisible();
}

test.describe("мастер сметы и бригады 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("тип сметы, шаги, стоимость, бригада", async ({ page }) => {
    await path(page, false);
  });
});

test.describe("мастер сметы и бригады 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("тип сметы, шаги, стоимость, бригада @mobile", async ({ page }) => {
    await path(page, true);
  });
});
