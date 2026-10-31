/**
 * Появление «Монохрома» один раз на сессию (ADR-055, раздел 2.3): карточки выезжают и числа
 * считаются от нуля только при первом показе экрана. Повторный заход на тот же экран в той же
 * вкладке показывает всё сразу. Логика отдельно от хука, чтобы её проверял bun test.
 */

/** Ключ хранилища: один объект с показанными экранами */
export const REVEAL_KEY = "neeklo-fieldops-revealed";

/** Длительность счёта чисел, как --dur-count в styles.css */
export const COUNT_MS = 600;

export interface RevealStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Запасная память на случай запрета хранилища: в пределах загрузки страницы */
const memory = new Set<string>();

function readSeen(storage: RevealStorage | null): Set<string> {
  if (!storage) return memory;
  try {
    const raw = storage.getItem(REVEAL_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
  } catch {
    return memory;
  }
}

/**
 * Первый ли это показ ключа в сессии. Отмечает показ сразу, поэтому второй вызов с тем же
 * ключом отвечает «нет».
 */
export function claimFirstReveal(key: string, storage: RevealStorage | null): boolean {
  const seen = readSeen(storage);
  if (seen.has(key) || memory.has(key)) return false;
  seen.add(key);
  memory.add(key);
  if (storage && seen !== memory) {
    try {
      storage.setItem(REVEAL_KEY, JSON.stringify([...seen]));
    } catch {
      // Хранилище переполнено или запрещено: хватит памяти страницы
    }
  }
  return true;
}

/** Значение счётчика через elapsed мс: замедление к концу, ровно target в конце */
export function countUpValue(target: number, elapsed: number, duration = COUNT_MS): number {
  if (elapsed >= duration || duration <= 0) return target;
  const t = Math.max(0, elapsed) / duration;
  const eased = 1 - (1 - t) ** 3;
  return target * eased;
}
