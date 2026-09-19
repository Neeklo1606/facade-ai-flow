import { defineConfig, devices } from "@playwright/test";

/**
 * Сквозные тесты (ADR-013, п. 3): демо-сборка на node-сервере, данные живут во вкладке.
 * Сборку делает шаг конвейера до тестов: `NITRO_PRESET=node-server bun run build`.
 * Локально браузер можно взять уже установленный — путь в `PW_CHROMIUM`.
 */
const port = Number(process.env["E2E_PORT"] ?? 4630);
const executablePath = process.env["PW_CHROMIUM"];

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env["CI"] ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: `PORT=${port} node .output/server/index.mjs`,
    url: `http://localhost:${port}/projects`,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
