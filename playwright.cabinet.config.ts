import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Кабинет заказчика (ADR-062, F6): своя сборка с `VITE_CABINET_ONLY=1`, поэтому вне общего
 * прогона. `bun run test:cabinet` собирает в `.output-cabinet` и поднимает сервер на 4632.
 */
const port = 4632;

export default defineConfig({
  ...base,
  testDir: "e2e/cabinet",
  testIgnore: [],
  use: { ...base.use, baseURL: `http://localhost:${port}` },
  projects: [{ name: "cabinet", use: { viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `PORT=${port} node .output-cabinet/server/index.mjs`,
    url: `http://localhost:${port}/gas`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
