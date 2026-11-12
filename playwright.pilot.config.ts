import { defineConfig, devices } from "@playwright/test";

/**
 * Живой прогон рабочего контура (ADR-069): сервер уже запущен на PILOT_URL со сборкой
 * `server` и базой после команд пилота. Порядок — docs/runbook/pilot.md.
 */
export default defineConfig({
  testDir: "./e2e/pilot",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env["PILOT_URL"] ?? "http://localhost:4700",
    locale: "ru-RU",
    timezoneId: process.env["APP_TIME_ZONE"] ?? "Europe/Moscow",
  },
});
