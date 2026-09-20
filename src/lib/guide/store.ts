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
}

const initial: GuideState = {
  scenarioId: null,
  stepIndex: 0,
  status: {},
  collapsed: false,
  closed: false,
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
  commit({ ...initial, scenarioId });
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
