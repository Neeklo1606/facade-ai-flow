import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Настоящих сумм заказчика в репозитории нет (ADR-062, решение владельца 5). Список чисел
 * лежит вне git: `GAS_REAL_SUMS`, по умолчанию `.local/real-sums.txt`, одно число на строку
 * в записи «120 000,24» или «40,125». Каждое ищется во всех файлах git в записях с пробелом,
 * неразрывным пробелом, «_» и без разделителя, с запятой и с точкой. Списка нет (CI, свежий
 * клон) — проверка пропускается и пишет об этом. Само найденное число в вывод не печатается.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const LIST = process.env["GAS_REAL_SUMS"] ?? join(ROOT, ".local", "real-sums.txt");

function patterns(entry: string): RegExp {
  const [whole = "", frac = ""] = entry.replace(/[\s\u00a0\u202f_]/g, "").split(/[.,]/);
  const groups = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u0000").split("\u0000");
  const int = groups.join("[\\s\\u00a0\\u202f_]?");
  const tail = frac ? `[.,]${frac}` : "";
  return new RegExp(`(?<![\\d.,])${int}${tail}(?!\\d)`, "u");
}

const sums = existsSync(LIST)
  ? readFileSync(LIST, "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

if (sums.length === 0) console.log(`Проверка настоящих сумм пропущена: нет списка ${LIST}.`);

describe("настоящие суммы заказчика", () => {
  test.skipIf(sums.length > 0)("пропущено: списка GAS_REAL_SUMS нет", () => {});

  test.skipIf(sums.length === 0)(
    "ни одного числа из списка в файлах git",
    async () => {
      const listed = await Bun.$`git ls-files -z`.cwd(ROOT).text();
      const files = listed
        .split("\0")
        .filter((f) => f && !/\.(png|jpe?g|webp|ico|woff2?|xlsx?|pdf)$/i.test(f));
      const rules = sums.map(patterns);
      const hits: string[] = [];
      for (const file of files) {
        const path = join(ROOT, file);
        if (!existsSync(path)) continue;
        const text = readFileSync(path, "utf8");
        rules.forEach((rule, i) => {
          if (rule.test(text)) hits.push(`${file}: число № ${i + 1} списка`);
        });
      }
      expect(hits).toEqual([]);
    },
    60_000,
  );
});
