/**
 * Хранилище вкладки для демо (ADR-002, п. 6): переживает перезагрузку, не видно другим вкладкам.
 * Недоступно на сервере и в приватных режимах — тогда демо работает до перезагрузки.
 */

let enabled = false;

/** Включается только адаптером в браузере; серверная копия адаптера ничего не сохраняет */
export function enableStorage() {
  enabled = typeof window !== "undefined";
}

export function readStorage(key: string) {
  if (!enabled) return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string) {
  if (!enabled) return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Хранилище переполнено или запрещено — демо продолжит работать до перезагрузки
  }
}

export function removeStorage(key: string) {
  if (!enabled) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // нечего удалять
  }
}
