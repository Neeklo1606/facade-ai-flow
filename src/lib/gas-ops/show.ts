/**
 * Показ газа заказчику (ADR-061, 13): тур «Показать за 3 минуты» поверх `./tour`. Действия
 * зрителя не обязательны. Если зритель всё же отправил запись в боте или выгрузил файл,
 * это запоминается в цепочке вкладки, и финал показывает его запись (V4, refs/01 и refs/10).
 */
import {
  clearScenario,
  getGuideState,
  setChain,
  useGuide,
  type GuideState,
} from "@/lib/guide/store";
import { clearInbox } from "@/adapters/gas-ops/messenger-demo";
import { track } from "@/lib/site/analytics";
import { getTourState, startTour, useTourState } from "./tour";

/** Рекомендованные значения бота: окно без пересечений у Бригады 1 на сегодня */
export const GAS_SHOW_HINT = {
  objectId: "obj-m200",
  start: "12:00",
  end: "14:30",
  breakMinutes: 0,
} as const;

export function isShowActive(): boolean {
  return getTourState().tourId === "show";
}

export function useShowActive(): boolean {
  return useTourState().tourId === "show";
}

/** Цепочка показа: запись и файл зрителя */
export function useShowChain(): GuideState["chain"] {
  return useGuide().chain;
}

/** Запомнить, что зритель создал за показ. Вне показа ничего не пишется */
export function recordShow(
  part: Pick<GuideState["chain"], "gasEntryId" | "gasEntryNumber" | "gasFile">,
) {
  if (isShowActive()) setChain(part);
}

/** Запись зрителя: та, что он создал в боте в этой вкладке, а не заготовка */
export function isShowEntry(chain: GuideState["chain"], id: string): boolean {
  return !!chain.gasEntryId && chain.gasEntryId === id;
}

/**
 * Начать показ с чистыми данными (раздел 4.8): демо-данные вкладки, входящие и цепочка
 * сбрасываются, затем тур. Роль и экран первого шага ставит сам тур
 */
export async function startShow(reset: () => Promise<unknown>) {
  await reset();
  clearInbox();
  clearScenario();
  startTour("show");
  track("demo_start");
}

export function showChain(): GuideState["chain"] {
  return getGuideState().chain;
}
