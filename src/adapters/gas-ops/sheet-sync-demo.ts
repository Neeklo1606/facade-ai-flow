/** Заглушка облачной таблицы (ADR-061, 11; ADR-063, 1.4): ничего не отправляет */
import type { SheetSyncPort } from "@/ports/sheet-sync";

export const sheetSyncDemo: SheetSyncPort = {
  connected: false,
  provider: null,
  push: async () => ({
    ok: false,
    reason:
      "Облачная таблица не подключена: подключение делается на сервере ключом сервисного аккаунта. Пока выгрузите Excel.",
  }),
};

/** Яндекс Таблицы: второй адаптер, реализации нет (ADR-063, 1.4) */
export const sheetSyncYandex: SheetSyncPort = {
  connected: false,
  provider: "yandex",
  push: async () => ({
    ok: false,
    reason: "Яндекс Таблицы не подключены: адаптер не реализован, работает Google Таблицы.",
  }),
};
