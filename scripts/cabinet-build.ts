/**
 * Сборка кабинета заказчика (ADR-062, F6): `VITE_CABINET_ONLY=1`, название заказчика —
 * тестовое, настоящее задаёт хостинг. Результат в `.output-cabinet`, обычная сборка в `.output`
 * не трогается.
 *
 * Решение владельца 3: кабинет работает только с сервером (`VITE_DATA_SOURCE=server`).
 * Без него сборка отказывает. `--check` — сборка на данных вкладки только для своей проверки
 * (`bun run test:cabinet`): на ней висит плашка «Тестовый режим», заказчику её не дают.
 */
import { renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const check = process.argv.includes("--check");
const server = process.env["VITE_DATA_SOURCE"] === "server";
if (!server && !check) {
  console.error(
    "Кабинет заказчика собирается только с сервером: VITE_DATA_SOURCE=server (решение владельца 3, ADR-062).\n" +
      "Для теста заказчика до сервера — личная ссылка /gas?c=… на данных вкладки.",
  );
  process.exit(1);
}

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
  const result = spawnSync("bun", ["run", server ? "build:server" : "build"], {
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
