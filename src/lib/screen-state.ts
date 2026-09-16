import { useRouterState } from "@tanstack/react-router";

export type ScreenState =
  "loading" | "empty" | "filtered" | "partial" | "processing" | "error" | "forbidden" | "normal";

export const screenStates: { id: ScreenState; label: string }[] = [
  { id: "normal", label: "Норма" },
  { id: "loading", label: "Загрузка" },
  { id: "empty", label: "Пусто" },
  { id: "filtered", label: "Пусто по фильтру" },
  { id: "partial", label: "Частичные данные" },
  { id: "processing", label: "Обработка" },
  { id: "error", label: "Ошибка" },
  { id: "forbidden", label: "Нет доступа" },
];

const known = new Set(screenStates.map((item) => item.id));

/** Переключатель состояний включается только в сборке для проверки макетов: VITE_SCREEN_STATES=1. */
export const screenStatesEnabled = import.meta.env["VITE_SCREEN_STATES"] === "1";

/** Принудительное состояние экрана из адреса: ?state=empty. В обычной сборке адрес игнорируется. */
export function useForcedState(): ScreenState | null {
  const raw = useRouterState({
    select: (s) => (s.location.search as Record<string, unknown>)["state"],
  });
  if (!screenStatesEnabled) return null;
  return typeof raw === "string" && known.has(raw as ScreenState) ? (raw as ScreenState) : null;
}

/**
 * Состояние экрана из данных (ADR-002, п. 4): загрузка и ошибка — из запросов, пусто и отфильтровано —
 * из результата. Принудительное состояние из адреса — только в сборке проверки макетов.
 */
export function useScreenState(natural: {
  /** Данные ещё грузятся */
  pending?: boolean;
  /** Запрос завершился ошибкой */
  error?: boolean;
  empty?: boolean;
  filtered?: boolean;
  partial?: boolean;
  processing?: boolean;
}): ScreenState {
  const forced = useForcedState();
  if (forced) return forced;
  if (natural.error) return "error";
  if (natural.pending) return "loading";
  if (natural.empty) return "empty";
  if (natural.filtered) return "filtered";
  if (natural.processing) return "processing";
  if (natural.partial) return "partial";
  return "normal";
}
