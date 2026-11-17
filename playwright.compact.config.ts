import { defineConfig } from "@playwright/test";
import type { Options } from "./e2e/fixtures";
import base from "./playwright.config";

/** ADR-076: повторяемая матрица компактных экранов, одна рабочая вкладка за раз. */
export default defineConfig<Options>({
  ...base,
  testMatch: "gas-compact-workspace.spec.ts",
  outputDir: ".local/compact-results",
  projects: [
    {
      name: "phone-dark",
      use: { ...base.use, viewport: { width: 375, height: 812 }, theme: "dark", hasTouch: true },
    },
    {
      name: "desktop-dark",
      use: { ...base.use, viewport: { width: 1440, height: 900 }, theme: "dark" },
    },
    {
      name: "phone-320",
      use: { ...base.use, viewport: { width: 320, height: 812 }, theme: "light", hasTouch: true },
    },
  ],
});
