import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import type { GasStore } from "@/adapters/gas-ops/store";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { actingAs, callGasMethod } from "@/api/gas-ops-server";
import { parseEstimateBytes } from "@/api/gas-estimate-files";
import { GasOpsError, type GasOpsSnapshot } from "@/ports/gas-ops";
import { accruedRub, FULL_BP, sectionWorkRub } from "@/domain/gas-ops/section-accrual";
import { customerFormatRows } from "@/domain/gas-ops/report";

/**
 * Промпт B сквозь порт и серверную проверку прав (ADR-078): смета → объект → разделы двум
 * бригадам → время → подтверждение с долей → начисление → остаток. Бригадир не видит денег.
 */
function memory(): GasStore & { now(): GasOpsSnapshot } {
  let state = structuredClone(getServerSnapshot());
  state.users = [
    ...state.users,
    {
      id: "u-foreman-2",
      name: "Бригадир 2",
      role: "foreman",
      brigadeId: "brg-2",
      allowedObjectIds: [],
    },
  ];
  return {
    read: async () => state,
    update: async (change) => (state = change(state)),
    now: () => state,
  };
}

const FIXTURE = join(import.meta.dir, "..", "fixtures", "estimates", "resource-b.xls");

async function setup() {
  const store = memory();
  const manager = createGasOpsDemo(actingAs(store, "u-manager"), null);
  const result = await parseEstimateBytes(new Uint8Array(readFileSync(FIXTURE)));
  if (!result.ok) throw new Error(result.message);
  const p = result.parsed;
  const file = await manager.intakeEstimateFile({
    sha256: "e".repeat(64),
    name: "смета.xls",
    size: 1,
    storagePath: null,
    parsed: p,
  });
  if (file.kind !== "added") throw new Error("не добавлена");
  const object = await manager.createObjectFromEstimate({
    versionId: file.versionId!,
    label: "ул. Лесная, 22",
    code: p.header!.number.value!,
    workType: "Перемонтаж",
    address: p.header!.address.value,
    estimateNumber: p.header!.number.value,
  });
  const sections = (store.now().objectSections ?? []).filter((s) => s.objectId === object.id);
  const [s3, s7] = [
    sections.find((s) => s.number === "3")!,
    sections.find((s) => s.number === "7")!,
  ];
  await manager.assignSection({
    objectId: object.id,
    sectionKey: s3.key,
    brigadeId: "brg-1",
    from: "2026-09-28",
    to: null,
  });
  await manager.assignSection({
    objectId: object.id,
    sectionKey: s7.key,
    brigadeId: "brg-2",
    from: "2026-09-28",
    to: null,
  });
  return { store, manager, object, s3, s7 };
}

const time = (day: string, objectId: string, brigadeId: string, key: string) => ({
  day,
  brigadeId,
  employeeId: null,
  objectId,
  start: "8:00",
  end: "17:00",
  breakMinutes: 60,
  submit: true,
  headcount: 2,
  clientKey: key,
});

describe("назначения → время → доля → начисление (ADR-078)", () => {
  test("два раздела двум бригадам: каждая видит и отправляет только свой", async () => {
    const { store, object, s3, s7 } = await setup();
    const f1 = createGasOpsDemo(actingAs(store, "u-foreman-1"), null);
    const f2 = createGasOpsDemo(actingAs(store, "u-foreman-2"), null);

    // «с 8 до 17, обед час» → 8 ч; раздел подставился сам
    const e1 = await f1.createEntry(time("2026-09-29", object.id, "brg-1", "k1"));
    expect(e1.minutes).toBe(480);
    expect(e1.sectionKey).toBe(s3.key);
    // Повторная отправка с тем же ключом — та же запись, дубля нет
    const again = await f1.createEntry(time("2026-09-29", object.id, "brg-1", "k1"));
    expect(again.id).toBe(e1.id);
    expect(store.now().entries.filter((e) => e.clientKey === "k1")).toHaveLength(1);

    const e2 = await f2.createEntry(time("2026-09-29", object.id, "brg-2", "k2"));
    expect(e2.sectionKey).toBe(s7.key);
    // Чужой раздел — отказ
    await expect(
      f1.createEntry({ ...time("2026-09-30", object.id, "brg-1", "k3"), sectionKey: s7.key }),
    ).rejects.toBeInstanceOf(GasOpsError);

    // Снимок бригадира: свои назначения, без разделов с суммами и без начислений
    const view = await callGasMethod({
      store,
      userId: "u-foreman-1",
      method: "snapshot",
      args: [],
    });
    const snap = view as GasOpsSnapshot;
    expect(snap.sectionAssignments?.map((a) => a.brigadeId)).toEqual(["brg-1"]);
    expect(snap.objectSections).toEqual([]);
    expect(snap.sectionProgress).toEqual([]);
  });

  test("Оксана: предложенная доля, правка доли, «раздел завершён» — ровно стоимость", async () => {
    const { store, manager, object, s3 } = await setup();
    const f1 = createGasOpsDemo(actingAs(store, "u-foreman-1"), null);
    const workRub = sectionWorkRub(s3)!;
    const days = ["2026-09-28", "2026-09-29", "2026-09-30"];
    const ids: string[] = [];
    for (const day of days) ids.push((await f1.createEntry(time(day, object.id, "brg-1", day))).id);

    // Автопилот такую запись не подтверждает: доля за человеком
    expect(store.now().entries.find((e) => e.id === ids[0])?.status).toBe("pending");

    // Предложение без правки: доля = предложенная системой, сумма = СМР + опрессовка
    const suggested = await manager.review({ id: ids[0]!, action: "confirm" });
    expect(suggested.accrual?.mode).toBe("share");
    expect(suggested.accrual?.fromBp).toBe(0);
    expect(suggested.accrual?.suggestedBp).toBe(suggested.accrual?.toBp);
    expect(suggested.amountRub).toBe(suggested.accrual!.smrRub + suggested.accrual!.pressureRub);
    await manager.undoReview(ids[0]!);

    const first = await manager.review({
      id: ids[0]!,
      action: "confirm",
      accrual: { kind: "share", percent: 20 },
    });
    expect(first.accrual?.toBp).toBe(2000);

    const second = await manager.review({
      id: ids[1]!,
      action: "confirm",
      accrual: { kind: "share", percent: 60 },
    });
    expect(second.accrual?.toBp).toBe(6000);
    expect(accruedRub(store.now().entries, object.id, s3.key)).toBe(
      Math.floor((workRub * 6000) / FULL_BP),
    );

    // Бригадир ответил «закончены», Оксана ставит «Раздел завершён»
    await f1.setSectionDone({ entryId: ids[2]!, done: true });
    const last = await manager.review({
      id: ids[2]!,
      action: "confirm",
      accrual: { kind: "share", done: true },
    });
    expect(last.accrual?.toBp).toBe(FULL_BP);
    expect(accruedRub(store.now().entries, object.id, s3.key)).toBe(workRub);
    const history = (store.now().sectionProgress ?? []).filter((p) => p.sectionKey === s3.key);
    expect(history.map((p) => p.kind)).toEqual(["edited", "edited", "completed"]);
    expect(history.reduce((a, p) => a + p.accruedRub, 0)).toBe(workRub);
  });

  test("отмена решения возвращает долю и начисление; после следующего — нельзя", async () => {
    const { store, manager, object } = await setup();
    const f1 = createGasOpsDemo(actingAs(store, "u-foreman-1"), null);
    const a = await f1.createEntry(time("2026-09-28", object.id, "brg-1", "u1"));
    const b = await f1.createEntry(time("2026-09-29", object.id, "brg-1", "u2"));
    await manager.review({ id: a.id, action: "confirm" });
    const back = await manager.undoReview(a.id);
    expect(back.status).toBe("pending");
    expect(back.accrual ?? null).toBe(null);
    expect(store.now().sectionProgress ?? []).toHaveLength(0);

    await manager.review({ id: a.id, action: "confirm", accrual: { kind: "share", percent: 30 } });
    await manager.review({ id: b.id, action: "confirm", accrual: { kind: "share", percent: 50 } });
    await expect(manager.undoReview(a.id)).rejects.toBeInstanceOf(GasOpsError);
    // Последнее решение отменяется: доля раздела снова 30 %
    await manager.undoReview(b.id);
    expect((store.now().sectionProgress ?? []).at(-1)?.toBp).toBe(3000);
  });

  test("бригадир не назначает разделы и не меняет режим начисления — 403 на сервере", async () => {
    const { store, object, s3 } = await setup();
    await expect(
      callGasMethod({
        store,
        userId: "u-foreman-1",
        method: "assignSection",
        args: [
          {
            objectId: object.id,
            sectionKey: s3.key,
            brigadeId: "brg-1",
            from: "2026-10-05",
            to: null,
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      callGasMethod({ store, userId: "u-foreman-1", method: "setAccrualMode", args: ["time"] }),
    ).rejects.toMatchObject({ status: 403 });
  });

  test("режим «по времени»: запись с разделом считается по минутам всей сметы, как до B", async () => {
    const { store, manager, object } = await setup();
    await manager.setAccrualMode("time");
    const f1 = createGasOpsDemo(actingAs(store, "u-foreman-1"), null);
    const e = await f1.createEntry(time("2026-09-28", object.id, "brg-1", "t1"));
    const ok = await manager.review({ id: e.id, action: "confirm" });
    expect(ok.accrual ?? null).toBe(null);
  });

  test("повторное назначение того же раздела той же бригаде — отказ", async () => {
    const { manager, object, s3 } = await setup();
    await expect(
      manager.assignSection({
        objectId: object.id,
        sectionKey: s3.key,
        brigadeId: "brg-1",
        from: "2026-10-01",
        to: null,
      }),
    ).rejects.toBeInstanceOf(GasOpsError);
  });
});

describe("отчёт по доле раздела (ADR-078)", () => {
  test("утверждённый отчёт: только подтверждённое, опрессовка строкой, в итоги не складывается", async () => {
    const { store, manager, object, s3 } = await setup();
    const f1 = createGasOpsDemo(actingAs(store, "u-foreman-1"), null);
    const a = await f1.createEntry(time("2026-09-28", object.id, "brg-1", "r1"));
    const b = await f1.createEntry(time("2026-09-29", object.id, "brg-1", "r2"));
    await manager.review({ id: a.id, action: "confirm", accrual: { kind: "share", percent: 50 } });
    // b остаётся неподтверждённой
    const s = store.now();
    const rows = customerFormatRows({ ...s, days: s.week.days, mode: "confirmed" });
    const address = rows.filter((r) => r.kind === "address" && r.label === object.label);
    expect(address.flatMap((r) => r.entryIds)).toEqual([a.id]);
    expect(address.flatMap((r) => r.entryIds)).not.toContain(b.id);
    const confirmed = s.entries.find((e) => e.id === a.id)!;
    expect(s3.pressureKopecks).toBeGreaterThan(0);
    expect(confirmed.accrual!.pressureRub).toBeGreaterThan(0);
    const pressure = rows.find((r) => r.kind === "pressure" && r.parentId === address[0]!.id);
    expect(pressure?.total.amountRub).toBe(confirmed.accrual!.pressureRub);
    // Адрес несёт всю сумму записи, строка опрессовки — справочно
    expect(address[0]!.total.amountRub).toBe(confirmed.amountRub);
    const total = rows.find((r) => r.kind === "total")!;
    const groups = rows.filter((r) => r.kind === "group");
    expect(total.total.amountRub).toBe(groups.reduce((x, g) => x + (g.total.amountRub ?? 0), 0));
  });
});
