/**
 * Облачная таблица заказчика (ADR-061, 11; ADR-063, 1.4). Порт с реализациями: заглушка
 * (вкладка и демо), Google Таблицы через сервисный аккаунт (ключ в переменной окружения,
 * только на сервере) и Яндекс Таблицы вторым адаптером без реализации. Заглушка ничего не
 * отправляет и прямо говорит, что канал не подключён.
 *
 * Отправляет лист недели «ФАКТИЧЕСКИЙ ОТЧЁТ» пакетом изменившихся диапазонов
 * (`changedRanges`, домен). Чаще раза в минуту не отправляет вызывающий (`nextPushAt`).
 */
import type { WeekSheet } from "@/domain/gas-ops/cloud-sheet";

export type SheetProvider = "google" | "yandex";

export type SheetSyncResult =
  { ok: true; url: string; syncedAt: string; ranges: number } | { ok: false; reason: string };

export interface SheetSyncPort {
  /** Подключена ли таблица: неподключённый канал подписан рядом со значением, а не «скоро» */
  connected: boolean;
  provider: SheetProvider | null;
  /** Отправить лист; `prev` — что ушло в прошлый раз, по нему считаются изменения */
  push(input: { sheet: WeekSheet; prev: WeekSheet | null }): Promise<SheetSyncResult>;
}
