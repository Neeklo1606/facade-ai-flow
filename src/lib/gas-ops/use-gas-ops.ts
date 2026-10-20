/**
 * Доступ экранов газового направления к данным (ADR-043).
 *
 * Экран зовёт только порт и этот хук, адаптер он не импортирует. Когда появится сервер,
 * здесь меняется одна строка — выбор реализации порта по переменной окружения.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { gasOps } from "@/adapters/gas-ops/demo";
import { getServerSnapshot, getSnapshot, hydrate, subscribe } from "@/adapters/gas-ops/state";
import type { GasOpsPort, GasOpsSnapshot } from "@/ports/gas-ops";
import { actorOf, type GasData } from "@/domain/gas-ops/view";
import type { Role } from "@/domain/gas-ops/model";

/** Порт направления: в прототипе это демо-адаптер */
export function useGasOps(): GasOpsPort {
  return gasOps;
}

/**
 * Снимок состояния: экран перерисовывается сам, когда состояние меняется.
 * Первый рендер идёт на исходном наборе — снимок вкладки поднимает `useGasHydration`
 * в оболочке раздела, иначе разметка сервера и клиента разошлись бы при гидратации.
 */
export function useGasSnapshot(): GasOpsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Поднять сохранённый снимок после монтирования. Вызывается один раз, в оболочке раздела */
export function useGasHydration(): void {
  useEffect(hydrate, []);
}

/** Тот же снимок в виде данных для доменных сборок */
export function useGasData(): GasData {
  return useGasSnapshot();
}

export interface GasActor {
  id: string;
  name: string;
  role: Role;
  brigadeId: string | null;
  /** Сотрудник, за которого ведётся запись: бригадир своей бригады */
  employeeId: string | null;
  /** Проверять записи может менеджер, администратор и руководитель — но не бригадир */
  canReview: boolean;
  /** Вводить время может бригадир; менеджер вводит за него, пока нет бота */
  canCreate: boolean;
  /** Суммы и стоимость работ бригадир не видит и не вводит (ТЗ, п. 5.6) */
  canSeeMoney: boolean;
  canManageEstimates: boolean;
  isAdmin: boolean;
}

export function useGasActor(): GasActor {
  const snapshot = useGasSnapshot();
  const user = actorOf(snapshot);
  const role: Role = user?.role ?? "manager";
  const employee = user?.brigadeId
    ? (snapshot.employees.find((e) => e.brigadeId === user.brigadeId && e.isLead) ?? null)
    : null;
  return {
    id: user?.id ?? "u-manager",
    name: user?.name ?? "Менеджер проверки",
    role,
    brigadeId: user?.brigadeId ?? null,
    employeeId: employee?.id ?? null,
    canReview: role === "manager" || role === "admin",
    canCreate: role === "foreman" || role === "manager" || role === "admin",
    canSeeMoney: role !== "foreman",
    canManageEstimates: role === "manager" || role === "admin",
    isAdmin: role === "admin",
  };
}

/** Действие порта с обработкой ошибки правил: текст ошибки показывает экран */
export function useGasAction(): <T>(
  run: (port: GasOpsPort) => Promise<T>,
) => Promise<{ ok: true; value: T } | { ok: false; code: string; message: string }> {
  const port = useGasOps();
  return useCallback(
    async (run) => {
      try {
        return { ok: true, value: await run(port) };
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
        const message =
          error instanceof Error ? error.message : "Действие не выполнено. Повторите.";
        return { ok: false, code, message };
      }
    },
    [port],
  );
}
