/**
 * Ссылки внутри документов (находка аудита соответствия: README вёл на ADR-016, которого
 * в main не было). Проверяются только ссылки на файлы репозитория: внешние адреса —
 * забота `check:sources`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const SKIP = new Set([
  "node_modules",
  ".git",
  ".output",
  "dist",
  ".verify",
  ".bundles",
  "coverage",
]);

function markdown(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP.has(entry)) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return markdown(full);
    return entry.endsWith(".md") ? [full] : [];
  });
}

const broken: string[] = [];
let checked = 0;
for (const file of markdown(ROOT)) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    const target = match[2]!.split("#")[0];
    if (!target || /^(https?:|mailto:|tel:)/.test(target)) continue;
    checked += 1;
    if (!existsSync(join(dirname(file), target))) {
      broken.push(`${file.slice(ROOT.length + 1)}: [${match[1]}](${match[2]})`);
    }
  }
}

console.log(`Ссылок в документах: ${checked}`);
if (broken.length) {
  console.error(`Ведут в никуда: ${broken.length}`);
  for (const item of broken) console.error(`  • ${item}`);
  process.exit(1);
}
console.log("Все ссылки на месте");
