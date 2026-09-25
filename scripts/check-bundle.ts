/**
 * Размер клиентского бандла (ADR-013, п. 6 и поправка от 26.09.2026): gzip всех JS-файлов клиента
 * и самого большого из них против порогов `scripts/bundle-budget.json`. Превышение — код
 * возврата 1. Порог поднимают осознанно: правкой файла порогов с объяснением в коммите.
 *
 * Контур называется аргументом: `bun run check:bundle server|demo`. У рабочей сборки и у
 * демонстрационной разный вес по замыслу — демонстрация несёт демо-адаптер с фикстурами, —
 * и мерить их одним порогом значит охранять вес показа вместо веса продукта.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", ".output", "public", "assets");
const budgets = JSON.parse(readFileSync(join(here, "bundle-budget.json"), "utf8")) as Record<
  string,
  { totalGzipKb: number; largestGzipKb: number }
>;
const contour = process.argv[2] ?? "demo";
const budget = budgets[contour];
if (!budget) {
  console.error(
    `Неизвестный контур «${contour}». Так: bun run check:bundle server | bun run check:bundle demo`,
  );
  process.exit(1);
}

let files: string[];
try {
  files = readdirSync(dir).filter((name) => name.endsWith(".js"));
} catch {
  console.error(`Нет сборки: ${dir}. Сначала bun run build.`);
  process.exit(1);
}
const sizes = files
  .map((name) => ({ name, kb: gzipSync(readFileSync(join(dir, name))).length / 1024 }))
  .sort((a, b) => b.kb - a.kb);
const total = sizes.reduce((acc, file) => acc + file.kb, 0);
const largest = sizes[0] ?? { name: "—", kb: 0 };

const kb = (value: number) => `${value.toFixed(1)} КБ`;
const label = contour === "server" ? "рабочий контур" : "демонстрация";
console.log(`Контур: ${label} (порог ${kb(budget.totalGzipKb)})`);
console.log(`Файлов JS: ${sizes.length}`);
console.log(`Всего gzip: ${kb(total)} (порог ${kb(budget.totalGzipKb)})`);
console.log(
  `Самый большой: ${largest.name} — ${kb(largest.kb)} (порог ${kb(budget.largestGzipKb)})`,
);
for (const file of sizes.slice(0, 5)) console.log(`  ${kb(file.kb).padStart(9)}  ${file.name}`);

const over = [
  total > budget.totalGzipKb && `всего ${kb(total)} > ${kb(budget.totalGzipKb)}`,
  largest.kb > budget.largestGzipKb &&
    `самый большой ${kb(largest.kb)} > ${kb(budget.largestGzipKb)}`,
].filter(Boolean);
if (over.length) {
  console.error(`Бандл больше порога: ${over.join("; ")}`);
  process.exit(1);
}
console.log("Бандл в пределах порога");
