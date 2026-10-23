import { describe, expect, test } from "bun:test";
import { connectionStatuses, createInboundStub } from "@/adapters/channels";
import { connectionStatus } from "@/contracts";

/**
 * Подключения кабинета (ADR-039): статус по окружению и ни одного значения ключа в ответе.
 */
const env = (values: Record<string, string>) => (name: string) => values[name];

describe("статусы подключений", () => {
  test("без окружения — демо-режим модели и речи, Telegram и вход по телефону не подключены", () => {
    const rows = connectionStatuses(env({}), { phoneLogin: false });
    expect(rows.map((row) => [row.key, row.state])).toEqual([
      ["model", "demo"],
      ["speech", "demo"],
      ["telegram", "off"],
      ["phone-login", "off"],
      ["leads", "off"],
      ["client-link", "off"],
    ]);
    for (const row of rows) expect(() => connectionStatus.parse(row)).not.toThrow();
  });

  test("ключ модели и речи никогда не попадает в ответ", () => {
    const secret = "sk-SECRET-VALUE-123";
    const rows = connectionStatuses(
      env({
        AI_MODE: "live",
        LLM_PROVIDER: "deepseek",
        LLM_MODEL: "deepseek-chat",
        LLM_API_KEY: secret,
        STT_PROVIDER: "openai",
        STT_MODEL: "whisper-1",
        STT_API_KEY: secret,
        TELEGRAM_BOT_TOKEN: secret,
        LEADS_TELEGRAM_BOT_TOKEN: secret,
        LEADS_TELEGRAM_CHAT_ID: "12345",
        CLIENT_LINK_KEY: secret,
      }),
      { phoneLogin: true },
    );
    expect(JSON.stringify(rows)).not.toContain(secret);
    expect(rows.find((row) => row.key === "model")?.state).toBe("on");
    expect(rows.find((row) => row.key === "speech")?.state).toBe("on");
    // Токен есть, а адаптера канала нет: «подключено» было бы враньём (правило 4)
    expect(rows.find((row) => row.key === "telegram")?.state).toBe("off");
    expect(rows.find((row) => row.key === "leads")?.detail).toContain("Telegram владельца");
    expect(rows.find((row) => row.key === "client-link")?.state).toBe("on");
    expect(JSON.stringify(rows)).not.toContain("12345");
  });

  test("приём заявок: вебхук без Telegram, адрес не показывается", () => {
    const rows = connectionStatuses(
      env({ LEADS_WEBHOOK_URL: "https://hook.example/secret-path" }),
      {
        phoneLogin: false,
      },
    );
    const leads = rows.find((row) => row.key === "leads")!;
    expect(leads.state).toBe("on");
    expect(leads.detail).toContain("вебхук");
    expect(JSON.stringify(rows)).not.toContain("secret-path");
  });

  test("live без ключа — не подключено, а не демо", () => {
    const rows = connectionStatuses(env({ AI_MODE: "live" }), { phoneLogin: false });
    expect(rows.find((row) => row.key === "model")?.state).toBe("off");
    expect(rows.find((row) => row.key === "speech")?.state).toBe("off");
  });
});

describe("входящий канал", () => {
  test("заглушка не подключена и ничего не превращает в сообщение", async () => {
    const channel = createInboundStub("telegram");
    expect(channel.describe.connected).toBe(false);
    expect(await channel.parse({ message: { text: "привет" } })).toBeNull();
  });
});
