import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import type { GasStore } from "@/adapters/gas-ops/store";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { actingAs, callGasMethod, redactFor } from "@/api/gas-ops-server";
import { estimateFilesResponse, parseEstimateBytes } from "@/api/gas-estimate-files";
import { createEstimateStorage } from "@/adapters/gas-ops/estimate-storage";
import type { ParsedWorkbook } from "@/domain/gas-ops/estimate-labels";
import { GasOpsError, type GasOpsSnapshot } from "@/ports/gas-ops";

/**
 * Папка смет сквозь порт и сервер (ADR-077): дубль по хешу без новой версии, объект из сметы
 * без дублей, новая версия того же КП с изменёнными разделами, бригадир — 403 и без сумм.
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
const bytes = new Uint8Array(readFileSync(FIXTURE));

async function parsed(): Promise<ParsedWorkbook> {
  const result = await parseEstimateBytes(bytes);
  if (!result.ok) throw new Error(result.message);
  return result.parsed;
}

describe("папка смет через порт", () => {
  test("тот же файл — «Уже загружена», вторая версия не появляется", async () => {
    const store = memory();
    const port = createGasOpsDemo(actingAs(store, "u-manager"), null);
    const before = store.now().estimateVersions.length;
    const input = {
      sha256: "a".repeat(64),
      name: "смета.xls",
      size: 1,
      storagePath: null,
      parsed: await parsed(),
    };
    const first = await port.intakeEstimateFile(input);
    expect(first.kind).toBe("added");
    const again = await port.intakeEstimateFile({ ...input, name: "копия.xls" });
    expect(again).toEqual({
      kind: "duplicate",
      fileId: first.fileId,
      versionId: first.versionId,
      version: 1,
    });
    expect(store.now().estimateVersions.length).toBe(before + 1);
    expect(store.now().estimateFiles?.length).toBe(1);
    expect(store.now().estimateFiles?.[0]?.repeats).toBe(1);
  });

  test("создать объект: разделы и исходный файл; второй такой же — отказ", async () => {
    const store = memory();
    const port = createGasOpsDemo(actingAs(store, "u-manager"), null);
    const p = await parsed();
    const first = await port.intakeEstimateFile({
      sha256: "b".repeat(64),
      name: "к.xls",
      size: 1,
      storagePath: "bb/x.xls",
      parsed: p,
    });
    if (first.kind !== "added") throw new Error("не добавлена");
    expect(first.match.kind).toBe("new");
    const draft = {
      label: "ул. Лесная, 22, кв. 2",
      code: p.header!.number.value!,
      workType: "Перемонтаж",
      address: p.header!.address.value,
      estimateNumber: p.header!.number.value,
    };
    const object = await port.createObjectFromEstimate({ versionId: first.versionId!, ...draft });
    const s = store.now();
    expect(object.sourceFileId).toBe(first.fileId);
    expect(s.estimateVersions.find((v) => v.id === first.versionId)?.objectId).toBe(object.id);
    const sections = (s.objectSections ?? []).filter((x) => x.objectId === object.id);
    expect(sections.map((x) => x.number)).toEqual(["3", "7", "9"]);
    expect(sections[0]!.workKopecks).toBe(
      sections[0]!.totalKopecks - sections[0]!.materialsKopecks!,
    );
    expect(sections[0]!.pressureKopecks).toBeGreaterThan(0);

    // Другой файл того же объекта: новая версия 2, изменился раздел 3
    const changed: ParsedWorkbook = {
      ...p,
      sections: p.sections.map((x) =>
        x.number === "3" ? { ...x, kopecks: x.kopecks + 10000 } : x,
      ),
    };
    const second = await port.intakeEstimateFile({
      sha256: "c".repeat(64),
      name: "к2.xls",
      size: 1,
      storagePath: null,
      parsed: changed,
    });
    expect(second).toMatchObject({ kind: "added", version: 2, changed: ["3"] });
    const v2 = store.now().estimateVersions.find((v) => v.id === second.versionId);
    expect(v2?.objectId).toBe(object.id);
    // Деньги решает человек: разделы объекта не меняются, пока версия 2 не подтверждена
    expect((store.now().objectSections ?? []).find((x) => x.number === "3")?.totalKopecks).toBe(
      sections[0]!.totalKopecks,
    );

    // Третий файл с тем же номером, но не прикреплённый: создать второй объект нельзя
    const third = await port.intakeEstimateFile({
      sha256: "d".repeat(64),
      name: "к3.xls",
      size: 1,
      storagePath: null,
      parsed: { ...p, header: { ...p.header!, number: { value: null, row: null, reason: "нет" } } },
    });
    let refused: unknown = null;
    try {
      await port.createObjectFromEstimate({ versionId: third.versionId!, ...draft });
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(GasOpsError);
    expect((refused as GasOpsError).code).toBe("duplicate");
    expect(
      store.now().objects.filter((o) => o.estimateNumber === draft.estimateNumber).length,
    ).toBe(1);
  });

  test("бригадир: создать объект из сметы нельзя, сметы и разделы не видны", async () => {
    const store = memory();
    let status: number | null = null;
    try {
      await callGasMethod({
        store,
        userId: "u-foreman-1",
        method: "createObjectFromEstimate",
        args: [{}],
      });
    } catch (error) {
      status = (error as { status?: number }).status ?? -1;
    }
    expect(status).toBe(403);
    const foreman = store.now().users.find((u) => u.id === "u-foreman-1")!;
    const seen = redactFor(foreman, "snapshot", {
      ...store.now(),
      estimateFiles: [{ id: "f" } as never],
      objectSections: [{ id: "s", totalKopecks: 1 } as never],
    });
    expect(seen.estimateFiles).toEqual([]);
    expect(seen.objectSections).toEqual([]);
  });
});

describe("маршрут /api/gas/estimate-files", () => {
  const deps = (store: GasStore | null, userId: string | null) => ({
    store,
    userId,
    storage: createEstimateStorage({ ESTIMATE_FILES_DIR: mkdtempSync(join(tmpdir(), "est-")) }),
    parse: parseEstimateBytes,
  });
  const upload = (names: string[]) => {
    const form = new FormData();
    for (const n of names) form.append("files", new File([bytes], n));
    return new Request("http://x/api/gas/estimate-files", { method: "POST", body: form });
  };

  test("бригадир получает 403, без сессии 401, без базы 501", async () => {
    const store = memory();
    expect(
      (await estimateFilesResponse(upload(["a.xls"]), deps(store, "u-foreman-1"))).status,
    ).toBe(403);
    expect((await estimateFilesResponse(upload(["a.xls"]), deps(store, null))).status).toBe(401);
    expect((await estimateFilesResponse(upload(["a.xls"]), deps(null, "u-manager"))).status).toBe(
      501,
    );
    expect(store.now().estimateFiles?.length ?? 0).toBe(0);
  });

  test("менеджер: несколько файлов разом, второй такой же — «Уже загружена», файл хранится", async () => {
    const store = memory();
    const d = deps(store, "u-manager");
    const before = store.now().estimateVersions.length;
    const notExcel = new FormData();
    notExcel.append("files", new File([new Uint8Array([1, 2, 3, 4])], "фото.jpg"));
    const res = await estimateFilesResponse(upload(["смета.xls", "та же.xls"]), d);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { ok: boolean; text: string }[] };
    expect(body.results.map((r) => r.text)).toEqual(["Распознана", "Уже загружена, версия 1"]);
    const file = store.now().estimateFiles![0]!;
    expect(file.storagePath).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{64}\.xls$/);
    expect(await d.storage.read(file.storagePath!)).toEqual(bytes);
    const bad = await estimateFilesResponse(
      new Request("http://x/api/gas/estimate-files", { method: "POST", body: notExcel }),
      d,
    );
    expect(((await bad.json()) as { results: { text: string }[] }).results[0]!.text).toContain(
      "Не распознана",
    );
    const download = await estimateFilesResponse(
      new Request(`http://x/api/gas/estimate-files?file=${file.id}`),
      d,
    );
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
    const reparse = await estimateFilesResponse(
      new Request(`http://x/api/gas/estimate-files?reparse=${file.id}`, { method: "POST" }),
      d,
    );
    expect(reparse.status).toBe(200);
    expect(store.now().estimateVersions.length).toBe(before + 1);
  });
});
