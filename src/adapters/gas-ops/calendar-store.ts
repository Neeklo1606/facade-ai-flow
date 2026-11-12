import { advanceCalendar } from "@/domain/gas-ops/pilot";
import { GasStaleError, type GasStore } from "./store";

/**
 * Хранилище с настоящим календарём (ADR-069). В базе «сегодня» и неделя хранятся строкой
 * состояния; без сдвига неделя закрылась бы один раз, и следующую некуда было бы вносить.
 * Каждое чтение сверяет день с часами сервера и, если наступил новый, записывает его.
 * Запись действия получает уже сдвинутый снимок: правила видят тот же день, что и экран.
 */
export function withRealCalendar(inner: GasStore, today: () => string): GasStore {
  return {
    async read() {
      const snapshot = await inner.read();
      const day = today();
      if (advanceCalendar(snapshot, day) === snapshot) return snapshot;
      try {
        return await inner.update((s) => advanceCalendar(s, day), snapshot);
      } catch (error) {
        // День уже сдвинул параллельный запрос: читаем, что он записал
        if (error instanceof GasStaleError) return inner.read();
        throw error;
      }
    },
    update(change, base) {
      return inner.update((s) => change(advanceCalendar(s, today())), base);
    },
  };
}
