import { describe, expect, test } from "bun:test";
import {
  folderRows,
  folderSummary,
  insideFolder,
  isEstimateName,
  toFetch,
  type FolderFile,
} from "@/domain/gas-ops/estimate-folder";
import { createYandexDisk, normalizeFolder } from "@/adapters/gas-ops/yandex-disk";
import { estimateFolderResponse } from "@/api/gas-estimate-folder";
import type { GasStore } from "@/adapters/gas-ops/store";

/** Папка смет на Яндекс Диске (ADR-072) */

const file = (name: string, modified = "2026-11-10T09:00:00+03:00", size = 50_000): FolderFile => ({
  name,
  path: `disk:/ГАЙКА/Сметы/${name}`,
  size,
  modified,
});

describe("какой файл смета", () => {
  test("xlsx и xls — да, временный файл Office и картинка — нет", () => {
    expect(isEstimateName("Смета ОБ-101.xlsx")).toBe(true);
    expect(isEstimateName("старая.XLS")).toBe(true);
    expect(isEstimateName("~$Смета ОБ-101.xlsx")).toBe(false);
    expect(isEstimateName("фото.jpg")).toBe(false);
    expect(isEstimateName(".DS_Store")).toBe(false);
  });
});

describe("состояние файлов папки", () => {
  const versions = [
    { fileName: "Смета А.xlsx", version: 1, uploadedAt: "2026-11-09T10:00:00" },
    { fileName: "Смета А.xlsx", version: 2, uploadedAt: "2026-11-11T10:00:00" },
    { fileName: "Смета Б.xlsx", version: 1, uploadedAt: "2026-11-01T10:00:00" },
  ];
  const rows = folderRows(
    [
      file("Смета А.xlsx", "2026-11-10T09:00:00+03:00"),
      file("смета б.xlsx", "2026-11-10T09:00:00+03:00"),
      file("Смета В.xlsx"),
      file("акт.pdf"),
      file("Огромная.xlsx", undefined, 30 * 1024 * 1024),
      file("~$Смета В.xlsx"),
    ],
    versions,
  );
  const byName = new Map(rows.map((r) => [r.file.name, r.state]));

  test("загруженный и не менявшийся: последняя версия по имени", () => {
    expect(byName.get("Смета А.xlsx")).toEqual({ kind: "loaded", version: 2 });
  });
  test("файл на диске новее версии: «изменилась», имя без учёта регистра", () => {
    expect(byName.get("смета б.xlsx")).toEqual({ kind: "changed", version: 1 });
  });
  test("новый файл заберётся, не сметы и большие — нет, временный файл не показывается", () => {
    expect(byName.get("Смета В.xlsx")).toEqual({ kind: "new" });
    expect(byName.get("акт.pdf")?.kind).toBe("skipped");
    expect(byName.get("Огромная.xlsx")).toEqual({ kind: "skipped", reason: "больше 20 МБ" });
    expect(byName.has("~$Смета В.xlsx")).toBe(false);
    expect(toFetch(rows).map((r) => r.file.name)).toEqual(["Смета В.xlsx", "смета б.xlsx"]);
  });
  test("сводка одной фразой", () => {
    expect(folderSummary(rows)).toBe("новых 1, изменились 1, загружено 1, не сметы 2");
    expect(folderSummary([])).toBe("Папка пуста: положите туда файлы смет Excel");
  });
});

describe("путь только внутри папки", () => {
  test("подпапка можно, соседняя папка и «..» нельзя", () => {
    const base = "disk:/ГАЙКА/Сметы";
    expect(insideFolder(base, "disk:/ГАЙКА/Сметы/2026/Смета.xlsx")).toBe(true);
    expect(insideFolder(base, "disk:/ГАЙКА/Сметы/../Пароли.xlsx")).toBe(false);
    expect(insideFolder(base, "disk:/ГАЙКА/СметыСтарые/Смета.xlsx")).toBe(false);
    expect(insideFolder(base, "disk:/ГАЙКА/Сметы/")).toBe(false);
    expect(insideFolder(`${base}/`, "disk:/ГАЙКА/Сметы/а.xlsx")).toBe(true);
  });
  test("папка из окружения в виде диска", () => {
    expect(normalizeFolder(undefined)).toBe("disk:/ГАЙКА/Сметы");
    expect(normalizeFolder("/Сметы/")).toBe("disk:/Сметы");
    expect(normalizeFolder("disk:/Заказчик/Сметы")).toBe("disk:/Заказчик/Сметы");
  });
});

type Call = { url: string; auth: string | null };

function fakeDisk(responses: Record<string, () => Response>) {
  const calls: Call[] = [];
  const http = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get("authorization") });
    const key = Object.keys(responses).find((k) => url.includes(k));
    return key ? responses[key]!() : new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { calls, http };
}

describe("адаптер Яндекс Диска", () => {
  const env = { YANDEX_DISK_TOKEN: "y0_test-token", YANDEX_DISK_FOLDER: "/ГАЙКА/Сметы" };

  test("без токена: не подключён, на диск не ходит", async () => {
    const { calls, http } = fakeDisk({});
    const disk = createYandexDisk({ env: {}, fetch: http });
    expect(disk.configured).toBe(false);
    expect(await disk.list()).toEqual({
      ok: false,
      reason: "Яндекс Диск не подключён: нет токена на сервере",
    });
    expect(calls).toHaveLength(0);
  });

  test("список: только файлы, токен заголовком OAuth", async () => {
    const { calls, http } = fakeDisk({
      "/resources?": () =>
        Response.json({
          _embedded: {
            total: 2,
            items: [
              { type: "dir", name: "Архив", path: "disk:/ГАЙКА/Сметы/Архив" },
              {
                type: "file",
                name: "Смета.xlsx",
                path: "disk:/ГАЙКА/Сметы/Смета.xlsx",
                size: 1234,
                modified: "2026-11-10T09:00:00+00:00",
              },
            ],
          },
        }),
    });
    const listed = await createYandexDisk({ env, fetch: http }).list();
    expect(listed).toEqual({
      ok: true,
      files: [
        {
          name: "Смета.xlsx",
          path: "disk:/ГАЙКА/Сметы/Смета.xlsx",
          size: 1234,
          modified: "2026-11-10T09:00:00+00:00",
        },
      ],
    });
    expect(calls[0]!.auth).toBe("OAuth y0_test-token");
    expect(calls[0]!.url).toContain(encodeURIComponent("disk:/ГАЙКА/Сметы"));
  });

  test("неверный токен — причина словами, без тела ответа Диска", async () => {
    const { http } = fakeDisk({
      "/resources?": () => new Response('{"message":"Unauthorized"}', { status: 401 }),
    });
    expect(await createYandexDisk({ env, fetch: http }).list()).toEqual({
      ok: false,
      reason: "Яндекс Диск не принял токен: выпустите новый",
    });
  });

  test("файл: ссылка, затем содержимое; чужой путь не скачивается", async () => {
    const { calls, http } = fakeDisk({
      "/resources/download": () => Response.json({ href: "https://downloader.disk.yandex.ru/x" }),
      "downloader.disk.yandex.ru": () => new Response(new Uint8Array([0x50, 0x4b, 3, 4])),
    });
    const disk = createYandexDisk({ env, fetch: http });
    const got = await disk.download("disk:/ГАЙКА/Сметы/Смета.xlsx");
    expect(got.ok && new Uint8Array(got.data)[0]).toBe(0x50);
    // Сама ссылка на файл уже подписана: токен туда не уходит
    expect(calls[1]!.auth).toBeNull();
    expect(await disk.download("disk:/Личное/паспорт.xlsx")).toEqual({
      ok: false,
      reason: "Файл не из папки смет",
    });
    expect(calls).toHaveLength(2);
  });
});

describe("сервер: права на папку", () => {
  const env = { YANDEX_DISK_TOKEN: "t" };
  const disk = createYandexDisk({
    env,
    fetch: (async () => Response.json({ _embedded: { items: [] } })) as unknown as typeof fetch,
  });
  const storeWith = (role: string) =>
    ({ read: async () => ({ users: [{ id: "u1", role }] }) }) as unknown as GasStore;
  const get = (deps: Parameters<typeof estimateFolderResponse>[1], query = "") =>
    estimateFolderResponse(new Request(`http://x/api/gas/estimate-folder${query}`), deps);

  test("без токена: «не подключён» любому, без списка", async () => {
    const res = await get({ disk: createYandexDisk({ env: {} }), store: null, userId: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: false,
      status: { connected: false, demo: false },
    });
  });
  test("без базы — 501, без входа — 401, бригадир — 403, менеджер — список", async () => {
    expect((await get({ disk, store: null, userId: "u1" })).status).toBe(501);
    expect((await get({ disk, store: storeWith("manager"), userId: "чужой" })).status).toBe(401);
    expect((await get({ disk, store: storeWith("foreman"), userId: "u1" })).status).toBe(403);
    const ok = await get({ disk, store: storeWith("manager"), userId: "u1" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, files: [], status: { connected: true } });
  });
  test("руководитель получает список; роли других модулей получают отказ", async () => {
    expect((await get({ disk, store: storeWith("director"), userId: "u1" })).status).toBe(200);
    for (const role of ["foreman", "supply", "pto", "prorab"]) {
      expect((await get({ disk, store: storeWith(role), userId: "u1" })).status).toBe(403);
    }
  });
  test("файл не из папки — 400", async () => {
    const res = await get(
      { disk, store: storeWith("admin"), userId: "u1" },
      `?path=${encodeURIComponent("disk:/Личное/а.xlsx")}`,
    );
    expect(res.status).toBe(400);
  });
});
