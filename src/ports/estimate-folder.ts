/**
 * Папка смет на облачном диске (ADR-072). Две реализации: Яндекс Диск через сервер (токен
 * в переменной окружения `YANDEX_DISK_TOKEN`, только на сервере) и демо-папка вкладки
 * с двумя сметами-образцами. Демо прямо говорит, что диск не подключён.
 */
import type { FolderFile } from "@/domain/gas-ops/estimate-folder";

export type FolderStatus =
  | { connected: true; provider: "yandex-disk"; folder: string }
  | {
      connected: false;
      /** Демо-папка с образцами: можно попробовать путь целиком, но это не диск заказчика */
      demo: boolean;
      reason: string;
    };

export type FolderListing =
  | { ok: true; status: FolderStatus; files: FolderFile[] }
  | { ok: false; status: FolderStatus; reason: string };

export interface EstimateFolderPort {
  list(): Promise<FolderListing>;
  /** Содержимое файла: дальше его читает тот же разбор, что и файл, выбранный руками */
  download(path: string): Promise<{ ok: true; data: ArrayBuffer } | { ok: false; reason: string }>;
}
