import type { GasStore } from "@/adapters/gas-ops/store";

/**
 * Хранилище учёта времени на сервере (ADR-061, 14): PostgreSQL, если задан `DATABASE_URL`,
 * иначе null — серверные функции и выгрузка отвечают «рабочая база не подключена».
 * Драйвер и хранилище грузятся при первом запросе, а не при сборке модуля.
 */
let store: Promise<GasStore | null> | null = null;

export function gasServerStore(): Promise<GasStore | null> {
  store ??= (async () => {
    const { driverConfigFromEnv, createDriver } = await import("@/adapters/db");
    const config = driverConfigFromEnv(process.env);
    if (!config) return null;
    const { createGasDbStore } = await import("@/adapters/gas-ops/db-store");
    const { withRealCalendar } = await import("@/adapters/gas-ops/calendar-store");
    const { localDay } = await import("@/domain/gas-ops/pilot");
    const timeZone = process.env["APP_TIME_ZONE"]?.trim() || "Europe/Moscow";
    // Календарь по часам сервера (ADR-069): неделя сменяется сама, а не остаётся демо-неделей
    return withRealCalendar(createGasDbStore(createDriver(config), { timeZone }), () =>
      localDay(new Date(), timeZone),
    );
  })();
  return store;
}
