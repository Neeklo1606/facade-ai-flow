/**
 * Показ газа «gas-week» (ADR-044, F3) поверх общего механизма проводки `src/lib/guide`.
 * Второй механизм не заводится: здесь только события экранов газа и адреса шагов.
 */
import {
  clearScenario,
  completeThrough,
  getGuideState,
  setChain,
  startScenario,
  useGuide,
  type GuideState,
} from "@/lib/guide/store";
import { gasWeek, type GuideStep } from "@/lib/guide/scenarios";
import { track } from "@/lib/site/analytics";

export const GAS_SHOW_ID = gasWeek.id;

/** Рекомендованные значения шага 1: окно без пересечений у Бригады 1 на сегодня */
export const GAS_SHOW_HINT = {
  objectId: "obj-m200",
  start: "12:00",
  end: "14:30",
  breakMinutes: 0,
} as const;

export type GasShowAction =
  "gasEntrySummary" | "gasEntrySubmitted" | "gasEntryConfirmed" | "gasReportSeen" | "gasExport";

export function startGasShow() {
  startScenario(GAS_SHOW_ID);
  track("demo_start");
}

export function resetGasShow() {
  if (getGuideState().scenarioId === GAS_SHOW_ID) clearScenario();
}

export function isGasShow(state: GuideState = getGuideState()): boolean {
  return state.scenarioId === GAS_SHOW_ID;
}

/**
 * Действие экрана засчитывает шаг показа, если показ идёт. Шаги до него, сделанные раньше,
 * тоже засчитываются: зритель мог нажать быстрее, чем прочитал полосу.
 */
export function gasShowEvent(action: GasShowAction, chain?: GuideState["chain"]) {
  const state = getGuideState();
  if (!isGasShow(state)) return;
  if (chain) setChain(chain);
  const index = gasWeek.steps.findIndex((step) => step.doneOn.action?.includes(action));
  if (index < 0) return;
  const before = state.stepIndex;
  completeThrough(index);
  // Аналитика сайта (01_SPEC 11.2): номер шага с единицы, финал отдельным событием
  if (index >= before) track("demo_step", { step: index + 1 });
  if (index === gasWeek.steps.length - 1 && before <= index) track("demo_finish");
}

/**
 * Подтверждённая запись засчитывает шаг показа, только если это запись зрителя: та, что он
 * создал в боте в этой вкладке (V4, refs/01 и refs/10). Подтверждение заготовки шаг
 * не засчитывает и цепочку не переписывает, иначе финал показывал чужую запись.
 */
export function isShowEntry(chain: GuideState["chain"], id: string): boolean {
  return !!chain.gasEntryId && chain.gasEntryId === id;
}

/** Решение по записи в проверке: засчитать шаг показа, если подтверждена запись зрителя */
export function gasShowConfirmed(id: string) {
  const state = getGuideState();
  if (!isGasShow(state) || !isShowEntry(state.chain, id)) return;
  gasShowEvent("gasEntryConfirmed");
}

/** Адрес шага: запись и файл берутся из цепочки вкладки */
export function gasStepPath(step: GuideStep, chain: GuideState["chain"]): string {
  switch (step.id) {
    case "gas-enter":
    case "gas-send":
      return "/gas/foreman";
    case "gas-confirm":
      return chain.gasEntryId ? `/gas/moderation?open=${chain.gasEntryId}` : "/gas/moderation";
    case "gas-report":
    case "gas-export":
      return chain.gasEntryId ? `/gas/reports?highlight=${chain.gasEntryId}` : "/gas/reports";
    default:
      return "/gas/finish";
  }
}

export function useGasShow(): {
  active: boolean;
  state: GuideState;
  step: GuideStep | null;
  index: number;
  total: number;
} {
  const state = useGuide();
  const active = state.scenarioId === GAS_SHOW_ID;
  const step = active ? (gasWeek.steps[state.stepIndex] ?? null) : null;
  return { active, state, step, index: state.stepIndex, total: gasWeek.steps.length };
}
