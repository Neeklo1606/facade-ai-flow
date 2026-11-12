/**
 * Доступ экранов газового направления к данным (ADR-043).
 *
 * Экран зовёт только порт и этот хук, адаптер он не импортирует. Когда появится сервер,
 * здесь меняется одна строка — выбор реализации порта по переменной окружения.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { gasOps } from "@/adapters/gas-ops/demo";
import { gasSupply } from "@/adapters/gas-ops/supply-demo";
import { gasDocs } from "@/adapters/gas-ops/docs-demo";
import { createGasOpsRemote, type GasRemoteResult } from "@/adapters/gas-ops/remote";
import { dataSource } from "@/api/config";
import {
  getServerSnapshotFor,
  getSnapshot,
  hydrate,
  setContour,
  subscribe,
  update,
} from "@/adapters/gas-ops/state";
import { useGasContour } from "@/lib/gas-ops/contour";
import { GAS_OPS_METHODS, type GasOpsPort, type GasOpsSnapshot } from "@/ports/gas-ops";
import type { GasSupplyPort } from "@/ports/gas-supply";
import type { GasDocsPort } from "@/ports/gas-docs";
import { actorOf, type GasData } from "@/domain/gas-ops/view";
import type { Role } from "@/domain/gas-ops/model";

/**
 * Сервер (ADR-061, 14): серверная функция на каждый метод, снимок после действия ложится
 * в то же состояние вкладки, откуда его читают экраны. В демо-сборке ветка вырезана:
 * `dataSource` подставляется константой, серверная функция грузится только в ней
 */
const remote =
  dataSource === "server"
    ? createGasOpsRemote(
        GAS_OPS_METHODS,
        async (method, args) =>
          JSON.parse(
            await (
              await import("@/api/gas-ops-functions")
            ).gasOpsCallFn({
              data: { method, args },
            }),
          ) as GasRemoteResult,
        (snapshot) => update(() => snapshot),
      )
    : null;

/** Порт направления: демо-адаптер вкладки или сервер по `VITE_DATA_SOURCE` */
export function useGasOps(): GasOpsPort {
  return remote ?? gasOps;
}

/** Порт снабжения (ADR-057): то же состояние, свой набор действий */
export function useGasSupplyPort(): GasSupplyPort {
  return gasSupply;
}

/** Порт исполнительной документации (ADR-058): то же состояние, свой набор действий */
export function useGasDocsPort(): GasDocsPort {
  return gasDocs;
}

/**
 * Снимок состояния: экран перерисовывается сам, когда состояние меняется.
 * Первый рендер идёт на исходном наборе — снимок вкладки поднимает `useGasHydration`
 * в оболочке раздела, иначе разметка сервера и клиента разошлись бы при гидратации.
 */
export function useGasSnapshot(): GasOpsSnapshot {
  const contour = useGasContour();
  const server = useCallback(() => getServerSnapshotFor(contour), [contour]);
  return useSyncExternalStore(subscribe, getSnapshot, server);
}

/** Контур вкладки (ADR-047): оболочка раздела ставит его до отрисовки экранов */
export const setGasContour = setContour;

/**
 * Поднять сохранённый снимок после монтирования. Вызывается в оболочке раздела, повторно
 * при смене контура: у публичного и личного контура свои записи во вкладке (ADR-047)
 */
export function useGasHydration(): void {
  const kind = useGasContour().kind;
  useEffect(() => {
    // Сервер: снимок пользователя сессии вместо сохранённого во вкладке
    if (remote) {
      setServerStatus({ state: "loading" });
      void remote.snapshot().then(
        () => setServerStatus({ state: "ready" }),
        (error: unknown) =>
          setServerStatus({
            state: "error",
            message:
              error instanceof Error && error.message
                ? error.message
                : "Сервер учёта времени не ответил.",
          }),
      );
    } else hydrate();
  }, [kind]);
}

/**
 * Связь с сервером учёта времени (ADR-069). Пока снимок пользователя не пришёл, экраны
 * не показывают исходный набор: на рабочем контуре это были бы чужие демо-цифры.
 * Отказ (нет входа, нет роли, база не подключена) показывается причиной, а не пустым экраном.
 * В демо-сборке состояние всегда «готово».
 */
export type GasServerStatus =
  { state: "ready" } | { state: "loading" } | { state: "error"; message: string };

let serverStatus: GasServerStatus = remote ? { state: "loading" } : { state: "ready" };
const statusListeners = new Set<() => void>();

function setServerStatus(next: GasServerStatus) {
  serverStatus = next;
  for (const listener of statusListeners) listener();
}

const READY: GasServerStatus = { state: "ready" };
const LOADING: GasServerStatus = { state: "loading" };

export function useGasServerStatus(): GasServerStatus {
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    () => serverStatus,
    // Разметка сервера: на рабочем контуре загрузка, в демо сразу экран
    () => (remote ? LOADING : READY),
  );
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
