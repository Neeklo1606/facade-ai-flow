import { describe, expect, test } from "bun:test";
import { buildSeed } from "@/data/mock/gas-ops-seed";
import { assistantContext } from "@/domain/gas-ops/assistant-context";
import type { EstimateVersion } from "@/domain/gas-ops/work-cost";

/** Помощник видит разбор смет (ADR-072): что вытянуто и из какой строки, деньги — по роли */
const seed = buildSeed();
const version: EstimateVersion = {
  id: "v-1",
  objectId: seed.objects[0]!.id,
  version: 2,
  fileName: "Смета котельная.xlsx",
  sheet: "Смета",
  uploadedAt: "2026-11-10T09:00:00",
  uploadedBy: "u-manager",
  format: "grand",
  parseStatus: "parsed",
  totals: {
    materials: { kopecks: 2_000_001, row: 493 },
    withoutVat: { kopecks: 12_000_024, row: 519 },
  },
  vatRate: 22,
  laborHours: { value: 50.25, row: 526 },
  sections: [{ title: "Монтаж", kopecks: 9_000_008, row: 450 }],
  issues: [],
  issuesReviewedBy: null,
  confirmedBy: null,
  confirmedAt: null,
};

describe("контекст помощника: сметы", () => {
  test("менеджер: файл, версия, итоги со строками файла", () => {
    const text = assistantContext({
      role: "manager",
      data: { ...seed, actorId: "u-manager" },
      reasons: [],
      versions: [version],
    });
    expect(text).toContain("## Разбор смет");
    expect(text).toContain("«Смета котельная.xlsx»");
    expect(text).toContain("(строка 519)");
    expect(text).toContain("ждёт подтверждения");
  });

  test("бригадир: разбора смет с суммами нет", () => {
    const text = assistantContext({
      role: "foreman",
      data: { ...seed, actorId: "u-manager" },
      reasons: [],
      versions: [version],
    });
    expect(text).not.toContain("## Разбор смет");
    expect(text).not.toContain("120 000");
  });
});
