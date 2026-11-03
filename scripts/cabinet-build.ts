/**
 * Сборка кабинета заказчика для проверки (ADR-062, F6): `VITE_CABINET_ONLY=1`, название
 * заказчика — тестовое, настоящее задаёт хостинг. Результат в `.output-cabinet`, обычная
 * сборка в `.output` не трогается.
 */
import { renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const OUT = ".output-cabinet";
const backup = ".output-main";
rmSync(OUT, { recursive: true, force: true });
rmSync(backup, { recursive: true, force: true });
let moved = false;
try {
  renameSync(".output", backup);
  moved = true;
} catch {
  // Обычной сборки нет: беречь нечего
}
try {
  const result = spawnSync("bun", ["run", "build"], {
    stdio: "inherit",
    env: {
      ...process.env,
      NITRO_PRESET: "node-server",
      VITE_CABINET_ONLY: "1",
      VITE_CABINET_CLIENT: process.env["CABINET_CLIENT"] ?? "ООО «Пример заказчика»",
    },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  renameSync(".output", OUT);
} finally {
  if (moved) renameSync(backup, ".output");
}
