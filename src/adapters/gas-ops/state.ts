/**
 * Состояние газового направления в демонстрации (ADR-043, ADR-047).
 *
 * Своё состояние, отдельное от демо-адаптера ГАЙКИ: у направления другие сущности
 * и другой набор ролей, мешать их в одном снимке нечем. Хранится во вкладке
 * (`localStorage`), поэтому перезагрузка не теряет введённые записи, а кнопка
 * «Сбросить демо-данные» возвращает исходный набор.
 *
 * Исходный набор строится из отчёта контура: публичного «Демо-подрядчика» или личного
 * контура заказчика (ADR-047). У каждого контура свой ключ во вкладке, записи показа
 * на публичном наборе не смешиваются с данными заказчика.
 *
 * Снимок из вкладки поднимается **после** первой отрисовки: на сервере его нет, и если
 * читать его сразу, разметка сервера и клиента разойдутся при гидратации. Поэтому
 * первый рендер идёт на исходном наборе, а `hydrate()` вызывается из оболочки раздела.
 *
 * На сервере модуль общий для всех запросов: активный контур там не хранится, снимок
 * для разметки берётся по контуру запроса (`getServerSnapshotFor`).
 */
import { buildSeedFrom, type GasOpsSeed } from "@/data/mock/gas-ops-seed-core";
import { publicContour, type GasContour } from "@/lib/gas-ops/contour";
import type { GasOpsSnapshot } from "@/ports/gas-ops";
import { DEFAULT_COMPANY_RULE } from "@/domain/gas-ops/work-cost";
import { DEFAULT_REVIEW_SETTINGS } from "@/domain/gas-ops/review-policy";

const KEY = "neeklo-gas-ops-v1";
/** Версия набора: меняется вместе с формой данных, иначе старый снимок во вкладке ломает экран */
const VERSION = 5;

interface Stored {
  version: number;
  snapshot: GasOpsSnapshot;
}

function initial(contour: GasContour): GasOpsSnapshot {
  const seed: GasOpsSeed = buildSeedFrom(contour.report, contour.places);
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
    // Сметы, график и режимы проверки (ADR-053): в исходном наборе пусто, правило ждёт согласования
    estimateVersions: [],
    costRules: [DEFAULT_COMPANY_RULE],
    schedule: null,
    brigadeAvailability: [],
    reviewSettings: DEFAULT_REVIEW_SETTINGS,
    finalChecks: [],
    reportIssues: [],
    crew: seed.crew,
    // Ставок в данных заказчика нет: стоимость труда скрыта до их ввода
    rates: [],
    periods: [],
  };
}

/** Исходные наборы по контуру: они же снимки для сервера и для первого рендера в браузере */
const bases = new Map<string, { report: GasContour["report"]; snapshot: GasOpsSnapshot }>();
/** Контур вкладки. Меняется только в браузере, на сервере всегда публичный */
let active: GasContour = publicContour;
let current: GasOpsSnapshot | null = null;
const listeners = new Set<() => void>();

function baseFor(contour: GasContour): GasOpsSnapshot {
  const cached = bases.get(contour.kind);
  if (cached && cached.report === contour.report) return cached.snapshot;
  const snapshot = initial(contour);
  bases.set(contour.kind, { report: contour.report, snapshot });
  return snapshot;
}

const storageKey = () => `${KEY}:${active.kind}`;

/**
 * Контур вкладки. Оболочка раздела зовёт это при отрисовке до экранов: смена контура
 * (пришёл по личной ссылке или вышел из неё) сбрасывает снимок, и следующий `hydrate`
 * поднимает записи своего контура
 */
export function setContour(contour: GasContour): void {
  if (typeof window === "undefined") return;
  if (active.kind === contour.kind && active.report === contour.report) return;
  active = contour;
  current = null;
}

export function getSnapshot(): GasOpsSnapshot {
  return current ?? baseFor(active);
}

/** Снимок для сервера и первого рендера: исходный набор контура запроса */
export function getServerSnapshotFor(contour: GasContour): GasOpsSnapshot {
  return baseFor(contour);
}

/** Исходный набор контура вкладки: с ним сравнивается текущий, чтобы отметить новые записи */
export function getServerSnapshot(): GasOpsSnapshot {
  return baseFor(active);
}

function notify(): void {
  for (const listener of listeners) listener();
}

function save(snapshot: GasOpsSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const stored: Stored = { version: VERSION, snapshot };
    window.localStorage.setItem(storageKey(), JSON.stringify(stored));
  } catch {
    // Переполнение или запрет записи: состояние живёт только до перезагрузки
  }
}

/** Поднять снимок из вкладки. Вызывается после монтирования раздела и после смены контура */
export function hydrate(): void {
  if (current || typeof window === "undefined") return;
  try {
    // Снимок прежней версии без контура: в нём мог остаться набор заказчика
    window.localStorage.removeItem(KEY);
    const raw = window.localStorage.getItem(storageKey());
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
  current = initial(active);
  save(current);
  notify();
  return current;
}
