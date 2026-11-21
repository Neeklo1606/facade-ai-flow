/**
 * Вид «Стекло» оболочки сервиса (ADR-079): матовые панели над тёплой сценой. Включён по
 * умолчанию, «Тепло» остаётся вторым видом в профиле. Выбор живёт в браузере, атрибут
 * `data-glass` на <html> ставит GasShell, поэтому окна и шторки в порталах тоже его видят.
 */
import { useSyncExternalStore } from "react";

export type GasLook = "glass" | "warm";

export const GAS_LOOK_KEY = "gaika-gas-look";
export const gasLooks: readonly GasLook[] = ["glass", "warm"];
export const gasLookLabels: Record<GasLook, string> = { glass: "Стекло", warm: "Тепло" };

const listeners = new Set<() => void>();

function read(): GasLook {
  try {
    return window.localStorage.getItem(GAS_LOOK_KEY) === "warm" ? "warm" : "glass";
  } catch {
    // Приватный режим: вид по умолчанию
    return "glass";
  }
}

export function setGasLook(look: GasLook) {
  try {
    window.localStorage.setItem(GAS_LOOK_KEY, look);
  } catch {
    // Приватный режим: вид держится до перезагрузки через атрибут
  }
  applyGasLook(look);
  for (const listener of listeners) listener();
}

/** Атрибут на <html>: стили «Стекла» в src/styles/gas-glass.css */
export function applyGasLook(look: GasLook | null) {
  const root = document.documentElement;
  if (look === "glass") root.dataset["glass"] = "";
  else delete root.dataset["glass"];
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === GAS_LOOK_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Текущий вид. Сервер рисует «Стекло»: оно же вид по умолчанию */
export function useGasLook(): GasLook {
  return useSyncExternalStore(subscribe, read, () => "glass");
}
