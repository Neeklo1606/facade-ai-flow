/**
 * Туры учёта времени (ADR-061, 13; раздел 4.8 документа табеля) вместо полосы показа.
 * Подсказка у элемента `data-tour`, «Шаг N из M», «Назад», «Далее», ×. Действия зрителя
 * не обязательны: «Далее» сам переключает роль и экран. Сам по себе тур никуда не ведёт
 * (F1): переход на экран шага идёт только по нажатию человека, счётчик `request`. Состояние
 * тура живёт во вкладке (sessionStorage), отметка «тур роли пройден» — в браузере (localStorage).
 */
import { useSyncExternalStore } from "react";
import type { Role } from "@/domain/gas-ops/model";

export type TourId = "foreman" | "manager" | "director" | "show";

export interface TourStep {
  id: string;
  /** Чьими глазами шаг: тур сам переключает роль */
  role: Role;
  path: string;
  /** Элемент `data-tour`; null — подсказка по центру экрана */
  target: string | null;
  title: string;
  text: string;
}

export interface Tour {
  id: TourId;
  title: string;
  steps: TourStep[];
}

const MANAGER: TourStep[] = [
  {
    id: "m-queue",
    role: "manager",
    path: "/gas/moderation",
    target: "review-queue",
    title: "Проверка",
    text: "Сюда приходят записи бригадиров. Сверху записи с замечаниями, ниже без замечаний.",
  },
  {
    id: "m-clean",
    role: "manager",
    path: "/gas/moderation",
    target: "review-accept-clean",
    title: "Принять без замечаний",
    text: "Записи, где правила ничего не нашли, принимаются одним нажатием. Отменить можно 6 секунд.",
  },
  {
    id: "m-confirm",
    role: "manager",
    path: "/gas/moderation",
    target: "review-confirm",
    title: "Решение по записи",
    text: "Откройте запись: что проверить, откуда сумма. Принять, исправить с причиной или вернуть с вопросом.",
  },
  {
    id: "m-tabs",
    role: "manager",
    path: "/gas/moderation",
    target: "review-tabs",
    title: "Новые, уточнения, принятые",
    text: "Переключатель над очередью: ответы бригадиров на вопросы и уже принятые записи. Все записи недели в «Журнале», он в «Ещё».",
  },
];

const DIRECTOR: TourStep[] = [
  {
    id: "d-week",
    role: "director",
    path: "/gas/week",
    target: "week-counters",
    title: "Неделя",
    text: "Сколько записей получено, проверено и что ещё мешает. Неизвестное не считается нулём.",
  },
  {
    id: "d-close",
    role: "director",
    path: "/gas/week",
    target: "week-close",
    title: "Закрыть неделю",
    text: "Кнопка показывает число причин. Закрытие фиксирует версию недели и её файл.",
  },
  {
    id: "d-reasons",
    role: "director",
    path: "/gas/week",
    target: "week-reasons",
    title: "Что мешает закрыть",
    text: "Каждая причина со ссылкой на записи. То, что согласовано, принимается как есть с причиной.",
  },
  {
    id: "d-export",
    role: "director",
    path: "/gas/week",
    target: "week-actions",
    title: "Файл недели",
    text: "Черновик Excel готов в любой момент, утверждённый файл появляется при закрытии недели. Табель в «Ещё».",
  },
];

const FOREMAN: TourStep[] = [
  {
    id: "f-today",
    role: "foreman",
    path: "/gas/brigade",
    target: "today-done",
    title: "Сегодня",
    text: "Что бригада сдала сегодня и какие объекты ещё ждут записи по графику.",
  },
  {
    id: "f-add",
    role: "foreman",
    path: "/gas/brigade",
    target: "today-add",
    title: "Добавить время",
    text: "Объект, состав, начало, окончание и перерыв. Минуты система считает сама.",
  },
  {
    id: "f-entries",
    role: "foreman",
    path: "/gas/brigade",
    target: "today-entries",
    title: "Мои записи",
    text: "Статус каждой записи. Вопрос менеджера приходит в «Уточнения».",
  },
];

/** Показ заказчику за 3 минуты: менеджер, бригадир, руководитель и итог */
const SHOW: TourStep[] = [
  MANAGER[0]!,
  MANAGER[1]!,
  MANAGER[2]!,
  {
    id: "s-bot",
    role: "foreman",
    path: "/gas/foreman",
    target: "bot",
    title: "Бригадир в MAX",
    text: "Тот же ввод времени диалогом: кнопками или голосом. В демо канал MAX не подключён.",
  },
  FOREMAN[1]!,
  // Табель в показе остаётся: показ сквозной, тур роли — только домашний экран (ADR-064, 2.5)
  {
    id: "d-tabel",
    role: "director",
    path: "/gas/tabel",
    target: "tabel-toolbar",
    title: "Табель",
    text: "Неделя в формате заказчика или по людям. Ячейки выделяются и копируются в Excel.",
  },
  {
    id: "d-tabel-export",
    role: "director",
    path: "/gas/tabel",
    target: "export",
    title: "Выгрузка",
    text: "Утверждённый файл или черновик в структуре отчёта заказчика.",
  },
  DIRECTOR[1]!,
  {
    id: "s-finish",
    role: "director",
    path: "/gas/finish",
    target: null,
    title: "Итог",
    text: "Так неделя проходит от бригадира до файла заказчика. Ниже: что дальше.",
  },
];

export const TOURS: Record<TourId, Tour> = {
  foreman: { id: "foreman", title: "Тур бригадира", steps: FOREMAN },
  manager: { id: "manager", title: "Тур менеджера", steps: MANAGER },
  director: { id: "director", title: "Тур руководителя", steps: DIRECTOR },
  show: { id: "show", title: "Показ за 3 минуты", steps: SHOW },
};

/** Тур роли: администратор смотрит тур менеджера, полевые роли — тур бригадира */
export function tourOfRole(role: Role): TourId | null {
  if (role === "foreman") return "foreman";
  if (role === "manager" || role === "admin") return "manager";
  if (role === "director") return "director";
  return null;
}

/* ---------------------------------------------------------------- Состояние */

export interface TourState {
  tourId: TourId | null;
  index: number;
  /**
   * Номер нажатия человека («Далее», «Назад», «Продолжить тур», запуск кнопкой): только по
   * новому номеру тур переводит на роль и экран шага. Не хранится: после перезагрузки тур
   * на чужом экране стоит на паузе, а не уводит человека
   */
  request: number;
}

const STATE_KEY = "gaika-tour";
export const TOUR_SEEN_KEY = "gaika-tour-seen";
const initial: TourState = { tourId: null, index: 0, request: 0 };

let state: TourState = initial;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(STATE_KEY);
    if (raw) state = { ...initial, ...(JSON.parse(raw) as Partial<TourState>), request: 0 };
  } catch {
    // Хранилище недоступно: тур начнётся заново после перезагрузки
  }
}

function commit(next: TourState) {
  state = next;
  try {
    const { request: _request, ...stored } = next;
    window.sessionStorage.setItem(STATE_KEY, JSON.stringify(stored));
  } catch {
    // см. load()
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTourState(): TourState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  );
}

export function getTourState(): TourState {
  load();
  return state;
}

function seenList(): TourId[] {
  try {
    return JSON.parse(window.localStorage.getItem(TOUR_SEEN_KEY) ?? "[]") as TourId[];
  } catch {
    return [];
  }
}

export function tourSeen(id: TourId): boolean {
  return seenList().includes(id);
}

function markSeen(id: TourId) {
  try {
    const list = seenList();
    if (!list.includes(id))
      window.localStorage.setItem(TOUR_SEEN_KEY, JSON.stringify([...list, id]));
  } catch {
    // Без хранилища тур покажется при следующем входе снова
  }
}

/**
 * Начать тур. Кнопка («Пройти тур», «Показать за 3 минуты») ведёт на первый шаг; автостарт
 * первого входа (`go: false`) идёт только на месте первого шага и никуда не переводит
 */
export function startTour(id: TourId, options?: { go?: boolean }) {
  load();
  commit({
    tourId: id,
    index: 0,
    request: options?.go === false ? state.request : state.request + 1,
  });
}

/** «Далее», «Назад», стрелки: шаг и переход на его экран по нажатию человека */
export function goToStep(index: number) {
  load();
  if (!state.tourId) return;
  const total = TOURS[state.tourId].steps.length;
  commit({
    ...state,
    index: Math.max(0, Math.min(total - 1, index)),
    request: state.request + 1,
  });
}

/** «Продолжить тур» с паузы: вернуться на роль и экран текущего шага */
export function resumeTour() {
  load();
  if (!state.tourId) return;
  commit({ ...state, request: state.request + 1 });
}

/** Закрыть тур: × или «Готово» на последнем шаге. Тур роли больше сам не открывается */
export function closeTour() {
  load();
  if (state.tourId) markSeen(state.tourId);
  // Показ прошёл по всем ролям: туры ролей после него сами не открываются
  if (state.tourId === "show")
    for (const id of ["foreman", "manager", "director"] as const) markSeen(id);
  commit(initial);
}
