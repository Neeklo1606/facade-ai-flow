import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Имя продукта (ADR-020). Решение владельца: продукт — neeklo FieldOps, «Фасады» — отраслевой
 * пакет. Ранние имена убраны отовсюду, где их видит человек. Проверка нужна потому, что имя
 * возвращается тихо: его печатают в новом документе, и никто не замечает, пока не увидит
 * покупатель.
 */

const ROOT = new URL("../..", import.meta.url).pathname;

/** Ранние рабочие имена продукта: ни одного из них человек видеть не должен */
const OLD_NAMES = [/ФАСАД-РП/iu, /FACADE-RP/iu, /Фасад\s+Эксперт/iu];

/** Каталоги, которых имя продукта не касается: сборка, зависимости, история git */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".output",
  ".nitro",
  ".vinxi",
  "dist",
  "coverage",
  ".verify",
  ".bundles",
]);

/**
 * Исключения — только записи о самом правиле: аудит S1 с находкой «три имени за две минуты»
 * (стереть из него старые имена значит стереть находку; рядом стоит пометка «решено»),
 * решение ADR-020 и эта проверка, которой старые имена нужны как образцы.
 */
const KEEP_AS_RECORD = new Set([
  "docs/audit/S1-sales-readiness.md",
  "docs/adr/ADR-020-name-and-alternatives.md",
  "tests/negative/product-name.test.ts",
]);

const TEXT = /\.(ts|tsx|css|md|json|html|webmanifest|sql|yml|yaml|txt|svg)$/u;

function textFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...textFiles(full));
    else if (TEXT.test(entry)) found.push(full);
  }
  return found;
}

describe("имя продукта", () => {
  const files = textFiles(ROOT).map((full) => relative(ROOT, full));

  test("обход находит и исходники, и документы: иначе проверка молчала бы", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("README.md");
    expect(files).toContain("docs/SALES_DEMO.md");
    expect(files).toContain("src/lib/access.ts");
  });

  test("ранних имён нет ни в файлах, ни в их названиях", () => {
    const hits: string[] = [];
    for (const path of files) {
      if (KEEP_AS_RECORD.has(path)) continue;
      const text = readFileSync(join(ROOT, path), "utf8");
      for (const name of OLD_NAMES) {
        if (name.test(path)) hits.push(`${path}: старое имя в названии файла`);
        const line = text.split("\n").findIndex((row) => name.test(row));
        if (line >= 0) hits.push(`${path}:${line + 1}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test("продукт представляется полным именем там, где здоровается с человеком", () => {
    const lockup = /neeklo FieldOps, пакет Фасады/u;
    for (const path of [
      "README.md",
      "docs/USER_GUIDE.md",
      "docs/IMPLEMENTATION.md",
      "docs/SALES_DEMO.md",
      "src/lib/access.ts",
      "public/manifest.webmanifest",
    ]) {
      expect(lockup.test(readFileSync(join(ROOT, path), "utf8")), path).toBe(true);
    }
  });
});
