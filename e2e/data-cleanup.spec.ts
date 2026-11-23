import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, open, test } from "./fixtures";
import { mobileCheck } from "./mobile-checks";

/**
 * Удаление данных (ADR-088) на 1440 и 390: смета удаляется из шторки и загружается снова,
 * объект удаляется со страницы объекта, «Очистить данные» в «Настройке» оставляет пустую
 * базу. Файл — обезличенная копия из tests/fixtures/estimates.
 */
const GRAND = join(process.cwd(), "tests/fixtures/estimates/grand-b.xlsx");

async function upload(page: Page) {
  await open(page, "/gas/objects");
  await page.getByTestId("estimate-flow-open").filter({ visible: true }).first().click();
  await page.getByTestId("estimate-flow-input").setInputFiles(GRAND);
  await expect(page.getByTestId("estimate-flow-checks")).toBeVisible({ timeout: 20_000 });
  return page.getByTestId("estimate-flow");
}

async function noOverflow(page: Page, phone: boolean) {
  if (phone) expect((await mobileCheck(page)).overflow.offenders).toEqual([]);
}

async function path(page: Page, phone: boolean) {
  // Смета: загрузили, удалили из шторки, тот же файл загружается снова
  await upload(page);
  await open(page, "/gas/estimates");
  await page.getByTestId("estimate-pending").filter({ hasText: "Смета без объекта" }).click();
  await page.getByTestId("estimate-delete").filter({ visible: true }).click();
  const estimateDialog = page.getByTestId("estimate-delete-dialog");
  await expect(estimateDialog).toContainText("Тот же файл можно будет загрузить заново");
  await noOverflow(page, phone);
  await estimateDialog.getByTestId("delete-confirm-action").click();
  await expect(page.getByText("Смета удалена")).toBeVisible();
  await expect(page.getByTestId("estimate-pending")).toHaveCount(0);

  // Тот же файл снова становится сметой, из неё — объект
  const flow = await upload(page);
  await expect(page.getByTestId("estimate-flow-checks")).not.toContainText("Уже загружена");
  await flow.getByTestId("estimate-flow-next").click();
  await flow.getByTestId("estimate-create-object").click();
  await flow.getByTestId("estimate-create-confirm").click();
  await expect(flow).toHaveAttribute("data-step", "brigades");
  await flow.getByTestId("flow-open-object").click();
  await expect(page).toHaveURL(/\/gas\/objects\//, { timeout: 15_000 });
  const objectUrl = new URL(page.url()).pathname;

  // Смета создала разделы: удаляется только вместе с объектом
  await page.getByTestId("object-path-cost").click();
  await expect(page.getByTestId("estimate-delete-blocked").filter({ visible: true })).toContainText(
    "Удалите объект целиком",
  );
  // На телефоне «назад» закрывает шторку: на объект — по ссылке
  await open(page, objectUrl);

  // Объект: удаляется со страницы со сметой и разделами
  await page.getByTestId("object-delete").click();
  const objectDialog = page.getByTestId("object-delete-dialog");
  await expect(objectDialog).toContainText("1 смета");
  await noOverflow(page, phone);
  await objectDialog.getByTestId("delete-confirm-action").click();
  await expect(page).toHaveURL(/\/gas\/objects$/);
  await expect(page.getByText(/Объект удалён/)).toBeVisible();

  // Очистка: без слова кнопка не нажимается; после — пустая база, справочники на месте
  await open(page, "/gas/admin");
  await page.getByTestId("clear-data-open").click();
  const clearDialog = page.getByTestId("clear-data-dialog");
  const action = clearDialog.getByTestId("delete-confirm-action");
  await expect(action).toBeDisabled();
  await clearDialog.getByTestId("delete-confirm-word").fill("очистить");
  await expect(action).toBeEnabled();
  await noOverflow(page, phone);
  await action.click();
  await expect(page.getByText(/Данные очищены/)).toBeVisible();
  await expect(page.getByTestId("clear-data")).toContainText("Рабочих данных нет");
  await expect(page.getByTestId("clear-data-open")).toBeDisabled();
  await noOverflow(page, phone);
}

test.describe("удаление данных 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("смета, объект, очистка", async ({ page }) => {
    await path(page, false);
  });
});

test.describe("удаление данных 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("смета, объект, очистка @mobile", async ({ page }) => {
    await path(page, true);
  });
});
