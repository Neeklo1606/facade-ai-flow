import { useEffect, useState } from "react";
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

/** Принудительное состояние экрана из адреса: ?state=empty. Нужен для демонстрации и проверки макетов. */
export function useForcedState(): ScreenState | null {
  const raw = useRouterState({
    select: (s) => (s.location.search as Record<string, unknown>)["state"],
  });
  return typeof raw === "string" && known.has(raw as ScreenState) ? (raw as ScreenState) : null;
}

/**
 * Имитация ответа API: первые ~350 мс экран показывает скелетон.
 * Когда слой данных заменят запросами, сюда придёт isLoading из запроса.
 */
export function useSimulatedLoading(ms = 350) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return loading;
}

/** Итоговое состояние экрана: принудительное из адреса или вычисленное по данным. */
export function useScreenState(natural: {
  empty?: boolean;
  filtered?: boolean;
  partial?: boolean;
  processing?: boolean;
}): ScreenState {
  const forced = useForcedState();
  const loading = useSimulatedLoading();
  if (forced) return forced;
  if (loading) return "loading";
  if (natural.empty) return "empty";
  if (natural.filtered) return "filtered";
  if (natural.processing) return "processing";
  if (natural.partial) return "partial";
  return "normal";
}
