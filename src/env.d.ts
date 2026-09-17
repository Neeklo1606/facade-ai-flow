/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Источник данных (ADR-004): demo — адаптер во вкладке, server — серверные функции */
  readonly VITE_DATA_SOURCE?: "demo" | "server";
}
