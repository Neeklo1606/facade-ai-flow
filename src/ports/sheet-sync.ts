/**
 * Синхронизация недели с облачной таблицей Google или Яндекс (ADR-061, 11; раздел 4.5).
 * Порт с двумя реализациями: заглушка сейчас, настоящая в T7. Заглушка ничего не отправляет
 * и прямо говорит, что канал не подключён.
 */
export type SheetProvider = "google" | "yandex";

export type SheetSyncResult =
  { ok: true; url: string; syncedAt: string } | { ok: false; reason: string };

export interface SheetSyncPort {
  /** Подключена ли таблица: неподключённый канал подписан в меню, а не прячется за «скоро» */
  connected: boolean;
  sync(input: { provider: SheetProvider; weekFrom: string }): Promise<SheetSyncResult>;
}
