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
export const DEFAULT_USER_ID = "e-sokolov";

/**
 * Персона демонстрации: сотрудники, за которых можно работать без сессий и прав (ADR-008).
 * Пять ролей экрана выбора (ADR-010): руководитель проекта, снабжение, ПТО, прораб, директор.
 */
export const DEMO_PERSONAS = [
  "e-sokolov",
  "e-dorohov",
  "e-volkova",
  "e-gareev",
  "e-belyaev",
] as const;

const PERSONA_KEY = "neeklo-fieldops-persona";

function restorePersona() {
  if (typeof window === "undefined") return DEFAULT_USER_ID;
  try {
    const saved = window.sessionStorage.getItem(PERSONA_KEY);
    return saved && (DEMO_PERSONAS as readonly string[]).includes(saved) ? saved : DEFAULT_USER_ID;
  } catch {
    return DEFAULT_USER_ID;
  }
}

let personaId = restorePersona();

/**
 * Сотрудник, от имени которого пишутся действия. В демо-режиме это выбранная персона:
 * приёмку отчёта прорабом подписывает прораб. В рабочем режиме актор берётся на сервере
 * (`serverActor`) и остаётся сотрудником по умолчанию, пока нет сессий — это блок B.
 */
export const currentUserId = () => personaId;

export function setCurrentUserId(id: string) {
  personaId = (DEMO_PERSONAS as readonly string[]).includes(id) ? id : DEFAULT_USER_ID;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PERSONA_KEY, personaId);
  } catch {
    // Приватный режим браузера: персона проживёт до перезагрузки
  }
}
