/**
 * Доля выполнения раздела и начисление (ADR-078): слой данных экранов «Объекты», «Проверка»
 * и формы бригадира. Правила — в домене (`section-accrual.ts`), состояние — за портом.
 */
import { useCallback, useMemo } from "react";
import { useGasAction, useGasOps, useGasSnapshot } from "@/lib/gas-ops/use-gas-ops";
import {
  FULL_BP,
  accruedRub,
  assignedSections,
  confirmedPersonMinutes,
  currentBp,
  fmtShare,
  parsePercent,
  planAccrual,
  sectionLabel,
  sectionLedger,
  sectionWorkRub,
  stepRub,
  suggestBp,
  type AccrualDecision,
  type AccrualMode,
  type SectionAssignment,
  type SectionLedger,
} from "@/domain/gas-ops/section-accrual";
import type { TimeEntry } from "@/domain/gas-ops/model";
import { objectPath, type PathStep } from "@/domain/gas-ops/estimate-flow";
import type { AssignSectionInput } from "@/ports/gas-ops";

export {
  ACCRUAL_MODE_LABEL,
  FULL_BP,
  PROGRESS_KIND_LABEL,
  fmtShare,
  parsePercent,
  sectionLabel,
} from "@/domain/gas-ops/section-accrual";
export type {
  AccrualDecision,
  AccrualMode,
  EntryAccrual,
  SectionAssignment,
  SectionLedger,
  SectionProgress,
} from "@/domain/gas-ops/section-accrual";

/** Разделы объекта с деньгами и бригадами: карточка объекта */
export function useObjectSections(objectId: string | null): SectionLedger[] {
  const s = useGasSnapshot();
  return useMemo(() => {
    if (!s || !objectId) return [];
    return sectionLedger({
      objectId,
      sections: s.objectSections ?? [],
      entries: s.entries,
      progress: s.sectionProgress ?? [],
      assignments: s.sectionAssignments ?? [],
    });
  }, [s, objectId]);
}

/** Назначения раздела: бригада и период */
export function useSectionAssignments(objectId: string | null): SectionAssignment[] {
  const s = useGasSnapshot();
  return useMemo(
    () => (s?.sectionAssignments ?? []).filter((a) => a.objectId === objectId),
    [s, objectId],
  );
}

/** Разделы, которые бригадир может выбрать на день и объекте: без сумм */
export function useBrigadeSections(
  brigadeId: string | null,
  day: string,
  objectId: string | null,
): { key: string; title: string }[] {
  const s = useGasSnapshot();
  return useMemo(() => {
    if (!s || !brigadeId || !objectId) return [];
    const seen = new Set<string>();
    return assignedSections(s.sectionAssignments ?? [], brigadeId, day, objectId)
      .filter((a) => (seen.has(a.sectionKey) ? false : (seen.add(a.sectionKey), true)))
      .map((a) => ({ key: a.sectionKey, title: a.title }));
  }, [s, brigadeId, day, objectId]);
}

export interface AccrualPreview {
  sectionKey: string;
  sectionTitle: string;
  workRub: number | null;
  accruedRub: number;
  remainingRub: number | null;
  /** Доля раздела до подтверждения */
  fromBp: number;
  /** Предложение системы; null — норматива нет */
  suggestedBp: number | null;
  basis: string;
  /** Бригадир ответил «закончены» */
  foremanDone: boolean | null;
  /** Сумма при выбранной доле: считается сразу, без сохранения */
  amountFor: (
    decision: AccrualDecision,
  ) => { ok: true; rub: number; toBp: number } | { ok: false; reason: string };
}

/**
 * Предпросмотр блока «Доля и начисление» по записи: что предложит система и сколько начислит
 * при любой доле. null — у записи нет раздела, режим «по времени» или раздела нет в смете
 */
export function useAccrualPreview(entry: TimeEntry | null): AccrualPreview | null {
  const s = useGasSnapshot();
  return useMemo(() => {
    if (!s || !entry?.sectionKey) return null;
    if ((s.reviewSettings.accrualMode ?? "share") !== "share") return null;
    const key = entry.sectionKey;
    const section = (s.objectSections ?? []).find(
      (x) => x.objectId === entry.objectId && x.key === key,
    );
    if (!section) return null;
    const progress = s.sectionProgress ?? [];
    const workRub = sectionWorkRub(section);
    const accrued = accruedRub(s.entries, entry.objectId, key);
    const fromBp = currentBp(progress, entry.objectId, key);
    // Уже подтверждённая запись: показываем её начисление, а не новое предложение
    const pending = entry.status !== "confirmed";
    const suggestion = suggestBp({
      normHours: section.laborHours,
      personMinutes: confirmedPersonMinutes(s.entries, entry.objectId, key, pending ? [entry] : []),
      currentBp: fromBp,
      done: entry.sectionDone === true,
    });
    return {
      sectionKey: key,
      sectionTitle: sectionLabel(section),
      workRub,
      accruedRub: accrued,
      remainingRub: workRub === null ? null : Math.max(0, workRub - accrued),
      fromBp,
      suggestedBp: suggestion.bp,
      basis: suggestion.basis,
      foremanDone: entry.sectionDone ?? null,
      amountFor: (decision) => {
        const plan = planAccrual({
          section,
          entries: s.entries,
          progress,
          objectId: entry.objectId,
          sectionKey: key,
          batch: [entry],
          decision,
        });
        return plan.ok ? { ok: true, rub: plan.totalRub, toBp: plan.toBp } : plan;
      },
    };
  }, [s, entry]);
}

/** Сумма шага при доле: для подсказки рядом с полем, без плана */
export function stepFor(workRub: number, accrued: number, bp: number): number {
  return stepRub({ workRub, accruedRub: accrued, toBp: bp });
}

export function shareLine(bp: number | null): string {
  return bp === null ? "нет предложения" : fmtShare(bp);
}

export function isFull(bp: number): boolean {
  return bp >= FULL_BP;
}

export function percentInput(value: string): number | null {
  return parsePercent(value);
}

/** Действия назначений и начисления */
export function useSectionActions() {
  const run = useGasAction();
  const port = useGasOps();
  return {
    assign: useCallback(
      (input: AssignSectionInput) => run(() => port.assignSection(input)),
      [run, port],
    ),
    unassign: useCallback((id: string) => run(() => port.unassignSection(id)), [run, port]),
    setDone: useCallback(
      (entryId: string, done: boolean | null) => run(() => port.setSectionDone({ entryId, done })),
      [run, port],
    ),
    setMode: useCallback((mode: AccrualMode) => run(() => port.setAccrualMode(mode)), [run, port]),
  };
}

/** Бригады и неделя для формы назначения */
export function useAssignOptions(): {
  brigades: { id: string; name: string }[];
  weekFrom: string;
  weekTo: string;
} {
  const s = useGasSnapshot();
  return useMemo(
    () => ({
      brigades: (s?.brigades ?? []).map((b) => ({ id: b.id, name: b.name })),
      weekFrom: s?.week.from ?? "",
      weekTo: s?.week.to ?? "",
    }),
    [s],
  );
}

/** Подпись бригады по id */
export function useBrigadeName(): (id: string) => string {
  const s = useGasSnapshot();
  return useCallback((id) => s?.brigades.find((b) => b.id === id)?.name ?? id, [s]);
}

export type { PathStep };

/** Полоса пути объекта (ADR-080): смета → стоимость → бригады → часы → начисление */
/** Последняя неподтверждённая версия сметы объекта: «Подтвердить стоимость» открывает её */
export function usePendingEstimateId(objectId: string | null): string | null {
  const s = useGasSnapshot();
  return useMemo(() => {
    if (!s || !objectId) return null;
    let best: { id: string; version: number } | null = null;
    for (const v of s.estimateVersions) {
      if (v.objectId !== objectId || v.confirmedAt !== null) continue;
      if (!best || v.version > best.version) best = v;
    }
    return best?.id ?? null;
  }, [s, objectId]);
}

export function useObjectPath(objectId: string | null): PathStep[] {
  const s = useGasSnapshot();
  const ledger = useObjectSections(objectId);
  return useMemo(() => {
    if (!s || !objectId) return [];
    const entries = s.entries.filter((e) => e.objectId === objectId);
    const assigned = new Set(
      (s.sectionAssignments ?? []).filter((a) => a.objectId === objectId).map((a) => a.sectionKey),
    );
    return objectPath({
      sections: ledger.length,
      costConfirmed: s.estimates.some((e) => e.objectId === objectId && e.status === "confirmed"),
      assigned: ledger.filter((l) => assigned.has(l.key)).length,
      entries: entries.length,
      confirmedEntries: entries.filter((e) => e.status === "confirmed").length,
      accruedRub: ledger.reduce((a, l) => a + l.accruedRub, 0),
    });
  }, [s, objectId, ledger]);
}
