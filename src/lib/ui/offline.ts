/**
 * Нет сети (ADR-045, 4.17 и V9): настоящее состояние браузера по событиям online/offline.
 * В сборке проверки макетов (VITE_SCREEN_STATES=1) адрес ?offline=1 включает имитацию,
 * и полоса это честно помечает.
 */
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { screenStatesEnabled } from "@/lib/screen-state";

export function useOffline(): { offline: boolean; simulated: boolean } {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const forced = useRouterState({
    select: (s) => String((s.location.search as Record<string, unknown>)["offline"] ?? ""),
  });
  const simulated = screenStatesEnabled && forced === "1";
  return { offline: simulated || !online, simulated };
}
