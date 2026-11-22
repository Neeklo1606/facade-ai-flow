import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getServerSnapshot } from "@/adapters/gas-ops/state";
import type { GasStore } from "@/adapters/gas-ops/store";
import { createGasOpsDemo } from "@/adapters/gas-ops/demo";
import { actingAs } from "@/api/gas-ops-server";
import { estimateFilesResponse, parseEstimateBytes } from "@/api/gas-estimate-files";
import { createEstimateStorage } from "@/adapters/gas-ops/estimate-storage";
import { keepSourceFile } from "@/domain/gas-ops/estimate-intake";
import type { GasOpsSnapshot } from "@/ports/gas-ops";

/**
 * Исходный файл из мастера «Загрузить смету» (ADR-085): на рабочем контуре байты ложатся
 * в хранилище тома и связываются с версией, а не живут только в разобранном снимке.
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

async function wizardVersion(store: GasStore) {
  const parsed = await parseEstimateBytes(bytes);
  if (!parsed.ok) throw new Error(parsed.message);
  const port = createGasOpsDemo(actingAs(store, "u-manager"), null);
  return port.addEstimateVersion({ parsed: parsed.parsed, fileName: "смета.xls", objectId: null });
}

const deps = (store: GasStore | null, userId: string | null) => ({
  store,
  userId,
  storage: createEstimateStorage({ ESTIMATE_FILES_DIR: mkdtempSync(join(tmpdir(), "keep-")) }),
  parse: parseEstimateBytes,
});

const keep = (versionId: string, body: Uint8Array = bytes) => {
  const form = new FormData();
  form.append("files", new File([body as Uint8Array<ArrayBuffer>], "смета.xls"));
  return new Request(`http://x/api/gas/estimate-files?keep=${versionId}`, {
    method: "POST",
    body: form,
  });
};

describe("исходный файл мастера сметы (ADR-085)", () => {
  test("версия мастера получает файл в хранилище, скачивание отдаёт те же байты", async () => {
    const store = memory();
    const version = await wizardVersion(store);
    expect(version.fileId ?? null).toBeNull();
    const d = deps(store, "u-manager");
    const res = await estimateFilesResponse(keep(version.id), d);
    expect(res.status).toBe(200);
    const { fileId } = (await res.json()) as { fileId: string };
    const s = store.now();
    expect(s.estimateVersions.find((v) => v.id === version.id)?.fileId).toBe(fileId);
    const file = s.estimateFiles!.find((f) => f.id === fileId)!;
    expect(file.storagePath).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{64}\.xls$/);
    expect(file.versionId).toBe(version.id);
    const download = await estimateFilesResponse(
      new Request(`http://x/api/gas/estimate-files?file=${fileId}`),
      d,
    );
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
    // Повтор не плодит описей
    await estimateFilesResponse(keep(version.id), d);
    expect(store.now().estimateFiles!.length).toBe(1);
  });

  test("бригадир 403, чужая версия 404, не Excel 400: опись не меняется", async () => {
    const store = memory();
    const version = await wizardVersion(store);
    expect((await estimateFilesResponse(keep(version.id), deps(store, "u-foreman-1"))).status).toBe(
      403,
    );
    expect((await estimateFilesResponse(keep("нет-такой"), deps(store, "u-manager"))).status).toBe(
      404,
    );
    expect(
      (
        await estimateFilesResponse(
          keep(version.id, new Uint8Array([1, 2, 3, 4])),
          deps(store, "u-manager"),
        )
      ).status,
    ).toBe(400);
    expect(store.now().estimateFiles?.length ?? 0).toBe(0);
  });

  test("тот же файл уже в папке: версия ссылается на прежнюю опись", () => {
    const base = {
      estimateFiles: [
        {
          id: "esf-old",
          sha256: "c".repeat(64),
          name: "a.xls",
          size: 1,
          uploadedBy: "u",
          uploadedAt: "2026-11-20T00:00:00Z",
          storagePath: null as string | null,
          status: "parsed" as const,
          reason: null,
          versionId: "v-old",
          repeats: 0,
        },
      ],
      estimateVersions: [{ id: "v-new", fileId: null as string | null, parseStatus: "parsed" }],
    };
    const kept = keepSourceFile(base, {
      versionId: "v-new",
      fileId: "esf-new",
      sha256: "c".repeat(64),
      name: "b.xls",
      size: 1,
      storagePath: "cc/x.xls",
      actorId: "u",
      at: "2026-11-23T00:00:00Z",
    })!;
    expect(kept.fileId).toBe("esf-old");
    expect(kept.snapshot.estimateFiles).toHaveLength(1);
    expect(kept.snapshot.estimateFiles![0]!.storagePath).toBe("cc/x.xls");
    expect(kept.snapshot.estimateVersions[0]!.fileId).toBe("esf-old");
    expect(
      keepSourceFile(base, {
        ...base.estimateFiles[0]!,
        versionId: "нет",
        fileId: "x",
        storagePath: "p",
        actorId: "u",
        at: "t",
      }),
    ).toBeNull();
  });
});
