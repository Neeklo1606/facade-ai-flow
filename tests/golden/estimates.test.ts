import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sheetsOfXls, sheetsOfXlsx } from "@/adapters/gas-ops/estimate-file";
import { parseEstimateWorkbook, type TotalKey } from "@/domain/gas-ops/estimate-parse";
import { DEFAULT_RULE_TERMS, applyRule } from "@/domain/gas-ops/work-cost";

/**
 * Golden-тесты на настоящих сметах заказчика (ADR-062, решение владельца 5). Файлы живут вне
 * репозитория: каталог `GAS_GOLDEN_DIR`, по умолчанию `.local/golden` (в .gitignore). Рядом
 * с каждой сметой `<имя>.expected.json`: итоги в копейках, трудозатраты, статус разбора,
 * кандидат «без НДС минус материалы». Каталога нет (CI, свежий клон) — набор пропускается
 * и пишет об этом в вывод теста. Имена файлов в имена тестов не попадают: в них адреса.
 */
interface Expected {
  status: string;
  totals: Partial<Record<TotalKey, number>>;
  laborHours?: number | null;
  candidateKopecks?: number | null;
}

const dir = process.env["GAS_GOLDEN_DIR"] ?? join(import.meta.dir, "..", "..", ".local", "golden");
const files = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => /\.xlsx?$/i.test(f) && existsSync(join(dir, expectedName(f))))
      .sort()
  : [];

function expectedName(file: string): string {
  return file.replace(/\.xlsx?$/i, ".expected.json");
}

if (files.length === 0) {
  console.log(`Golden-тесты смет пропущены: нет смет с ожиданиями в ${dir} (GAS_GOLDEN_DIR).`);
}

describe("golden: настоящие сметы заказчика", () => {
  test.skipIf(files.length > 0)("пропущено: каталога GAS_GOLDEN_DIR нет", () => {});

  files.forEach((file, i) => {
    test(`смета ${i + 1}: итоги, трудозатраты, статус, кандидат правила`, async () => {
      const bytes = readFileSync(join(dir, file));
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const sheets = /\.xls$/i.test(file) ? await sheetsOfXls(buffer) : await sheetsOfXlsx(buffer);
      const parsed = parseEstimateWorkbook(sheets);
      const want = JSON.parse(readFileSync(join(dir, expectedName(file)), "utf8")) as Expected;
      expect(parsed.status).toBe(want.status as typeof parsed.status);
      for (const [key, kopecks] of Object.entries(want.totals)) {
        expect(parsed.totals[key as TotalKey]?.kopecks).toBe(kopecks);
      }
      if (want.laborHours !== undefined) {
        expect(parsed.laborHours?.value ?? null).toBe(want.laborHours);
      }
      if (want.candidateKopecks !== undefined) {
        const cost = applyRule(parsed.totals, DEFAULT_RULE_TERMS);
        expect(cost.ok ? cost.kopecks : null).toBe(want.candidateKopecks);
      }
    });
  });
});
