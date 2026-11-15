import type { Driver } from "@/adapters/db/driver";
import type { GasStore } from "@/adapters/gas-ops/store";

/**
 * Хранилище учёта времени на сервере (ADR-061, 14): PostgreSQL, если задан `DATABASE_URL`,
 * иначе null — серверные функции и выгрузка отвечают «рабочая база не подключена».
 * Драйвер и хранилище грузятся при первом запросе, а не при сборке модуля. Драйвер один
 * на процесс: его же берёт состояние канала бота (src/adapters/gas-ops/messenger-db.ts).
 */
let driver: Promise<Driver | null> | null = null;
let store: Promise<GasStore | null> | null = null;

/** Пояс местного времени сервера: `APP_TIME_ZONE`, по умолчанию Europe/Moscow */
export const appTimeZone = () => process.env["APP_TIME_ZONE"]?.trim() || "Europe/Moscow";

export function gasServerDriver(): Promise<Driver | null> {
  driver ??= (async () => {
    const { driverConfigFromEnv, createDriver } = await import("@/adapters/db");
    const config = driverConfigFromEnv(process.env);
    return config ? createDriver(config) : null;
  })();
  return driver;
}

export function gasServerStore(): Promise<GasStore | null> {
  store ??= (async () => {
    const db = await gasServerDriver();
    if (!db) return null;
    const { createGasDbStore } = await import("@/adapters/gas-ops/db-store");
    const { withRealCalendar } = await import("@/adapters/gas-ops/calendar-store");
    const { localDay } = await import("@/domain/gas-ops/pilot");
    const timeZone = appTimeZone();
    // Календарь по часам сервера (ADR-069): неделя сменяется сама, а не остаётся демо-неделей
    return withRealCalendar(createGasDbStore(db, { timeZone }), () =>
      localDay(new Date(), timeZone),
    );
  })();
  return store;
}
