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
  const period = page.getByRole("button", { name: "Настроить период проверки" });
  if (await period.isVisible()) await period.click();
  await page.getByLabel("Дата с", { exact: true }).fill("2040-01-01");
  await expect(page.getByText("По фильтрам ничего нет")).toBeVisible();
  await page.getByLabel("Дата с", { exact: true }).fill("");
  await expect(page.getByRole("checkbox", { name: name! })).not.toBeChecked();
  await page.getByRole("checkbox", { name: name! }).check();
  await expectA11y(page, "выбор записей проверки");
  await page.getByRole("button", { name: "Подтвердить выбранные (1)", exact: true }).click();
  // Запись с замечаниями (обратная связь 20.11): перед принятием — окно со списком замечаний
  const ask = page.getByRole("alertdialog");
  const asked = await ask
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (asked) {
    await expect(ask).toContainText(name!.replace("Выбрать ", ""));
    await ask.getByRole("button", { name: "Принять 1", exact: true }).click();
  }
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

test("карточки раскрываются на месте, выбор независим от детали @mobile", async ({ page }) => {
  await open(page, "/gas/moderation");
  const queue = page.getByRole("list", { name: "Очередь проверки" });
  const cards = queue.locator("button[data-queue-card]");
  await expect(cards.first()).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#review-title")).toHaveCount(0);
  const heights = await cards.evaluateAll((buttons) =>
    buttons.map((b) => b.getBoundingClientRect().height),
  );
  expect(new Set(heights).size).toBe(1);
  expect(heights[0]).toBeGreaterThanOrEqual(96);
  await cards.first().focus();
  await cards.first().press("Enter");
  await expect(cards.first()).toHaveAttribute("aria-expanded", "true");
  const detail = queue.getByRole("region", { name: /^Подробности ГЗ-/ });
  await expect(detail).toBeVisible();
  await expect(detail.getByText("Автор", { exact: true }).first()).toBeVisible();
  await expect(detail.getByRole("term").filter({ hasText: /^Внесено$/ })).toBeVisible();
  await expect(detail.getByText("Источник", { exact: true }).first()).toBeVisible();
  const selectable = queue.getByRole("checkbox").and(page.locator(":enabled")).first();
  await selectable.check();
  await expect(cards.first()).toHaveAttribute("aria-expanded", "true");
  await cards.nth(1).click();
  await expect(cards.first()).toHaveAttribute("aria-expanded", "false");
  await expect(cards.nth(1)).toHaveAttribute("aria-expanded", "true");
  await expect(selectable).toBeChecked();
  await cards.nth(1).click();
  await expect(queue.getByRole("region", { name: /^Подробности ГЗ-/ })).toHaveCount(0);
});
