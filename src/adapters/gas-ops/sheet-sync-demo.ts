/** Заглушка синхронизации с облачной таблицей (ADR-061, 11): ничего не отправляет */
import type { SheetSyncPort } from "@/ports/sheet-sync";

export const sheetSyncDemo: SheetSyncPort = {
  connected: false,
  sync: async () => ({
    ok: false,
    reason:
      "Облачная таблица не подключена: синхронизация появится вместе с сервером (T7). Пока выгрузите Excel.",
  }),
};
