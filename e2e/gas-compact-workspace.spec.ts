import { expect, expectA11y, open, test } from "./fixtures";
import { gasRole } from "./gas-helpers";

test("период проверки: неделя, пустой диапазон и возврат ко всем датам @mobile", async ({
  page,
}) => {
  await open(page, "/gas/moderation");
  const cards = page.locator("[data-queue-card]");
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  const period = page.getByRole("button", { name: "Настроить период проверки" });
  if (await period.isVisible()) await period.click();
  await page.getByRole("button", { name: "Неделя отчёта", exact: true }).click();
  await expect(page.getByLabel("Дата с", { exact: true })).toHaveValue("2026-09-28");
  await expect(page.getByLabel("Дата по", { exact: true })).toHaveValue("2026-10-03");
  await page.getByRole("button", { name: "Все даты", exact: true }).click();
  await page.getByLabel("Дата с", { exact: true }).fill("2026-11-17");
  await page.getByLabel("Дата по", { exact: true }).fill("2026-11-17");
  await expect(cards).toHaveCount(0);
  await expect(page.getByText("По фильтрам ничего нет", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Все даты", exact: true }).click();
  await expect(cards).toHaveCount(count);
  await expect(cards.first()).toContainText("Дата");
  await expect(cards.first()).toContainText("Время");
  // Подпись «Работа» с временем «2 ч 30 мин» вместо «Часы 2,50 ч» (обратная связь 20.11.2026)
  await expect(cards.first()).toContainText("Работа");
  if (await period.isVisible()) await period.click();
  await page.screenshot({
    path: `/tmp/gaika-compact-${page.url().split("/").pop()!.split("?")[0]}-${page.viewportSize()!.width}.png`,
  });
  await expectA11y(page, "Компактное рабочее пространство");
});

test("пометки ячеек сохраняются, очищаются и не меняют значения @mobile", async ({ page }) => {
  await open(page, "/gas/tabel?highlight=mk-4");
  const asTable = page.getByRole("button", { name: "Открыть как таблицу", exact: true });
  if (await asTable.isVisible()) await asTable.click();
  const grid = page.getByRole("grid", { name: "Табель в формате заказчика" });
  const selected = grid.locator('[role="gridcell"][aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  const coords = await selected.getAttribute("data-cell");
  const text = await selected.innerText();
  const target = grid.locator(`[data-cell="${coords}"]`);
  await page.getByRole("button", { name: "Зелёная пометка", exact: true }).click();
  await expect(target).toHaveAttribute("data-mark", "green");
  await expect(target).toHaveText(text);
  await expect(target).toHaveAttribute("data-status", "draft");
  await page.reload();
  await expect(target).toHaveAttribute("data-mark", "green");
  await expect(selected).toHaveCount(1);
  await page.getByRole("button", { name: "Очистить пометку", exact: true }).click();
  await expect(target).not.toHaveAttribute("data-mark");
  await expect(target).toHaveText(text);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.screenshot({
    path: `/tmp/gaika-compact-${page.url().split("/").pop()!.split("?")[0]}-${page.viewportSize()!.width}.png`,
  });
  await expectA11y(page, "Компактное рабочее пространство");
});

test("неделя: компактная сводка и дневные суммы @mobile", async ({ page }) => {
  await open(page, "/gas/week");
  const summary = page.getByTestId("week-hero");
  await expect(summary).toBeVisible();
  expect((await summary.boundingBox())!.height).toBeLessThan(
    page.viewportSize()!.width < 600 ? 640 : 420,
  );
  await expect(page.getByTestId("week-hero-sum")).toContainText("₽");
  const days = summary.getByRole("group", { name: "Начислено по дням" }).getByRole("button");
  await days.first().click();
  await expect(days.first()).toHaveAttribute("aria-pressed", "true");
  await expect(summary.getByRole("link", { name: "Табель и Excel →" })).toHaveAttribute(
    "href",
    "/gas/tabel",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.screenshot({
    path: `/tmp/gaika-compact-${page.url().split("/").pop()!.split("?")[0]}-${page.viewportSize()!.width}.png`,
  });
  await expectA11y(page, "Компактное рабочее пространство");
});

test("бригада: компактная панель, переход к своему составу и добавление @mobile", async ({
  page,
}) => {
  await open(page, "/gas/brigades");
  await page.getByRole("button", { name: /^Бригада 2 / }).click();
  const panel = page.getByRole("dialog", { name: "Бригада 2", exact: true });
  await expect(panel).toBeVisible();
  expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(420);
  await panel.getByRole("link", { name: "Изменить состав", exact: true }).click();
  await expect(page).toHaveURL(/\/gas\/directory\?brigade=brg-2/);
  await page.getByRole("button", { name: "Добавить в состав", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Добавить в состав", exact: true });
  await expect(form).toContainText("Бригада 2");
  await form.getByLabel("Имя или роль", { exact: true }).fill("Демо-монтажник для проверки");
  await form.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Люди в составе" })).toContainText(
    "Демо-монтажник для проверки",
  );
  await page.reload();
  await expect(page.getByRole("list", { name: "Люди в составе" })).toContainText(
    "Демо-монтажник для проверки",
  );
  await expectA11y(page, "Управление составом бригады");
});

test("руководитель: сметы доступны, управление составом закрыто @mobile", async ({ page }) => {
  await open(page, "/gas/brigades");
  await gasRole(page, "Руководитель");
  await open(page, "/gas/brigades");
  await expect(page.getByRole("button", { name: "Добавить бригаду", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Бригада 2 / }).click();
  const panel = page.getByRole("dialog", { name: "Бригада 2", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: "Изменить состав", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("link", { name: "Сметы", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Загрузить смету", exact: true })).toBeVisible();
});

test("администратор: создание бригады и действия управления @mobile", async ({ page }) => {
  await open(page, "/gas/brigades");
  await gasRole(page, "Администратор");
  await open(page, "/gas/brigades");
  await page
    .getByRole("button", { name: "Добавить бригаду", exact: true })
    .filter({ visible: true })
    .click();
  const form = page.getByRole("dialog", { name: "Новая бригада", exact: true });
  await form.getByLabel("Название", { exact: true }).fill("Демо-бригада администратора");
  await form.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /^Демо-бригада администратора / }).click();
  const panel = page.getByRole("dialog", { name: "Демо-бригада администратора", exact: true });
  await expect(panel.getByRole("button", { name: "Назначить бригаду", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Назначить бригаду", exact: true }).click();
  const assignment = page.getByRole("dialog", { name: "Назначение на объект", exact: true });
  await assignment
    .getByRole("combobox", { name: "Объект", exact: true })
    .selectOption({ index: 1 });
  await expect(assignment.getByRole("combobox", { name: "Бригада", exact: true })).not.toHaveValue(
    "",
  );
  await assignment.getByRole("button", { name: "Сохранить назначение", exact: true }).click();
  await expect(assignment).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: "Изменить состав", exact: true })).toBeVisible();
  await expectA11y(page, "Управление администратора");
});
