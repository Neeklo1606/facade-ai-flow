/**
 * Состояние газового направления в демонстрации (ADR-043).
 *
 * Своё состояние, отдельное от демо-адаптера ГАЙКИ: у направления другие сущности
 * и другой набор ролей, мешать их в одном снимке нечем. Хранится во вкладке
 * (`localStorage`), поэтому перезагрузка не теряет введённые записи, а кнопка
 * «Сбросить демо-данные» возвращает исходный набор.
 *
 * Снимок из вкладки поднимается **после** первой отрисовки: на сервере его нет, и если
 * читать его сразу, разметка сервера и клиента разойдутся при гидратации. Поэтому
 * первый рендер идёт на исходном наборе, а `hydrate()` вызывается из оболочки раздела.
 */
import { buildSeed, type GasOpsSeed } from "@/data/mock/gas-ops-seed";
import type { GasOpsSnapshot } from "@/ports/gas-ops";

const KEY = "neeklo-gas-ops-v1";
/** Версия набора: меняется вместе с формой данных, иначе старый снимок во вкладке ломает экран */
const VERSION = 2;

interface Stored {
  version: number;
  snapshot: GasOpsSnapshot;
}

function initial(): GasOpsSnapshot {
  const seed: GasOpsSeed = buildSeed();
  return {
    today: seed.today,
    week: seed.week,
    groups: seed.groups,
    brigades: seed.brigades,
    employees: seed.employees,
    objects: seed.objects,
    estimates: seed.estimates,
    entries: seed.entries,
    reviews: seed.reviews,
    audit: seed.audit,
    frames: seed.frames,
    assignments: seed.assignments,
    users: seed.users,
    // По умолчанию входим менеджером проверки: его экран — очередь, с него начинается показ
    actorId: "u-manager",
  };
}

/** Исходный набор: он же снимок для сервера и для первого рендера в браузере */
let base: GasOpsSnapshot | null = null;
let current: GasOpsSnapshot | null = null;
const listeners = new Set<() => void>();

function baseSnapshot(): GasOpsSnapshot {
  base ??= initial();
  return base;
}

export function getSnapshot(): GasOpsSnapshot {
  return current ?? baseSnapshot();
}

/** Снимок для сервера и первого рендера: всегда исходный набор */
export function getServerSnapshot(): GasOpsSnapshot {
  return baseSnapshot();
}

function notify(): void {
  for (const listener of listeners) listener();
}

function save(snapshot: GasOpsSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const stored: Stored = { version: VERSION, snapshot };
    window.localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Переполнение или запрет записи: состояние живёт только до перезагрузки
  }
}

/** Поднять снимок из вкладки. Вызывается один раз после монтирования раздела */
export function hydrate(): void {
  if (current || typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Stored;
    if (parsed.version !== VERSION || !parsed.snapshot) return;
    current = parsed.snapshot;
    notify();
  } catch {
    // Приватный режим или испорченный снимок: остаёмся на исходном наборе
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Изменение состояния: новый снимок, сохранение и оповещение экранов */
export function update(change: (snapshot: GasOpsSnapshot) => GasOpsSnapshot): GasOpsSnapshot {
  const next = change(getSnapshot());
  current = next;
  save(next);
  notify();
  return next;
}

export function resetState(): GasOpsSnapshot {
  current = initial();
  save(current);
  notify();
  return current;
}
