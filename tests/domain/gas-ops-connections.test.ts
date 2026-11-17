import { describe, expect, test } from "bun:test";
import { connectionRows, connectionsOf } from "@/domain/gas-ops/connections";

/** Подключения в «Настройках» (ADR-072): признаки без значений ключей */
const none = { available: false, model: null };

describe("подключения сервера", () => {
  test("пустое окружение: ничего не подключено, каждая строка говорит, что задать", () => {
    const rows = connectionRows(connectionsOf({}, none, "disk:/ГАЙКА/Сметы"));
    expect(rows.every((r) => !r.on)).toBe(true);
    expect(rows.find((r) => r.key === "telegram")!.detail).toContain("TELEGRAM_BOT_TOKEN");
    expect(rows.find((r) => r.key === "yandexDisk")!.detail).toContain("YANDEX_DISK_TOKEN");
  });

  test("бот без базы — «ждёт базу», с базой — настроен, доставка не проверена", () => {
    const env = { TELEGRAM_BOT_TOKEN: "1:a", TELEGRAM_WEBHOOK_SECRET: "s" };
    const without = connectionRows(connectionsOf(env, none, "disk:/С"));
    expect(without.find((r) => r.key === "telegram")!.state).toBe("ждёт базу");
    const withDb = connectionRows(
      connectionsOf({ ...env, DATABASE_URL: "postgres://x" }, none, "disk:/С"),
    );
    expect(withDb.find((r) => r.key === "telegram")).toMatchObject({
      state: "настроен",
      on: true,
    });
    expect(withDb.find((r) => r.key === "telegram")!.detail).toContain("проверить отдельно");
  });

  test("ответ сервера не содержит значений ключей", () => {
    const env = {
      DATABASE_URL: "postgres://user:pass@db/x",
      YANDEX_DISK_TOKEN: "y0_SECRET",
      MAX_BOT_TOKEN: "MAXSECRET",
      MAX_WEBHOOK_SECRET: "HOOKSECRET",
    };
    const text = JSON.stringify(
      connectionsOf(env, { available: true, model: "claude" }, "disk:/ГАЙКА/Сметы"),
    );
    for (const secret of ["pass", "y0_SECRET", "MAXSECRET", "HOOKSECRET"]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain("/ГАЙКА/Сметы");
  });

  test("секрет вебхука без токена — не подключён", () => {
    const c = connectionsOf({ MAX_WEBHOOK_SECRET: "s", DATABASE_URL: "x" }, none, "disk:/С");
    expect(c.max).toBe(false);
  });
});
