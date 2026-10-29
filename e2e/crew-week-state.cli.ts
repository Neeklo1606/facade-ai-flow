/**
 * Состояние вкладки для e2e/crew-week.spec.ts (ADR-056): набор личного контура, где демо-записи
 * прежних сценариев уже решены. Запускается через bun: модуль набора тянет JSON, который
 * Node в Playwright не читает. Ключ и версия повторяют `src/adapters/gas-ops/state.ts`.
 */
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { DEFAULT_COMPANY_RULE } from "@/domain/gas-ops/work-cost";
import { DEFAULT_REVIEW_SETTINGS } from "@/domain/gas-ops/review-policy";

const seed = buildSeed();
const entries = seed.entries.map((e) =>
  e.source === "mock" && e.status !== "confirmed"
    ? { ...e, status: "rejected" as const, comment: "Решено до теста" }
    : e,
);
const snapshot = {
  ...seed,
  entries,
  actorId: "u-foreman-1",
  estimateVersions: [],
  costRules: [DEFAULT_COMPANY_RULE],
  schedule: null,
  brigadeAvailability: [],
  reviewSettings: DEFAULT_REVIEW_SETTINGS,
  finalChecks: [],
  reportIssues: [],
  rates: [],
  periods: [],
};
process.stdout.write(JSON.stringify({ version: 5, snapshot }));
