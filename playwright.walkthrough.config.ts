import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Обход продукта (Q8): все экраны всех ролей, каждый элемент, мобильная версия на трёх
 * ширинах. Идёт десятки минут, поэтому вне конвейера: `bun run walkthrough`.
 * Отчёт — JSON и снимки в WALK_OUT (по умолчанию test-results/walkthrough).
 */
export default defineConfig({
  ...base,
  testDir: "e2e/walkthrough",
  testIgnore: [],
  timeout: 3 * 60 * 60 * 1000,
  workers: 5,
  fullyParallel: true,
  projects: [{ name: "walkthrough", use: base.use ?? {} }],
});
