import { expect, open, test } from "./fixtures";

/**
 * Честный статус MAX в «Подключениях» (ADR-085). Сборка e2e без `MAX_BOT_TOKEN`: строка
 * «Бот MAX» говорит «не подключён» и как работает бригадир без бота, кнопок проверки нет.
 * Проверка канала на сервере без базы и входа в MAX не ходит и честно отказывает.
 */
test.describe("MAX в «Подключениях» без токена", () => {
  test("не подключён, бригадир работает веб-формой, кнопок проверки нет @mobile", async ({
    page,
  }) => {
    await open(page, "/gas/admin");
    const list = page.getByTestId("admin-connections");
    const row = list.locator("li", { hasText: "Бот MAX" });
    await expect(row).toContainText("не подключён");
    await expect(row).toContainText("мобильной веб-форме по своей ссылке входа");
    await expect(page.getByTestId("max-check")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Проверить вебхук" })).toHaveCount(0);
  });

  test("проверка канала без базы отвечает отказом, а не тишиной", async ({ request }) => {
    const response = await request.post("/api/gas/max-check", { data: { action: "check" } });
    expect([401, 501]).toContain(response.status());
    const body = (await response.json()) as { reason?: string };
    expect(body.reason ?? "").not.toBe("");
    expect(JSON.stringify(body)).not.toContain("platform-api");
  });
});
