/**
 * Ворота шкалы ADR-045 «Финальный интерфейс»: ручные размеры мимо токенов в src/components
 * и src/routes.
 *
 * Считаются `text-[Npx]`, отступы `p-[Npx]` и `m-[Npx]` со всеми сторонами, `gap-[Npx]`,
 * высоты `h-[Npx]` (h, min-h, max-h) и радиусы `rounded-[Npx]`. Места, которые были до шкалы,
 * записаны в
 * scripts/typography-budget.json с числом по файлу. Число может только уменьшаться:
 * - в файле стало больше, чем в бюджете, или появился новый файл с ручным размером — падение;
 * - стало меньше — проходит и подсказывает записать новое число.
 *
 * `bun scripts/check-typography.ts --write` переписывает бюджет текущими числами, но отказывает,
 * если хоть один файл вырос: поднять бюджет можно только руками, с объяснением в коммите.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src/components", "src/routes"];
const BUDGET = "scripts/typography-budget.json";
const NUM = String.raw`-\[-?\d+(?:\.\d+)?px\]`;
const PATTERN = new RegExp(
  String.raw`(?<![\w-])-?(?:text|[pm][xytblrse]?|gap(?:-[xy])?|(?:min-|max-)?h|rounded(?:-(?:[tblrse]{1,2}))?)` +
    NUM,
  "g",
);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

function count(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const root of ROOTS) {
    for (const path of files(root)) {
      const found = readFileSync(path, "utf8").match(PATTERN)?.length ?? 0;
      if (found) result[relative(".", path)] = found;
    }
  }
  return result;
}

interface Budget {
  $comment: string;
  total: number;
  files: Record<string, number>;
}

const current = count();
const total = Object.values(current).reduce((a, n) => a + n, 0);
let budget: Budget | null = null;
try {
  budget = JSON.parse(readFileSync(BUDGET, "utf8")) as Budget;
} catch {
  budget = null;
}

const grown = Object.entries(current).filter(([path, n]) => n > (budget?.files[path] ?? 0));

if (process.argv.includes("--write")) {
  if (budget && grown.length) {
    console.error("Бюджет не переписан: ручных размеров стало больше в файлах:");
    for (const [path, n] of grown) console.error(`  ${path}: ${budget.files[path] ?? 0} → ${n}`);
    process.exit(1);
  }
  const next: Budget = {
    $comment:
      "ADR-045: ручные размеры text-[Npx], p-[Npx], m-[Npx], gap-[Npx], h-[Npx], rounded-[Npx] в src/components и src/routes. Число по файлу может только уменьшаться: scripts/check-typography.ts.",
    total,
    files: Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b))),
  };
  writeFileSync(BUDGET, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Бюджет записан: ${total} мест в ${Object.keys(current).length} файлах`);
  process.exit(0);
}

if (!budget) {
  console.error(`Нет ${BUDGET}: запустите с --write один раз`);
  process.exit(1);
}

console.log(
  `Ручных размеров: ${total} (бюджет ${budget.total}, меньше на ${budget.total - total})`,
);
if (grown.length) {
  console.error(
    "Новые ручные размеры мимо шкалы ADR-045. Используйте токены: text-title, text-body, p-card, gap-block, h-control, rounded-card:",
  );
  for (const [path, n] of grown)
    console.error(`  ${path}: бюджет ${budget.files[path] ?? 0}, сейчас ${n}`);
  process.exit(1);
}
if (total < budget.total) {
  console.log(
    "Стало меньше бюджета: запишите новое число — bun scripts/check-typography.ts --write",
  );
}
