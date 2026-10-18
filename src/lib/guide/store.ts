/**
 * Состояние проводки вкладки (ADR-010): выбрана ли роль, какой сценарий идёт, что сделано.
 * Хранится в sessionStorage: новая вкладка — новый выбор роли, как и новое состояние демо (ADR-004).
 */
import { useSyncExternalStore } from "react";
import { record } from "./telemetry";
import { scenarioById, type GuideStep } from "./scenarios";

export const ROLE_CHOSEN_KEY = "neeklo-fieldops-role-chosen";
const GUIDE_KEY = "neeklo-fieldops-guide";

export interface GuideState {
  scenarioId: string | null;
  stepIndex: number;
  status: Record<string, "done" | "skipped">;
  collapsed: boolean;
  closed: boolean;
  /** Пройденные сценарии канона: по ним показывается финал (ADR-038) */
  finished: string[];
  /**
   * Цепочка данных показа: отчёт из сценария 1 идёт в «Проверку» сценария 2, заявка
   * из сценария 3 — снабжению. Хранится во вкладке вместе с данными демонстрации.
   */
  chain: { reportId?: string; requestId?: string };
}

const initial: GuideState = {
  scenarioId: null,
  stepIndex: 0,
  status: {},
  collapsed: false,
  closed: false,
  finished: [],
  chain: {},
};

let state: GuideState = initial;
let roleChosen = false;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    roleChosen = window.sessionStorage.getItem(ROLE_CHOSEN_KEY) === "1";
    const raw = window.sessionStorage.getItem(GUIDE_KEY);
    if (raw) state = { ...initial, ...(JSON.parse(raw) as Partial<GuideState>) };
  } catch {
    // Хранилище недоступно: проводка начнётся заново после перезагрузки
  }
}

function commit(next: GuideState) {
  state = next;
  try {
    window.sessionStorage.setItem(GUIDE_KEY, JSON.stringify(state));
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

/** Состояние проводки. До монтирования в браузере — начальное: SSR не знает о вкладке */
export function useGuide() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  );
}

export function useRoleChosen(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => roleChosen,
    () => null,
  );
}

export function markRoleChosen() {
  load();
  roleChosen = true;
  try {
    window.sessionStorage.setItem(ROLE_CHOSEN_KEY, "1");
  } catch {
    // см. load()
  }
  for (const listener of listeners) listener();
}

export function startScenario(scenarioId: string) {
  load();
  // Цепочка и пройденные сценарии переживают переход к следующему сценарию показа
  commit({ ...initial, scenarioId, finished: state.finished, chain: state.chain });
}

/** Отметить сценарий пройденным: финал показа знает, что осталось */
export function finishScenario(scenarioId: string) {
  load();
  if (state.finished.includes(scenarioId)) return;
  commit({ ...state, finished: [...state.finished, scenarioId] });
}

/** Запомнить звено цепочки: что создано в этой вкладке и где его искать дальше */
export function setChain(part: GuideState["chain"]) {
  load();
  commit({ ...state, chain: { ...state.chain, ...part } });
}

/** Начать показ с экрана входа: роль не выбрана, шаги и цепочка пусты */
export function restartShow() {
  load();
  roleChosen = false;
  try {
    window.sessionStorage.removeItem(ROLE_CHOSEN_KEY);
  } catch {
    // см. load()
  }
  commit({ ...initial });
}

export function currentStep(from: GuideState = state): GuideStep | null {
  const scenario = scenarioById(from.scenarioId);
  return scenario?.steps[from.stepIndex] ?? null;
}

/** Шаг выполнен по факту действия. Засчитывается только текущий шаг */
export function completeStep(stepId: string) {
  const step = currentStep();
  if (!step || step.id !== stepId || state.status[stepId]) return;
  record({ t: "step", scenario: state.scenarioId ?? "", step: stepId, status: "done" });
  commit({ ...state, status: { ...state.status, [stepId]: "done" } });
}

function advance(status: GuideState["status"]) {
  const scenario = scenarioById(state.scenarioId);
  if (!scenario) return;
  commit({ ...state, status, stepIndex: Math.min(state.stepIndex + 1, scenario.steps.length) });
}

/** «Дальше»: только после выполнения шага */
export function nextStep() {
  const step = currentStep();
  if (!step || state.status[step.id] !== "done") return;
  advance(state.status);
}

/** «Пропустить»: к следующему шагу с отметкой «пропущен» */
export function skipStep() {
  const step = currentStep();
  if (!step) return;
  record({ t: "step", scenario: state.scenarioId ?? "", step: step.id, status: "skipped" });
  advance({ ...state.status, [step.id]: "skipped" });
}

export function setCollapsed(collapsed: boolean) {
  commit({ ...state, collapsed });
}

export function closeGuide() {
  commit({ ...state, closed: true });
}

export function reopenGuide() {
  commit({ ...state, closed: false, collapsed: false });
}

/** Сброс показа (ADR-038): шаги и цепочка начинаются заново, сценарий остаётся выбранным */
export function resetGuideProgress() {
  load();
  const first = state.scenarioId?.startsWith("canon-") ? "canon-shift" : state.scenarioId;
  commit({ ...initial, scenarioId: first });
}

/** Состояние показа вне React: обработчики телеметрии читают его в момент события */
export function getGuideState(): GuideState {
  load();
  return state;
}

/**
 * Канон показа (ADR-038): действие засчитывает ближайший подходящий шаг, и показ идёт сам —
 * без «Далее» после каждого шага. Шаги до него, если их сделали раньше, тоже засчитываются.
 */
export function completeThrough(index: number) {
  const scenario = scenarioById(state.scenarioId);
  if (!scenario || index < state.stepIndex) return;
  const status = { ...state.status };
  for (let i = state.stepIndex; i <= index; i++) {
    const step = scenario.steps[i];
    if (!step || status[step.id]) continue;
    status[step.id] = "done";
    record({ t: "step", scenario: state.scenarioId ?? "", step: step.id, status: "done" });
  }
  commit({ ...state, status, stepIndex: Math.min(index + 1, scenario.steps.length) });
}

/*
 * Выбор на экране входа (D3): пока плитка или роль ведут на свой экран, корень `/` не должен
 * перенаправлять на рабочий экран роли. Переменная модуля, а не состояние компонента:
 * при смене персоны оболочка перемонтируется, и состояние компонента терялось бы.
 */
let entering = false;
export const setEntering = (value: boolean) => {
  entering = value;
};
export const isEntering = () => entering;
