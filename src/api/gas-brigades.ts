/**
 * Бригада в карточке (ADR-089): правка, удаление, объекты бригады и привязка к объекту.
 * Привязка — назначение разделов сметы объекта (ADR-078): по ней бригадир видит объект
 * и раздел в форме времени и в боте.
 */
import { useCallback, useMemo } from "react";
import { useGasAction, useGasSnapshot } from "@/lib/gas-ops/use-gas-ops";
import { brigadeEntryCount } from "@/domain/gas-ops/cleanup";
import { classifySections, type SectionRole } from "@/domain/gas-ops/estimate-kind";
import { sectionLabel } from "@/domain/gas-ops/section-accrual";
import { brigadeStatus } from "@/domain/gas-ops/schedule";

export function useBrigadeActions() {
  const run = useGasAction();
  return {
    update: useCallback(
      (input: { id: string; name: string; groupId: string; phone: string | null }) =>
        run((port) => port.updateBrigade(input)),
      [run],
    ),
    remove: useCallback((id: string) => run((port) => port.deleteBrigade(id)), [run]),
  };
}

/** Записей у бригады: с записями её не удаляют */
export function useBrigadeEntryCount(brigadeId: string | null): number {
  const s = useGasSnapshot();
  return useMemo(() => (brigadeId ? brigadeEntryCount(s, brigadeId) : 0), [s, brigadeId]);
}

/** В отпуске ли бригада на текущей неделе */
export function useBrigadeAway(brigadeId: string | null): boolean {
  const s = useGasSnapshot();
  return brigadeId
    ? brigadeStatus(brigadeId, s.week.from, s.brigadeAvailability ?? []) === "vacation"
    : false;
}

export interface BrigadeObject {
  objectId: string;
  code: string;
  label: string;
  sections: { assignmentId: string; title: string; from: string; to: string | null }[];
}

/** Объекты бригады по назначениям разделов */
export function useBrigadeObjects(brigadeId: string | null): BrigadeObject[] {
  const s = useGasSnapshot();
  return useMemo(() => {
    if (!brigadeId) return [];
    const byObject = new Map<string, BrigadeObject>();
    for (const a of s.sectionAssignments ?? []) {
      if (a.brigadeId !== brigadeId) continue;
      const object = s.objects.find((o) => o.id === a.objectId);
      if (!object) continue;
      const row = byObject.get(object.id) ?? {
        objectId: object.id,
        code: object.code,
        label: object.label,
        sections: [],
      };
      row.sections.push({ assignmentId: a.id, title: a.title, from: a.from, to: a.to });
      byObject.set(object.id, row);
    }
    return [...byObject.values()];
  }, [s, brigadeId]);
}

export interface BindableSection {
  key: string;
  label: string;
  role: SectionRole;
  report: boolean;
  /** Уже назначен этой бригаде */
  assigned: boolean;
}

/** Объекты, к которым можно привязать бригаду: у которых есть разделы сметы */
export function useBindableObjects(brigadeId: string | null): {
  objects: { id: string; code: string; label: string; sections: BindableSection[] }[];
  weekFrom: string;
} {
  const s = useGasSnapshot();
  return useMemo(() => {
    const objects = s.objects
      .map((o) => {
        const list = (s.objectSections ?? []).filter((x) => x.objectId === o.id && !x.removed);
        const roles = classifySections(list).sections;
        return {
          id: o.id,
          code: o.code,
          label: o.label,
          sections: list.map((x, i) => ({
            key: x.key,
            label: sectionLabel(x),
            role: roles[i]!.role,
            report: roles[i]!.report,
            assigned: (s.sectionAssignments ?? []).some(
              (a) => a.objectId === o.id && a.sectionKey === x.key && a.brigadeId === brigadeId,
            ),
          })),
        };
      })
      .filter((o) => o.sections.length > 0);
    return { objects, weekFrom: s.week.from };
  }, [s, brigadeId]);
}
