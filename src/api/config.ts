/**
 * Откуда приходят данные (ADR-004).
 * `demo` — демо-адаптер в браузере: состояние вкладки, симулятор ответов, сброс. По умолчанию.
 * `server` — серверные функции поверх адаптера сервера (фикстуры в памяти, в фазе 3 — PostgreSQL).
 */
export type DataSource = "demo" | "server";

// Через точку, а не через скобки: сборка подставляет значение константой и вырезает ветку другого режима
export const dataSource: DataSource =
  import.meta.env.VITE_DATA_SOURCE === "server" ? "server" : "demo";

/** Сотрудник, от имени которого выполняются действия до появления сессии (P4-2) */
export const CURRENT_USER_ID = "e-sokolov";
