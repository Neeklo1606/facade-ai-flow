/**
 * Папка смет на Яндекс Диске через сервер (ADR-072). Список и файл получают только те, кто
 * загружает сметы (`addEstimateVersion`): менеджер и администратор. Права проверяются здесь,
 * а не скрытием кнопки (ADR-012). Без базы входа нет — без неё папка не отдаётся никому.
 */
import type { YandexDisk } from "@/adapters/gas-ops/yandex-disk";
import type { GasStore } from "@/adapters/gas-ops/store";
import type { FolderListing, FolderStatus } from "@/ports/estimate-folder";
import { GAS_METHOD_ROLES } from "./gas-ops-server";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export interface FolderDeps {
  disk: YandexDisk;
  store: GasStore | null;
  userId: string | null;
}

/** Кто вправе: роли метода загрузки смет */
async function allowed(deps: FolderDeps): Promise<{ ok: true } | { ok: false; res: Response }> {
  if (!deps.store) {
    return {
      ok: false,
      res: json(501, { reason: "Рабочая база не подключена: папку смет некому открыть" }),
    };
  }
  const snapshot = await deps.store.read();
  const user = snapshot.users.find((u) => u.id === deps.userId);
  if (!user) return { ok: false, res: json(401, { reason: "Войдите, чтобы продолжить" }) };
  if (!GAS_METHOD_ROLES.addEstimateVersion.includes(user.role)) {
    return { ok: false, res: json(403, { reason: "Сметы загружают менеджер и администратор" }) };
  }
  return { ok: true };
}

export async function estimateFolderResponse(
  request: Request,
  deps: FolderDeps,
): Promise<Response> {
  if (!deps.disk.configured) {
    const reason = "Яндекс Диск не подключён: нет токена на сервере";
    const listing: FolderListing = {
      ok: false,
      status: { connected: false, demo: false, reason },
      reason,
    };
    return json(200, listing);
  }
  const status: FolderStatus = {
    connected: true,
    provider: "yandex-disk",
    folder: deps.disk.folder,
  };
  const access = await allowed(deps);
  if (!access.ok) return access.res;

  const path = new URL(request.url).searchParams.get("path");
  if (path) {
    const file = await deps.disk.download(path);
    if (!file.ok) return json(file.reason === "Файл не из папки смет" ? 400 : 502, file);
    return new Response(file.data, {
      status: 200,
      headers: { "content-type": "application/octet-stream", "cache-control": "no-store" },
    });
  }
  const listed = await deps.disk.list();
  const listing: FolderListing = listed.ok
    ? { ok: true, status, files: listed.files }
    : { ok: false, status, reason: listed.reason };
  return json(200, listing);
}

/** Вход маршрута: диск из окружения, хранилище и сессия сервера */
export async function estimateFolderRequest(request: Request): Promise<Response> {
  const [{ createYandexDisk }, { gasServerStore }, { sessionActorId }] = await Promise.all([
    import("@/adapters/gas-ops/yandex-disk"),
    import("./gas-server-store"),
    import("./session"),
  ]);
  return estimateFolderResponse(request, {
    disk: createYandexDisk({ env: process.env }),
    store: await gasServerStore(),
    userId: await sessionActorId(),
  });
}
