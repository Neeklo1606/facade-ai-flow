/**
 * Папка смет на Яндекс Диске (ADR-072): только сервер. REST API Диска, авторизация
 * заголовком `Authorization: OAuth <токен>`. Токен — `YANDEX_DISK_TOKEN`, папка —
 * `YANDEX_DISK_FOLDER` (по умолчанию `disk:/ГАЙКА/Сметы`). Токен не попадает ни в ответ,
 * ни в журнал: наружу уходят только имена файлов и причины словами.
 *
 * Скачивание в два шага, как требует API: запрос ссылки `resources/download`, затем файл
 * по ссылке. Путь проверяется: только внутри настроенной папки.
 */
import {
  MAX_ESTIMATE_BYTES,
  insideFolder,
  type FolderFile,
} from "@/domain/gas-ops/estimate-folder";

export const YANDEX_DISK_API = "https://cloud-api.yandex.net/v1/disk";
export const DEFAULT_FOLDER = "disk:/ГАЙКА/Сметы";

export type YandexEnv = Record<string, string | undefined>;

/** «/ГАЙКА/Сметы», «ГАЙКА/Сметы/», «disk:/ГАЙКА/Сметы» → «disk:/ГАЙКА/Сметы» */
export function normalizeFolder(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return DEFAULT_FOLDER;
  const body = raw
    .replace(/^disk:/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return body ? `disk:/${body}` : DEFAULT_FOLDER;
}

export interface YandexDiskOptions {
  env: YandexEnv;
  fetch?: typeof fetch;
}

export interface YandexDisk {
  configured: boolean;
  folder: string;
  list(): Promise<{ ok: true; files: FolderFile[] } | { ok: false; reason: string }>;
  download(path: string): Promise<{ ok: true; data: ArrayBuffer } | { ok: false; reason: string }>;
}

const field = (value: unknown, key: string): unknown =>
  value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;

/** Причина словами по коду ответа Диска: без тела ответа, в нём бывают части запроса */
function reasonOf(status: number): string {
  if (status === 401 || status === 403) return "Яндекс Диск не принял токен: выпустите новый";
  if (status === 404) return "Папки нет на Яндекс Диске: создайте её или поправьте путь";
  if (status === 429) return "Яндекс Диск просит подождать: повторите через минуту";
  return `Яндекс Диск ответил ${status}`;
}

export function createYandexDisk(options: YandexDiskOptions): YandexDisk {
  const token = options.env["YANDEX_DISK_TOKEN"]?.trim() ?? "";
  const folder = normalizeFolder(options.env["YANDEX_DISK_FOLDER"]);
  const http = options.fetch ?? fetch;
  const auth = { Authorization: `OAuth ${token}`, accept: "application/json" };

  return {
    configured: token !== "",
    folder,
    async list() {
      if (!token) return { ok: false, reason: "Яндекс Диск не подключён: нет токена на сервере" };
      const files: FolderFile[] = [];
      // Страницами по 200: в папке смет их обычно десятки, предел — 1000 файлов
      for (let offset = 0; offset < 1000; offset += 200) {
        const url =
          `${YANDEX_DISK_API}/resources?path=${encodeURIComponent(folder)}&limit=200&offset=${offset}` +
          `&fields=${encodeURIComponent("_embedded.items.name,_embedded.items.path,_embedded.items.type,_embedded.items.size,_embedded.items.modified,_embedded.total")}`;
        let response: Response;
        try {
          response = await http(url, { headers: auth });
        } catch {
          return { ok: false, reason: "Яндекс Диск не ответил: нет связи" };
        }
        if (!response.ok) return { ok: false, reason: reasonOf(response.status) };
        const body = (await response.json().catch(() => null)) as unknown;
        const embedded = field(body, "_embedded");
        const items = field(embedded, "items");
        if (!Array.isArray(items)) break;
        for (const item of items) {
          if (field(item, "type") !== "file") continue;
          const name = field(item, "name");
          const path = field(item, "path");
          if (typeof name !== "string" || typeof path !== "string") continue;
          const size = field(item, "size");
          const modified = field(item, "modified");
          files.push({
            name,
            path,
            size: typeof size === "number" ? size : 0,
            modified: typeof modified === "string" ? modified : "",
          });
        }
        const total = field(embedded, "total");
        if (items.length < 200 || (typeof total === "number" && offset + 200 >= total)) break;
      }
      return { ok: true, files };
    },
    async download(path) {
      if (!token) return { ok: false, reason: "Яндекс Диск не подключён: нет токена на сервере" };
      if (!insideFolder(folder, path)) return { ok: false, reason: "Файл не из папки смет" };
      try {
        const link = await http(
          `${YANDEX_DISK_API}/resources/download?path=${encodeURIComponent(path)}`,
          { headers: auth },
        );
        if (!link.ok) return { ok: false, reason: reasonOf(link.status) };
        const href = field(await link.json().catch(() => null), "href");
        if (typeof href !== "string" || !href.startsWith("https://")) {
          return { ok: false, reason: "Яндекс Диск не дал ссылку на файл" };
        }
        const file = await http(href);
        if (!file.ok) return { ok: false, reason: reasonOf(file.status) };
        const data = await file.arrayBuffer();
        if (data.byteLength > MAX_ESTIMATE_BYTES) return { ok: false, reason: "Файл больше 20 МБ" };
        return { ok: true, data };
      } catch {
        return { ok: false, reason: "Яндекс Диск не ответил: нет связи" };
      }
    },
  };
}
