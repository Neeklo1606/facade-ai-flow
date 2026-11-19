/**
 * Промпт B на PostgreSQL (ADR-078): смета → объект → назначение разделов двум бригадам →
 * время бригадира → подтверждение с долей → неделя закрыта → Excel только с подтверждённым.
 * Затем новое хранилище (как после перезапуска сервера) читает то же: назначения, история
 * доли, начисления. Запуск на базе с миграциями:
 * `DATABASE_URL=… bun scripts/check-section-accrual-db.ts`. Пишет в базу демо-набор.
 */
import { readFileSync } from "node:fs";
import { driverConfigFromEnv, createDriver } from "@/adapters/db";
import { createGasDbStore } from "@/adapters/gas-ops/db-store";
import { createGasOpsDemo, weekReasons } from "@/adapters/gas-ops/demo";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import { actingAs, callGasMethod } from "@/api/gas-ops-server";
import { parseEstimateBytes } from "@/api/gas-estimate-files";
import { sha256Hex } from "@/adapters/gas-ops/estimate-storage";
import { buildCustomerWorkbook } from "@/adapters/gas-ops/xlsx";
import { analyticRows, customerFormatRows } from "@/domain/gas-ops/report";
import { accruedRub, FULL_BP, sectionWorkRub } from "@/domain/gas-ops/section-accrual";
import type { GasOpsSnapshot } from "@/ports/gas-ops";

const config = driverConfigFromEnv(process.env);
if (!config) throw new Error("Нужен DATABASE_URL");
const fail = (m: string): never => {
  console.error(`ОШИБКА: ${m}`);
  process.exit(1);
};

const store = createGasDbStore(await createDriver(config));
const seed = getServerSnapshot();
seed.users = [
  ...seed.users,
  {
    id: "u-foreman-2",
    name: "Бригадир 2",
    role: "foreman",
    brigadeId: "brg-2",
    allowedObjectIds: [],
  },
];
await store.seed(seed);

const manager = createGasOpsDemo(actingAs(store, "u-manager"), null);
const bytes = new Uint8Array(readFileSync("tests/fixtures/estimates/resource-b.xls"));
const parsed = await parseEstimateBytes(bytes);
if (!parsed.ok) fail(parsed.message);
const p = parsed.ok ? parsed.parsed : fail("нет разбора");
const file = await manager.intakeEstimateFile({
  sha256: sha256Hex(bytes),
  name: "смета.xls",
  size: bytes.length,
  storagePath: null,
  parsed: p,
});
if (file.kind !== "added") fail("смета не добавлена");
const object = await manager.createObjectFromEstimate({
  versionId: file.kind === "added" ? file.versionId! : "",
  label: "ул. Лесная, 22, кв. 2",
  code: p.header!.number.value!,
  workType: p.header!.workKind.value,
  address: p.header!.address.value,
  estimateNumber: p.header!.number.value,
});
const sections = ((await store.read()).objectSections ?? []).filter(
  (s) => s.objectId === object.id,
);
const s3 = sections.find((s) => s.number === "3") ?? fail("нет раздела 3");
const s7 = sections.find((s) => s.number === "7") ?? fail("нет раздела 7");
for (const [section, brigadeId] of [
  [s3, "brg-1"],
  [s7, "brg-2"],
] as const)
  await manager.assignSection({
    objectId: object.id,
    sectionKey: section.key,
    brigadeId,
    from: seed.week.from,
    to: seed.week.to,
  });

const f1 = createGasOpsDemo(actingAs(store, "u-foreman-1"), null);
const f2 = createGasOpsDemo(actingAs(store, "u-foreman-2"), null);
const entry = (day: string, brigadeId: string, key: string) => ({
  day,
  brigadeId,
  employeeId: null,
  objectId: object.id,
  start: "8:00",
  end: "17:00",
  breakMinutes: 60,
  submit: true,
  headcount: 2,
  clientKey: key,
});
const a = await f1.createEntry(entry("2026-09-28", "brg-1", "db-a"));
const twin = await f1.createEntry(entry("2026-09-28", "brg-1", "db-a"));
if (twin.id !== a.id) fail("повторная отправка создала дубль");
if (a.minutes !== 480 || a.sectionKey !== s3.key) fail("время или раздел бригады 1");
const b = await f1.createEntry(entry("2026-09-29", "brg-1", "db-b"));
const c = await f2.createEntry(entry("2026-09-29", "brg-2", "db-c"));
if (c.sectionKey !== s7.key) fail("бригаде 2 не подставился её раздел");
const d = await f2.createEntry(entry("2026-09-30", "brg-2", "db-d"));
await f1.setSectionDone({ entryId: b.id, done: true });

await manager.review({ id: a.id, action: "confirm", accrual: { kind: "share", percent: 40 } });
await manager.review({ id: b.id, action: "confirm", accrual: { kind: "share", done: true } });
await manager.review({ id: c.id, action: "confirm" });
// d остаётся неподтверждённой: в утверждённый Excel не идёт

// Бригадир через сервер: без начислений и без разделов с суммами
const foremanView = (await callGasMethod({
  store,
  userId: "u-foreman-1",
  method: "snapshot",
  args: [],
})) as GasOpsSnapshot;
if (foremanView.entries.some((e) => e.accrual || e.amountRub !== null))
  fail("бригадир видит начисление");
if ((foremanView.objectSections ?? []).length || (foremanView.sectionProgress ?? []).length)
  fail("бригадир видит разделы с суммами");

// Утверждённый отчёт до закрытия недели: только подтверждённое
const now = await store.read();
const rows = customerFormatRows({ ...now, days: now.week.days, mode: "confirmed" });
const ids = new Set(rows.flatMap((r) => r.entryIds));
if (ids.has(d.id)) fail("неподтверждённая запись попала в утверждённый отчёт");
if (![a.id, b.id, c.id].every((id) => ids.has(id))) fail("подтверждённой записи нет в отчёте");
const xlsx = await buildCustomerWorkbook({
  rows,
  analytic: analyticRows({ ...now, days: now.week.days, mode: "confirmed" }),
  days: now.week.days,
  week: now.week,
  mode: "confirmed",
});
if (xlsx.byteLength < 1000) fail("Excel пустой");

// Неделя: неподтверждённые записи не дают закрыть — Оксана отклоняет их, руководитель закрывает
for (const e of now.entries.filter(
  (x) => now.week.days.includes(x.day) && ["pending", "clarify", "draft"].includes(x.status),
))
  await manager.review({ id: e.id, action: "reject", comment: "проверка B на PostgreSQL" });
const before = await store.read();
const director = createGasOpsDemo(actingAs(store, "u-director"), null);
await director.closeWeek({
  accepted: weekReasons(before).map((r) => ({ key: r.key, reason: "проверка B на PostgreSQL" })),
});

// «Перезапуск»: новый драйвер и хранилище, чтение с нуля
const fresh = createGasDbStore(await createDriver(config));
const s = await fresh.read();
const workRub = sectionWorkRub(s3)!;
if ((s.sectionAssignments ?? []).filter((x) => x.objectId === object.id).length !== 2)
  fail("назначения не сохранились");
const history = (s.sectionProgress ?? []).filter((x) => x.sectionKey === s3.key);
if (history.map((h) => h.toBp).join() !== `4000,${FULL_BP}`) fail("история доли раздела 3");
if (accruedRub(s.entries, object.id, s3.key) !== workRub)
  fail("раздел завершён, но начислено не ровно стоимость");
if (s.entries.find((e) => e.id === b.id)?.sectionDone !== true) fail("ответ бригадира потерян");
if (!s.periods.some((x) => x.weekFrom === s.week.from && !x.reopenedAt)) fail("неделя не закрыта");

console.log(
  `ok: разделов назначено 2, раздел 3: ${history.length} шага доли, начислено ${accruedRub(s.entries, object.id, s3.key)} из ${workRub} ₽; раздел 7: ${accruedRub(s.entries, object.id, s7.key)} ₽; неделя закрыта; Excel ${xlsx.byteLength} байт без неподтверждённой записи`,
);
process.exit(0);
