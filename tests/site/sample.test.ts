import { expect, test } from "bun:test";
import { buildPublicSeed } from "@/data/mock/public/seed";
import { askGaika } from "@/domain/gas-ops/ask";
import { ASK_SAMPLE } from "@/lib/site/sample";

/** Окно продукта на лендинге показывает тот же ответ, что даёт правило domain (ADR-052) */
test("ответ в окне продукта совпадает с «Спросить ГАЙКУ» на публичном наборе", () => {
  const answer = askGaika(ASK_SAMPLE.question, { ...buildPublicSeed(), actorId: "u-manager" });
  expect(answer.title).toBe(ASK_SAMPLE.title);
  expect(answer.lead.startsWith(ASK_SAMPLE.lead)).toBe(true);
  expect(answer.metrics.map((m) => m.value)).toEqual([
    ASK_SAMPLE.raw.amount,
    ASK_SAMPLE.raw.hours,
    ASK_SAMPLE.raw.rate,
  ]);
  expect(answer.rows.slice(0, 2).map((r) => r.metric?.value)).toEqual(ASK_SAMPLE.raw.rows);
  expect(answer.rows.slice(0, 2).map((r) => r.label)).toEqual(ASK_SAMPLE.rows.map((r) => r.label));
  expect(answer.sources.slice(0, 3).map((s) => s.label)).toEqual(ASK_SAMPLE.sources);
});
