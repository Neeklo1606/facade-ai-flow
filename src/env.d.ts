/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Источник данных (ADR-004): demo — адаптер во вкладке, server — серверные функции */
  readonly VITE_DATA_SOURCE?: "demo" | "server";
  /** Запасной способ задать ключ доступа, когда хостинг умеет только переменные сборки (TASK-A5) */
  readonly VITE_DEMO_ACCESS_KEY?: string;
}
