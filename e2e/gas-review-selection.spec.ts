import { expect, expectA11y, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

test("выбор видимых часов, даты, подтверждение и отмена @mobile", async ({ page }) => {
  await open(page, "/gas/moderation");
  const rows = page.getByRole("list", { name: "Очередь проверки" });
  const available = rows
    .getByRole("checkbox")
    .filter({ visible: true })
    .and(page.locator(":enabled"));
  await expect(available.first()).toBeVisible();
  const first = available.first();
  const name = await first.getAttribute("aria-label");
  await first.check();
  await expect(page.getByRole("status").filter({ hasText: "Выбрано:" })).toHaveText("Выбрано: 1");
  await page.getByLabel("Дата с", { exact: true }).fill("2040-01-01");
  await expect(page.getByText("По фильтрам ничего нет")).toBeVisible();
  await page.getByLabel("Дата с", { exact: true }).fill("");
  await expect(page.getByRole("checkbox", { name: name! })).not.toBeChecked();
  await page.getByRole("checkbox", { name: name! }).check();
  await expectA11y(page, "выбор записей проверки");
  await page.getByRole("button", { name: "Подтвердить выбранные (1)", exact: true }).click();
  await expect(page.getByText("Часы учтены в табеле на исходные даты и объекты")).toBeVisible();
  await expect(rows.getByRole("checkbox", { name: name! })).toHaveCount(0);
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(rows.getByRole("checkbox", { name: name! })).toBeVisible();
  const size = await rows.getByRole("checkbox", { name: name! }).locator("..").boundingBox();
  expect(size?.width).toBeGreaterThanOrEqual(48);
  expect(size?.height).toBeGreaterThanOrEqual(48);
});

test("руководитель переходит из бригад к загрузке сметы @mobile", async ({ page }) => {
  await open(page, "/gas/brigades");
  await gasRole(page, "Руководитель");
  await page.goto("/gas/brigades");
  await page.getByRole("link", { name: "Сметы", exact: true }).last().click();
  await expect(page).toHaveURL(/\/gas\/estimates/);
  await page.getByRole("button", { name: "Загрузить смету", exact: true }).click();
  await expect(page.getByTestId("estimate-file")).toBeAttached();
});
