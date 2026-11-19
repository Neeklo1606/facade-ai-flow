/**
 * Папка смет на PostgreSQL (ADR-077): смета → объект → разделы через хранилище базы, затем
 * новое хранилище (как после перезапуска сервера) читает то же. Запуск на пустой базе с
 * миграциями: `DATABASE_URL=… bun scripts/check-estimate-intake-db.ts`. Пишет в базу демо-набор.
 */
import { readFileSync } from "node:fs";
import { driverConfigFromEnv, createDriver } from "@/adapters/db";
import { createGasDbStore } from "@/adapters/gas-ops/db-store";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import { actingAs } from "@/api/gas-ops-server";
import { parseEstimateBytes } from "@/api/gas-estimate-files";
import { sha256Hex } from "@/adapters/gas-ops/estimate-storage";

const config = driverConfigFromEnv(process.env);
if (!config) throw new Error("Нужен DATABASE_URL");
const fail = (m: string) => {
  console.error(`ОШИБКА: ${m}`);
  process.exit(1);
};

const first = createGasDbStore(await createDriver(config));
if ((await first.read()).users.length === 0) await first.seed(getServerSnapshot());
const port = createGasOpsDemo(actingAs(first, "u-manager"), null);
const bytes = new Uint8Array(readFileSync("tests/fixtures/estimates/resource-b.xls"));
const parsed = await parseEstimateBytes(bytes);
if (!parsed.ok) fail(parsed.message);
const sha256 = sha256Hex(bytes);
const outcome = await port.intakeEstimateFile({
  sha256,
  name: "смета.xls",
  size: bytes.length,
  storagePath: "x/y.xls",
  parsed: parsed.ok ? parsed.parsed : null,
});
if (outcome.kind === "added") {
  const h = parsed.ok ? parsed.parsed.header! : null;
  await port.createObjectFromEstimate({
    versionId: outcome.versionId!,
    label: "ул. Лесная, 22, кв. 2",
    code: h!.number.value!,
    workType: h!.workKind.value,
    address: h!.address.value,
    estimateNumber: h!.number.value,
  });
}
const again = await port.intakeEstimateFile({
  sha256,
  name: "снова.xls",
  size: bytes.length,
  storagePath: null,
  parsed: null,
});
if (again.kind !== "duplicate") fail("повторный файл не узнан");

// «Перезапуск»: новый драйвер и хранилище, чтение с нуля
const second = createGasDbStore(await createDriver(config));
const s = await second.read();
const file = s.estimateFiles?.find((f) => f.sha256 === sha256);
const version = s.estimateVersions.find((v) => v.id === file?.versionId);
const object = s.objects.find((o) => o.id === version?.objectId);
const sections = (s.objectSections ?? []).filter((x) => x.objectId === object?.id);
if (!file || !version || !object) fail("после перезапуска нет файла, версии или объекта");
if (!version!.header?.number.value) fail("шапка версии не сохранилась");
if (sections.length !== 3) fail(`разделов ${sections.length}, ждали 3`);
if (s.objects.filter((o) => o.estimateNumber === object!.estimateNumber).length !== 1)
  fail("объект задвоился");
console.log(
  `ok: файл ${file!.status}, повторов ${file!.repeats}, версия ${version!.version}, объект ${object!.code}, разделов ${sections.length}, адрес ${JSON.stringify(object!.address)}`,
);
process.exit(0);
