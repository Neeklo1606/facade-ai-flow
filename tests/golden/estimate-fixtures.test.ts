import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sheetsOfXls, sheetsOfXlsx } from "@/adapters/gas-ops/estimate-file";
import { parseEstimateWorkbook } from "@/domain/gas-ops/estimate-parse";
import { convergence, sectionView } from "@/domain/gas-ops/estimate-intake";

/**
 * Golden на обезличенных копиях всех смет заказчика (ADR-077): структура файлов та же, адреса
 * и номера выдуманы, суммы умножены на один коэффициент (`scripts/make-estimate-fixtures.ts`).
 * Шапка, разделы, материалы, опрессовка и итоги — против ожиданий, проверенных человеком.
 */
const DIR = join(import.meta.dir, "..", "fixtures", "estimates");
const files = readdirSync(DIR)
  .filter((f) => /\.xlsx?$/.test(f))
  .sort();

async function parse(file: string) {
  const bytes = readFileSync(join(DIR, file));
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return parseEstimateWorkbook(
    /\.xls$/.test(file) ? await sheetsOfXls(buffer) : await sheetsOfXlsx(buffer),
  );
}

describe("golden: обезличенные копии смет", () => {
  test("копий пять: две ГРАНД-Сметы и три ресурсные", () => {
    expect(files.length).toBe(5);
  });

  for (const file of files) {
    test(`${file}: шапка, итоги, разделы, опрессовка`, async () => {
      const parsed = await parse(file);
      const want = JSON.parse(
        readFileSync(join(DIR, file.replace(/\.xlsx?$/, ".expected.json")), "utf8"),
      );
      expect(parsed.status).toBe(want.status);
      expect(parsed.format).toBe(want.format);
      expect(parsed.sheet).toBe(want.sheet);
      for (const [key, kopecks] of Object.entries(want.totals)) {
        expect(parsed.totals[key as keyof typeof parsed.totals]?.kopecks).toBe(kopecks as number);
      }
      const h = parsed.header!;
      expect(h.object.value).toBe(want.header.object);
      expect(h.number.value).toBe(want.header.number);
      expect(h.date.value).toBe(want.header.date);
      expect(h.address.value).toEqual(want.header.address);
      expect(h.object.row).toBe(want.header.rows.object);
      const got = parsed.sections.map((s) => {
        const v = sectionView(s);
        return {
          number: v.number,
          total: v.totalKopecks,
          materials: v.materialsKopecks,
          work: v.workKopecks,
          laborHours: v.laborHours,
          pressure: v.pressure
            ? { kind: v.pressure.kind, work: v.pressure.workKopecks, rows: v.pressure.rows }
            : null,
        };
      });
      expect(got).toEqual(want.sections);
      // Инварианты: разделы сходятся с итогом, работы = итог минус материалы, у раздела есть т/з
      expect(convergence(parsed).ok).toBe(true);
      for (const s of got) {
        if (s.materials !== null) expect(s.work).toBe(s.total - s.materials);
        if (s.pressure) expect(s.pressure.work).toBeLessThanOrEqual(s.work!);
      }
    });
  }

  test("копия КП с опрессовкой строкой: раздел 3 и строка испытания отдельно", async () => {
    const parsed = await parse("resource-b.xls");
    const v = sectionView(parsed.sections[0]!);
    expect(v.number).toBe("3");
    expect(v.pressure?.kind).toBe("lines");
    expect(v.pressure?.lines[0]?.code).toContain("19-01-015");
    expect(v.pressure?.needsConfirm).toBe(true);
    expect(v.smrKopecks).toBe(v.workKopecks! - v.pressure!.workKopecks);
  });

  test("перевозка в итогах раздела ГРАНД видна отдельно и не прячется в работах молча", async () => {
    // Копия ГРАНД со строкой «Перевозка» в итогах раздела 1: правило «итог минус материалы»
    // оставляет её в работах; разбор показывает сумму и строку, решение за руководителем
    const parsed = await parse("grand-b.xlsx");
    const v = sectionView(parsed.sections[0]!);
    expect(v.number).toBe("1");
    expect(v.transportKopecks).toBe(101031);
    expect(v.transportRow).toBe(72);
    expect(v.workNote).toContain("стр. 72");
    expect(v.workKopecks).toBe(v.totalKopecks - v.materialsKopecks!);
    // В остальных разделах обеих ГРАНД перевозки нет
    for (const file of ["grand-a.xlsx", "grand-b.xlsx"]) {
      const p = await parse(file);
      const rest = p.sections.map((s) => sectionView(s)).filter((s) => s.transportKopecks !== null);
      expect(rest.map((s) => s.number)).toEqual(file === "grand-b.xlsx" ? ["1"] : []);
    }
  });

  test("пустой первый лист «12 граф» пропускается сам", async () => {
    const parsed = await parse("resource-a.xls");
    expect(parsed.sheet).toBe("Ресурсная смета 14 граф");
  });
});
