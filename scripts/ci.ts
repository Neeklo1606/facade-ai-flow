/**
 * Конвейер локально (ADR-013, п. 8) — те же шаги и в том же порядке, что в
 * `.github/workflows/ci.yml`. Печатает код возврата каждого шага и останавливается на первом
 * падении с ненулевым кодом. Сквозные тесты и Lighthouse работают на демо-сборке node-сервера.
 *
 * Паритет с PostgreSQL (ADR-005, п. 7) требует сервер PostgreSQL 16: строка подключения —
 * `CHECK_DATABASE_URL` (или `DATABASE_URL`). Она передаётся только этому шагу: остальные шаги,
 * включая сервер демо-сборки, работают без базы.
 */
import { spawn, type Subprocess } from "bun";

interface Step {
  name: string;
  cmd: string[];
  env?: Record<string, string>;
  /** Нужен запущенный сервер демо-сборки */
  server?: boolean;
}

const port = process.env["E2E_PORT"] ?? "4630";
const databaseUrl = process.env["CHECK_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";
/**
 * Окружение шагов. Bun сам подгружает `.env.development` в свой процесс, и без фильтра сборка
 * получала бы `VITE_SCREEN_STATES=1` и другие настройки разработки: в бандл попадал переключатель
 * состояний экрана. Настройки сборки берутся только из `.env.production` — через режим Vite,
 * поэтому `VITE_*` шагам не передаются. Строка подключения к базе — только шагу паритета
 */
const { DATABASE_URL: _database, CHECK_DATABASE_URL: _check, ...inherited } = process.env;
const baseEnv = Object.fromEntries(
  Object.entries(inherited).filter(([key]) => !key.startsWith("VITE_")),
);
const steps: Step[] = [
  { name: "Типы", cmd: ["bun", "run", "typecheck"] },
  { name: "Линтер", cmd: ["bun", "run", "lint"] },
  { name: "Тесты: домен, согласованность, негативные", cmd: ["bun", "run", "test"] },
  { name: "Фикстуры против схемы", cmd: ["bun", "run", "check:fixtures"] },
  {
    name: "PostgreSQL: миграции, паритет с демо, версия данных",
    cmd: ["bun", "run", "check:db"],
    env: { DATABASE_URL: databaseUrl },
  },
  { name: "Сборка", cmd: ["bun", "run", "build"], env: { NITRO_PRESET: "node-server" } },
  { name: "Размер бандла", cmd: ["bun", "run", "check:bundle"] },
  { name: "Сквозные тесты: роли, EMBER, axe, консоль", cmd: ["bun", "run", "test:e2e"] },
  { name: "Lighthouse", cmd: ["bun", "run", "lighthouse"], server: true },
];

const results: { name: string; code: number; seconds: number }[] = [];
const running: { server: Subprocess | null } = { server: null };

async function startServer() {
  running.server = spawn(["node", ".output/server/index.mjs"], {
    env: { ...baseEnv, PORT: port },
    stdout: "ignore",
    stderr: "inherit",
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`http://localhost:${port}/projects`)).ok) return;
    } catch {
      // сервер ещё поднимается
    }
    await Bun.sleep(500);
  }
  throw new Error("Сервер демо-сборки не поднялся");
}

let failed = false;
for (const step of steps) {
  console.log(`\n━━ ${step.name}: ${step.cmd.join(" ")}`);
  const started = performance.now();
  if (step.server && !running.server) await startServer();
  const child = spawn(step.cmd, {
    env: { ...baseEnv, ...step.env, LH_BASE: `http://localhost:${port}` },
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  results.push({ name: step.name, code, seconds: (performance.now() - started) / 1000 });
  if (code !== 0) {
    failed = true;
    break;
  }
}
running.server?.kill();

console.log("\n━━ Итог конвейера");
for (const result of results) {
  console.log(
    `${result.code === 0 ? "✓" : "✗"} код ${result.code}  ${result.seconds.toFixed(1).padStart(6)} с  ${result.name}`,
  );
}
for (const step of steps.slice(results.length))
  console.log(`–  не запускался          ${step.name}`);
console.log(failed ? "Конвейер упал: слияние блокируется" : "Конвейер пройден");
process.exit(failed ? 1 : 0);
