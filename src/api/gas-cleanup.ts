/**
 * Удаление данных для экранов (ADR-088): смета, объект, очистка рабочих данных.
 * Правила и подсчёты — в домене, здесь хуки и права для показа кнопок.
 */
import { useCallback, useMemo } from "react";
import {
  clearCounts,
  countsPhrase,
  ESTIMATE_BLOCK_TEXT,
  estimateRemovalBlock,
  isEmptyData,
  objectCounts,
  type CleanupCounts,
} from "@/domain/gas-ops/cleanup";
import { isDayLocked } from "@/domain/gas-ops/week";
import { workingContour } from "@/lib/cabinet";
import { useGasAction, useGasActor, useGasSnapshot } from "@/lib/gas-ops/use-gas-ops";

export { countsPhrase, isEmptyData, type CleanupCounts };

export function useGasCleanup() {
  const run = useGasAction();
  return {
    deleteEstimate: useCallback(
      (versionId: string) => run((port) => port.deleteEstimate(versionId)),
      [run],
    ),
    deleteObject: useCallback(
      (objectId: string) => run((port) => port.deleteObject(objectId)),
      [run],
    ),
    clearData: useCallback(() => run((port) => port.clearData()), [run]),
  };
}

/**
 * Кто видит кнопки удаления. Сервер проверяет то же (ADR-012): очистку рабочей базы —
 * только администратор, в демонстрации — и менеджер, он ведёт показ
 */
export function useCleanupRights(): { object: boolean; clear: boolean } {
  const actor = useGasActor();
  const office = actor.role === "manager" || actor.role === "admin";
  return { object: office, clear: workingContour ? actor.isAdmin : office };
}

/** Что уйдёт вместе с объектом и не мешает ли закрытая неделя */
export function useObjectCleanup(objectId: string): {
  counts: CleanupCounts;
  phrase: string;
  locked: boolean;
} {
  const s = useGasSnapshot();
  return useMemo(() => {
    const counts = objectCounts(s, objectId);
    const locked = s.entries.some((e) => e.objectId === objectId && isDayLocked(s.periods, e.day));
    return { counts, phrase: objectPhrase(counts), locked };
  }, [s, objectId]);
}

/** Что уйдёт при очистке рабочих данных */
export function useClearCleanup(): { counts: CleanupCounts; phrase: string; empty: boolean } {
  const s = useGasSnapshot();
  return useMemo(() => {
    const counts = clearCounts(s);
    return { counts, phrase: countsPhrase(counts), empty: isEmptyData(counts) };
  }, [s]);
}

/** Можно ли удалить смету; нет — почему (текст для шторки) */
export function useEstimateRemoval(versionId: string): { ok: boolean; reason: string | null } {
  const s = useGasSnapshot();
  return useMemo(() => {
    const block = estimateRemovalBlock(s, versionId);
    if (!block) return { ok: true, reason: null };
    return {
      ok: false,
      reason: block.kind === "not-found" ? null : ESTIMATE_BLOCK_TEXT[block.kind],
    };
  }, [s, versionId]);
}

/** Что уйдёт вместе с объектом, без самого объекта: «1 смета, 4 записи времени» */
export function objectPhrase(counts: CleanupCounts): string {
  const rest = countsPhrase({ ...counts, objects: 0 });
  return rest === "нет данных" ? "связанных данных нет" : rest;
}
