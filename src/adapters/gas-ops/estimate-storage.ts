/**
 * Хранилище исходных файлов смет на сервере (ADR-077): каталог на томе Docker,
 * `ESTIMATE_FILES_DIR`, по умолчанию `./data/estimate-files`. Имя файла — хеш содержимого:
 * один и тот же файл лежит один раз, имя файла заказчика (в нём адрес) на диск не пишется.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";

export interface EstimateStorage {
  root: string;
  /** Записать байты; путь относительно корня хранилища */
  save(sha256: string, kind: "xls" | "xlsx", bytes: Uint8Array): Promise<string>;
  read(path: string): Promise<Uint8Array | null>;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createEstimateStorage(
  env: Record<string, string | undefined> = process.env,
): EstimateStorage {
  const root = resolve(env["ESTIMATE_FILES_DIR"]?.trim() || "./data/estimate-files");
  const inside = (path: string) => {
    const full = resolve(root, path);
    return full.startsWith(root + sep) ? full : null;
  };
  return {
    root,
    async save(sha256, kind, bytes) {
      if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("bad hash");
      const path = `${sha256.slice(0, 2)}/${sha256}.${kind}`;
      const full = join(root, path);
      await mkdir(join(root, sha256.slice(0, 2)), { recursive: true });
      await writeFile(full, bytes, { flag: "w" });
      return path;
    },
    async read(path) {
      const full = inside(path);
      if (!full) return null;
      try {
        return new Uint8Array(await readFile(full));
      } catch {
        return null;
      }
    },
  };
}
