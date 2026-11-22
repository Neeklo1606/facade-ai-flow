/**
 * Проверка П8 рабочего контура без Docker (ADR-086): то же, что делает образ, командами.
 *
 *   NITRO_PRESET=node-server bun run build:server
 *   bun scripts/check-server-p8.ts            # PG_URL=postgres://localhost:5432 P8_PORT=4643
 *
 * 1. Чистая база `gaika_p8_server`: миграции dbmate, db:gas-init, db:gas-user (менеджер, руководитель).
 * 2. Сервер сборки `server` (`node .output/server/index.mjs`) с каталогом файлов смет.
 * 3. Путь пилота: вход по ссылкам, бригады, бригадир, объект, график, смета мастером, формула,
 *    время в боте, проверка, Excel (e2e/pilot/server-pilot.spec.ts).
 * 4. Перезапуск процесса сервера, вторая фаза (e2e/pilot/server-restart.spec.ts): сессии,
 *    запись, исходный файл сметы, Excel, «Люди и вход» со ссылкой и отзывом.
 * 5. Резервная копия (scripts/gas-backup.sh) и восстановление в отдельную базу
 *    `gaika_p8_restore_server` со сверкой (scripts/gas-restore-check.sh).
 *
 * Базы с суффиксом `_server` создаются заново при каждом запуске. Реальных данных нет:
 * имена и телефоны вымышленные, смета из генератора e2e.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const PG = (process.env["PG_URL"] ?? "postgres://localhost:5432").replace(/\/+$/, "");
const PORT = process.env["P8_PORT"] ?? "4643";
const URL_ = `http://localhost:${PORT}`;
const DB = "gaika_p8_server";
const RESTORE_DB = "gaika_p8_restore_server";
const dbUrl = (name: string) => `${PG}/${name}?sslmode=disable`;

const work = mkdtempSync(join(tmpdir(), "gaika-p8-"));
const filesDir = join(work, "estimate-files");
const stateDir = join(work, "state");
const backupDir = join(work, "backups");
for (const dir of [filesDir, stateDir, backupDir]) Bun.spawnSync(["mkdir", "-p", dir]);

const env: Record<string, string> = {
  ...(process.env as Record<string, string>),
  DATABASE_URL: dbUrl(DB),
  DATABASE_DRIVER: "pg",
  SESSION_SECRET: randomBytes(32).toString("hex"),
  APP_TIME_ZONE: process.env["APP_TIME_ZONE"] ?? "Europe/Moscow",
  AUTH_CHANNEL: "log",
  ESTIMATE_FILES_DIR: filesDir,
  PORT,
  HOST: "127.0.0.1",
};

function step(title: string) {
  console.log(`\n== ${title}`);
}

function run(cmd: string[], extra: Record<string, string> = {}): string {
  const out = Bun.spawnSync(cmd, { env: { ...env, ...extra }, stdout: "pipe", stderr: "pipe" });
  const text = out.stdout.toString() + out.stderr.toString();
  if (out.exitCode !== 0) {
    console.error(text);
    throw new Error(`${cmd.slice(0, 3).join(" ")}: код ${out.exitCode}`);
  }
  return text;
}

/** Ссылку приглашения печатает команда пилота; токен в журнал проверки не идёт */
function linkOf(text: string): string {
  const link = /https?:\/\/\S+invite=\S+/.exec(text)?.[0];
  if (!link) throw new Error("Команда не напечатала ссылку входа");
  return link;
}

async function startServer(): Promise<Bun.Subprocess> {
  const proc = Bun.spawn(["node", ".output/server/index.mjs"], {
    env,
    stdout: "ignore",
    stderr: "inherit",
  });
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${URL_}/robots.txt`);
      if (res.ok) return proc;
    } catch {
      // ещё поднимается
    }
    await Bun.sleep(500);
  }
  proc.kill();
  throw new Error(`Сервер не ответил на ${URL_}`);
}

async function stopServer(proc: Bun.Subprocess) {
  proc.kill("SIGTERM");
  await proc.exited;
}

function playwright(phase: "pilot" | "restart", extra: Record<string, string>) {
  const out = Bun.spawnSync(["bunx", "playwright", "test", "-c", "playwright.pilot.config.ts"], {
    env: { ...env, ...extra, PILOT_URL: URL_, P8_STATE_DIR: stateDir, P8_PHASE: phase },
    stdout: "inherit",
    stderr: "inherit",
  });
  if (out.exitCode !== 0) throw new Error(`Playwright, фаза ${phase}: код ${out.exitCode}`);
}

const psql = (url: string, sql: string) =>
  run(["psql", url, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql]).trim();

if (!existsSync(".output/server/index.mjs")) {
  console.error("Нет сборки: NITRO_PRESET=node-server bun run build:server");
  process.exit(2);
}

let server: Bun.Subprocess | null = null;
const results: string[] = [];
try {
  step("1. Чистая база, миграции, компания и люди");
  for (const name of [DB, RESTORE_DB]) {
    psql(dbUrl("postgres"), `drop database if exists ${name}`);
    psql(dbUrl("postgres"), `create database ${name}`);
  }
  run(["bun", "run", "db:migrate"]);
  const adminLink = linkOf(
    run([
      "bun",
      "run",
      "db:gas-init",
      "--name",
      "Соколов Артём",
      "--phone",
      "+79210000000",
      "--group",
      "1. Стальные",
      "--url",
      URL_,
    ]),
  );
  const managerLink = linkOf(
    run([
      "bun",
      "run",
      "db:gas-user",
      "--name",
      "Иванова Ольга",
      "--phone",
      "+79210000001",
      "--role",
      "manager",
      "--url",
      URL_,
    ]),
  );
  const directorLink = linkOf(
    run([
      "bun",
      "run",
      "db:gas-user",
      "--name",
      "Козлов Пётр",
      "--phone",
      "+79210000002",
      "--role",
      "director",
      "--url",
      URL_,
    ]),
  );
  results.push("миграции, db:gas-init, db:gas-user: да");

  step("2. Сервер сборки server");
  server = await startServer();

  step("3. Путь пилота до Excel");
  playwright("pilot", {
    PILOT_ADMIN: adminLink,
    PILOT_MANAGER: managerLink,
    PILOT_DIRECTOR: directorLink,
  });
  results.push("вход по ссылкам, смета, время, проверка, Excel: да");

  step("4. Перезапуск процесса сервера");
  await stopServer(server);
  server = await startServer();
  const [fileId, sha, path] = psql(
    dbUrl(DB),
    "select id || '|' || sha256 || '|' || storage_path from gas_estimate_files where storage_path is not null order by id limit 1",
  ).split("|");
  if (!fileId || !sha || !path || !existsSync(join(filesDir, path))) {
    throw new Error("Исходный файл сметы не сохранён в хранилище");
  }
  playwright("restart", { P8_FILE_ID: fileId, P8_FILE_SHA: sha });
  results.push("после перезапуска: сессии, запись, файл сметы, Excel, приглашение и отзыв: да");

  step("5. Резервная копия и восстановление в отдельную базу");
  const backup = run(["sh", "scripts/gas-backup.sh"], { BACKUP_DIR: backupDir })
    .trim()
    .split("\n")
    .pop()!;
  const restored = run(["sh", "scripts/gas-restore-check.sh", backup], {
    RESTORE_DATABASE_URL: dbUrl(RESTORE_DB),
    RESTORE_FILES_DIR: join(work, "restore-files"),
  });
  console.log(restored);
  if (!restored.includes("Восстановление проверено")) throw new Error("Восстановление не сошлось");
  results.push("копия базы и файлов, восстановление со сверкой: да");

  console.log(`\nП8: проверено\n- ${results.join("\n- ")}`);
} catch (error) {
  console.error(`\nП8: НЕ прошла: ${error instanceof Error ? error.message : String(error)}`);
  if (results.length) console.error(`Успело пройти:\n- ${results.join("\n- ")}`);
  process.exitCode = 1;
} finally {
  if (server) await stopServer(server);
  if (!process.env["P8_KEEP"]) rmSync(work, { recursive: true, force: true });
  else console.log(`Каталог прогона: ${work}`);
}
