import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { screenFor } from "./screens";
import { currentScreenKey, record, startExitTracking } from "./telemetry";

/**
 * Открытие экрана — событие сессии (ADR-010). Экран определяется по адресу и параметрам
 * вкладок: вкладка «Ход работ» — отдельный экран, смена фильтра на том же экране — нет.
 */
export function useScreenTelemetry() {
  const location = useRouterState({ select: (s) => s.location });
  const screen = screenFor(location.pathname, location.searchStr);
  useEffect(startExitTracking, []);
  const { key, name } = screen;
  const path = location.pathname;
  useEffect(() => {
    // Сравниваем по ключу экрана: фильтры и выбранная строка не делают экран новым.
    // Заглушки разделов делят один ключ, их различает название
    if (key === currentScreenKey() && key !== "section") return;
    record({ t: "screen", screen: key, name, path });
  }, [key, name, path]);
}
