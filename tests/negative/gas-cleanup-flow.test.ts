import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import type { GasStore } from "@/adapters/gas-ops/store";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { actingAs, callGasMethod, GasAccessError } from "@/api/gas-ops-server";
import { parseEstimateBytes } from "@/api/gas-estimate-files";
import { GasOpsError, type GasOpsSnapshot } from "@/ports/gas-ops";
import { clearCounts, countsPhrase, isEmptyData } from "@/domain/gas-ops/cleanup";

/**
 * Удаление данных (ADR-088) сквозь порт и серверную проверку прав: смета удаляется и
 * загружается снова, объект уходит со всем, что на него ссылается, очистка оставляет
 * справочники. Исходные файлы смет без ссылок удаляются с диска.
 */
function memory(): GasStore & { now(): GasOpsSnapshot } {
  let state = structuredClone(getServerSnapshot());
  return {
    read: async () => state,
    update: async (change) => (state = change(state)),
    now: () => state,
  };
}

const FIXTURE = join(import.meta.dir, "..", "fixtures", "estimates", "resource-b.xls");

async function parsed() {
  const result = await parseEstimateBytes(new Uint8Array(readFileSync(FIXTURE)));
  if (!result.ok) throw new Error(result.message);
  return result.parsed;
}

async function upload(store: GasStore, sha = "e") {
  const manager = createGasOpsDemo(actingAs(store, "u-manager"), null);
  const p = await parsed();
  const file = await manager.intakeEstimateFile({
    sha256: sha.repeat(64),
    name: "смета.xls",
    size: 1,
    storagePath: `ee/${sha.repeat(64)}.xls`,
    parsed: p,
  });
  if (file.kind !== "added") throw new Error("не добавлена");
  return { manager, p, versionId: file.versionId! };
}

async function withObject() {
  const store = memory();
  const { manager, p, versionId } = await upload(store);
  const object = await manager.createObjectFromEstimate({
    versionId,
    label: "ул. Лесная, 22",
    code: p.header!.number.value!,
    workType: "Перемонтаж",
    address: p.header!.address.value,
    estimateNumber: p.header!.number.value,
  });
  const section = (store.now().objectSections ?? []).find((s) => s.objectId === object.id)!;
  await manager.assignSection({
    objectId: object.id,
    sectionKey: section.key,
    brigadeId: "brg-1",
    from: "2026-09-28",
    to: null,
  });
  await manager.createEntry({
    day: "2026-09-29",
    brigadeId: "brg-1",
    employeeId: null,
    objectId: object.id,
    start: "8:00",
    end: "17:00",
    breakMinutes: 60,
    submit: true,
    sectionKey: section.key,
  });
  return { store, manager, object, versionId };
}

describe("удаление сметы", () => {
  test("неподтверждённая смета удаляется с файлом, тот же файл загружается заново", async () => {
    const store = memory();
    const { manager, versionId } = await upload(store);
    const counts = await manager.deleteEstimate(versionId);
    expect(counts.estimates).toBe(1);
    expect(counts.files).toBe(1);
    expect(store.now().estimateVersions.some((v) => v.id === versionId)).toBe(false);
    expect(store.now().estimateFiles ?? []).toHaveLength(0);
    expect(store.now().audit[0]?.action).toBe("estimate.delete");
    // Не «Уже загружена»: файл снова становится версией
    const again = await upload(store);
    expect(again.versionId).toBeTruthy();
  });

  test("отмена импорта тоже убирает файл: повторная загрузка не «дубликат»", async () => {
    const store = memory();
    const { manager, versionId } = await upload(store);
    await manager.discardEstimateVersion(versionId);
    expect(store.now().estimateFiles ?? []).toHaveLength(0);
    await upload(store);
  });

  test("подтверждённая смета не удаляется: стоимость объекта посчитана по ней", async () => {
    const { manager, versionId } = await withObject();
    await manager.confirmEstimateVersion(versionId);
    await expect(manager.deleteEstimate(versionId)).rejects.toThrow(/Удалите объект целиком/);
  });

  test("смета, по которой созданы разделы объекта, не удаляется: только вместе с объектом", async () => {
    const { store, manager, versionId } = await withObject();
    await expect(manager.deleteEstimate(versionId)).rejects.toThrow(/созданы разделы объекта/);
    expect(store.now().estimateVersions.some((v) => v.id === versionId)).toBe(true);
  });

  test("бригадир смету не удаляет: сервер отказывает до порта", async () => {
    const store = memory();
    const { versionId } = await upload(store);
    await expect(
      callGasMethod({
        store,
        userId: "u-foreman-1",
        method: "deleteEstimate",
        args: [versionId],
      }),
    ).rejects.toBeInstanceOf(GasAccessError);
    expect(store.now().estimateVersions.some((v) => v.id === versionId)).toBe(true);
  });
});

describe("удаление объекта", () => {
  test("уходят сметы, файлы, разделы, назначения и записи; бригады остаются", async () => {
    const { store, manager, object } = await withObject();
    const brigades = store.now().brigades.length;
    const counts = await manager.deleteObject(object.id);
    expect(counts).toMatchObject({ objects: 1, estimates: 1, files: 1, entries: 1 });
    expect(counts.sections).toBeGreaterThan(0);
    const s = store.now();
    expect(s.objects.some((o) => o.id === object.id)).toBe(false);
    expect(s.estimateVersions.some((v) => v.objectId === object.id)).toBe(false);
    expect((s.objectSections ?? []).some((x) => x.objectId === object.id)).toBe(false);
    expect((s.sectionAssignments ?? []).some((x) => x.objectId === object.id)).toBe(false);
    expect(s.entries.some((e) => e.objectId === object.id)).toBe(false);
    expect(s.assignments.some((a) => a.objectIds.includes(object.id))).toBe(false);
    expect(s.brigades).toHaveLength(brigades);
    expect(s.audit[0]?.action).toBe("object.delete");
    // Адрес объекта в журнал не пишется
    expect(s.audit[0]?.detail).not.toContain("Лесная");
  });

  test("объект с записями закрытой недели не удаляется", async () => {
    const { store, manager, object } = await withObject();
    const s = store.now();
    await store.update((x) => ({
      ...x,
      periods: [
        {
          id: "per-1",
          weekFrom: s.week.from,
          weekTo: s.week.to,
          version: 1,
          closedAt: `${s.week.to}T18:00:00`,
          closedBy: "u-director",
          entries: [],
          totals: { accruedRub: 0, minutes: 0, manMinutes: 0, count: 0 },
          accepted: [],
          reopenedAt: null,
          reopenedBy: null,
          reopenReason: null,
        },
      ],
    }));
    const refusal = await manager.deleteObject(object.id).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(GasOpsError);
    expect((refusal as GasOpsError).code).toBe("period-closed");
    expect(store.now().objects.some((o) => o.id === object.id)).toBe(true);
  });

  test("руководитель объект не удаляет", async () => {
    const { store, object } = await withObject();
    await expect(
      callGasMethod({ store, userId: "u-director", method: "deleteObject", args: [object.id] }),
    ).rejects.toBeInstanceOf(GasAccessError);
  });
});

describe("очистка рабочих данных", () => {
  test("на сервере только администратор; справочники и люди остаются", async () => {
    const { store } = await withObject();
    for (const userId of ["u-manager", "u-director", "u-foreman-1"]) {
      await expect(
        callGasMethod({ store, userId, method: "clearData", args: [] }),
      ).rejects.toBeInstanceOf(GasAccessError);
    }
    const before = store.now();
    const removed: string[] = [];
    const counts = (await callGasMethod({
      store,
      userId: "u-admin",
      method: "clearData",
      args: [],
      removeFiles: async (paths) => void removed.push(...paths),
    })) as ReturnType<typeof clearCounts>;
    expect(counts.objects).toBe(before.objects.length);
    expect(counts.entries).toBe(before.entries.length);
    const after = store.now();
    expect(isEmptyData(clearCounts(after))).toBe(true);
    expect(after.reviews).toHaveLength(0);
    expect(after.brigades).toEqual(before.brigades);
    expect(after.employees).toEqual(before.employees);
    expect(after.rates).toEqual(before.rates);
    expect(after.users.map((u) => u.id)).toEqual(before.users.map((u) => u.id));
    expect(after.costRules.every((r) => r.objectId === null)).toBe(true);
    expect(after.audit[0]?.action).toBe("data.clear");
    // Исходный файл сметы без ссылок — удалить с диска
    expect(removed).toEqual([`ee/${"e".repeat(64)}.xls`]);
  });

  test("после очистки смета загружается и объект создаётся с нуля", async () => {
    const { store } = await withObject();
    await callGasMethod({ store, userId: "u-admin", method: "clearData", args: [] });
    const { manager, p, versionId } = await upload(store);
    const object = await manager.createObjectFromEstimate({
      versionId,
      label: "ул. Лесная, 22",
      code: p.header!.number.value!,
      workType: "Перемонтаж",
      address: p.header!.address.value,
      estimateNumber: p.header!.number.value,
    });
    expect(store.now().objects.map((o) => o.id)).toEqual([object.id]);
  });

  test("файл, на который ещё ссылается другая загрузка, с диска не удаляется", async () => {
    const store = memory();
    const first = await upload(store, "a");
    await upload(store, "b");
    const removed: string[] = [];
    await callGasMethod({
      store,
      userId: "u-manager",
      method: "deleteEstimate",
      args: [first.versionId],
      removeFiles: async (paths) => void removed.push(...paths),
    });
    expect(removed).toEqual([`ee/${"a".repeat(64)}.xls`]);
  });
});

describe("подписи", () => {
  test("только ненулевые части, с падежами", () => {
    expect(
      countsPhrase({
        objects: 2,
        estimates: 1,
        files: 0,
        entries: 21,
        sections: 5,
        reports: 0,
        weeks: 0,
      }),
    ).toBe("2 объекта, 1 смета, 21 запись времени, 5 разделов");
    expect(
      countsPhrase({
        objects: 0,
        estimates: 0,
        files: 0,
        entries: 0,
        sections: 0,
        reports: 0,
        weeks: 0,
      }),
    ).toBe("нет данных");
  });
});

describe("бригады: правка и удаление", () => {
  test("переименование: код прежний, имя уникально, журнал без лишнего", async () => {
    const store = memory();
    const manager = createGasOpsDemo(actingAs(store, "u-manager"), null);
    const b = store.now().brigades[0]!;
    const other = store.now().brigades[1]!;
    const next = await manager.updateBrigade({
      id: b.id,
      name: "Бригада Север",
      groupId: b.groupId,
      phone: " +7 900 000-00-00 ",
    });
    expect(next.code).toBe(b.code);
    expect(next.phone).toBe("+7 900 000-00-00");
    expect(store.now().audit[0]?.action).toBe("brigade.update");
    await expect(
      manager.updateBrigade({ id: b.id, name: other.name, groupId: b.groupId, phone: null }),
    ).rejects.toThrow(/уже есть/);
  });

  test("бригада с записями не удаляется", async () => {
    const store = memory();
    const manager = createGasOpsDemo(actingAs(store, "u-manager"), null);
    const withEntries = store.now().entries[0]!.brigadeId;
    await expect(manager.deleteBrigade(withEntries)).rejects.toThrow(/такую бригаду не удаляют/);
    expect(store.now().brigades.some((b) => b.id === withEntries)).toBe(true);
  });

  test("новая бригада без записей удаляется с составом и назначениями", async () => {
    const { store, manager, object } = await withObject();
    const b = await manager.addBrigade({
      name: "Бригада на удаление",
      groupId: store.now().groups[0]!.id,
      phone: null,
    });
    await manager.addCrewMember({ brigadeId: b.id, name: "Иванов И.", from: "2026-09-28" });
    const section = (store.now().objectSections ?? []).find((s) => s.objectId === object.id)!;
    await manager.assignSection({
      objectId: object.id,
      sectionKey: section.key,
      brigadeId: b.id,
      from: "2026-09-28",
      to: null,
    });
    await manager.deleteBrigade(b.id);
    const s = store.now();
    expect(s.brigades.some((x) => x.id === b.id)).toBe(false);
    expect(s.crew.some((c) => c.brigadeId === b.id)).toBe(false);
    expect((s.sectionAssignments ?? []).some((a) => a.brigadeId === b.id)).toBe(false);
    expect(s.audit[0]?.action).toBe("brigade.delete");
  });

  test("руководитель бригаду не меняет и не удаляет: сервер отказывает", async () => {
    const store = memory();
    const b = store.now().brigades[0]!;
    for (const [method, args] of [
      ["deleteBrigade", [b.id]],
      ["updateBrigade", [{ id: b.id, name: "X", groupId: b.groupId, phone: null }]],
    ] as const) {
      await expect(
        callGasMethod({ store, userId: "u-director", method, args: [...args] }),
      ).rejects.toBeInstanceOf(GasAccessError);
    }
  });
});
