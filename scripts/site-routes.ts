/**
 * Пересобрать src/routeTree.gen.ts после новых файлов маршрутов (ADR-067). Генератор
 * TanStack без плагина Start теряет блок Register в конце файла: он дописывается обратно.
 */
import { Generator, getConfig } from "@tanstack/router-generator";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/routeTree.gen.ts";
const before = readFileSync(FILE, "utf8");
const marker = "import type { getRouter } from './router.tsx'";
const tail = before.slice(before.indexOf(marker));
const config = getConfig({ routesDirectory: "./src/routes", generatedRouteTree: `./${FILE}` });
await new Generator({ config, root: process.cwd() }).run();
let after = readFileSync(FILE, "utf8");
if (!after.includes(marker)) after = `${after.trimEnd()}\n\n${tail}`;
writeFileSync(FILE, after);
console.log("routeTree.gen.ts обновлён");
