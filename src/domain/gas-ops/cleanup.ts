/**
 * Удаление данных (ADR-088): смета, объект целиком, очистка рабочих данных.
 *
 * Нужно для проверки загрузки на чистой базе и показа заказчику с нуля: загрузили смету,
 * что-то пошло не так — удалили и загрузили снова. Правила здесь, порт только проверяет
 * права и пишет журнал.
 *
 * - Смета: версия и её файлы. Подтверждённую не удаляем: по ней посчитана стоимость объекта,
 *   её убирают вместе с объектом.
 * - Объект: всё, что на него ссылается (сметы, разделы, записи и решения, заявки, документы).
 *   Записи закрытой недели не удаляются: версия недели — отчётный документ.
 * - Очистка: остаются справочники (подразделения, бригады, сотрудники, состав, ставки,
 *   пользователи), правило компании и режим проверки; остальное пустеет.
 */
import type { GasOpsSnapshot } from "@/ports/gas-ops";

/** Сколько строк уйдёт: показывается в диалоге до удаления и в тосте после */
export interface CleanupCounts {
  objects: number;
  estimates: number;
  files: number;
  entries: number;
  sections: number;
  reports: number;
  weeks: number;
}

export function emptyCounts(): CleanupCounts {
  return { objects: 0, estimates: 0, files: 0, entries: 0, sections: 0, reports: 0, weeks: 0 };
}

/** Файлы сметы: у версии может быть несколько загрузок одного содержимого — одна запись */
function filesOfVersions(snapshot: GasOpsSnapshot, versionIds: ReadonlySet<string>) {
  return (snapshot.estimateFiles ?? []).filter(
    (f) => f.versionId !== null && versionIds.has(f.versionId),
  );
}

/* ---------------------------------------------------------------- Смета */

export type EstimateRemovalBlock =
  | { kind: "not-found" }
  | { kind: "confirmed" }
  /** По смете созданы разделы объекта: без неё у разделов нет источника */
  | { kind: "sections" };

export function estimateRemovalBlock(
  snapshot: GasOpsSnapshot,
  versionId: string,
): EstimateRemovalBlock | null {
  const version = snapshot.estimateVersions.find((v) => v.id === versionId);
  if (!version) return { kind: "not-found" };
  if (version.confirmedAt !== null) return { kind: "confirmed" };
  if ((snapshot.objectSections ?? []).some((s) => s.versionId === versionId)) {
    return { kind: "sections" };
  }
  return null;
}

/** Почему смету нельзя удалить: текст для человека */
export const ESTIMATE_BLOCK_TEXT: Record<
  Exclude<EstimateRemovalBlock["kind"], "not-found">,
  string
> = {
  confirmed:
    "По этой смете подтверждена стоимость объекта. Удалите объект целиком или загрузите новую версию.",
  sections:
    "По этой смете созданы разделы объекта. Удалите объект целиком или загрузите новую версию.",
};

/** Убрать неподтверждённую версию сметы и её файлы: тот же файл потом загружается заново */
export function removeEstimate(
  snapshot: GasOpsSnapshot,
  versionId: string,
): { snapshot: GasOpsSnapshot; counts: CleanupCounts } {
  const ids = new Set([versionId]);
  const files = new Set(filesOfVersions(snapshot, ids).map((f) => f.id));
  return {
    snapshot: {
      ...snapshot,
      estimateVersions: snapshot.estimateVersions.filter((v) => !ids.has(v.id)),
      estimateFiles: (snapshot.estimateFiles ?? []).filter((f) => !files.has(f.id)),
    },
    counts: { ...emptyCounts(), estimates: 1, files: files.size },
  };
}

/* ---------------------------------------------------------------- Объект */

/** Убрать из вложенного состояния (снабжение, документы) строки со ссылкой на объект */
function withoutObject<T extends object>(part: T, objectId: string): T {
  return Object.fromEntries(
    Object.entries(part).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? value.filter((item) => (item as { objectId?: unknown })?.objectId !== objectId)
        : value,
    ]),
  ) as T;
}

/** Что уйдёт вместе с объектом: для диалога подтверждения */
export function objectCounts(snapshot: GasOpsSnapshot, objectId: string): CleanupCounts {
  const versions = snapshot.estimateVersions.filter((v) => v.objectId === objectId);
  return {
    ...emptyCounts(),
    objects: 1,
    estimates: versions.length,
    files: filesOfVersions(snapshot, new Set(versions.map((v) => v.id))).length,
    entries: snapshot.entries.filter((e) => e.objectId === objectId).length,
    sections: (snapshot.objectSections ?? []).filter((s) => s.objectId === objectId).length,
  };
}

/** Дни закрытых недель, на которые у объекта есть записи: такие объекты не удаляются */
export function lockedObjectDays(
  snapshot: GasOpsSnapshot,
  objectId: string,
  isLocked: (day: string) => boolean,
): string[] {
  const days = new Set(snapshot.entries.filter((e) => e.objectId === objectId).map((e) => e.day));
  return [...days].filter(isLocked).sort();
}

export function removeObject(
  snapshot: GasOpsSnapshot,
  objectId: string,
): { snapshot: GasOpsSnapshot; counts: CleanupCounts } {
  const counts = objectCounts(snapshot, objectId);
  const versions = new Set(
    snapshot.estimateVersions.filter((v) => v.objectId === objectId).map((v) => v.id),
  );
  const files = new Set(filesOfVersions(snapshot, versions).map((f) => f.id));
  const entries = new Set(snapshot.entries.filter((e) => e.objectId === objectId).map((e) => e.id));
  return {
    counts,
    snapshot: {
      ...snapshot,
      objects: snapshot.objects.filter((o) => o.id !== objectId),
      estimates: snapshot.estimates.filter((e) => e.objectId !== objectId),
      estimateVersions: snapshot.estimateVersions.filter((v) => !versions.has(v.id)),
      estimateFiles: (snapshot.estimateFiles ?? []).filter((f) => !files.has(f.id)),
      objectSections: (snapshot.objectSections ?? []).filter((s) => s.objectId !== objectId),
      sectionAssignments: (snapshot.sectionAssignments ?? []).filter(
        (a) => a.objectId !== objectId,
      ),
      sectionProgress: (snapshot.sectionProgress ?? []).filter((p) => p.objectId !== objectId),
      entries: snapshot.entries.filter((e) => !entries.has(e.id)),
      reviews: snapshot.reviews.filter((r) => !entries.has(r.entryId)),
      assignments: snapshot.assignments.map((a) => ({
        ...a,
        objectIds: a.objectIds.filter((id) => id !== objectId),
      })),
      costRules: snapshot.costRules.filter((r) => r.objectId !== objectId),
      finalChecks: snapshot.finalChecks.map((c) => ({
        ...c,
        entryIds: c.entryIds.filter((id) => !entries.has(id)),
      })),
      // Сданный отчёт с этим объектом больше не совпадает с данными: помечаем, не удаляем
      reportIssues: snapshot.reportIssues.map((r) =>
        r.objectIds.includes(objectId)
          ? { ...r, stale: true, staleReason: "Объект отчёта удалён" }
          : r,
      ),
      users: snapshot.users.map((u) =>
        u.allowedObjectIds === "all"
          ? u
          : { ...u, allowedObjectIds: u.allowedObjectIds.filter((id) => id !== objectId) },
      ),
      supply: withoutObject(snapshot.supply, objectId),
      docs: withoutObject(snapshot.docs, objectId),
    },
  };
}

/* ---------------------------------------------------------------- Бригада */

/** Бригаду с записями времени не удаляем: записи — основа табеля и отчётов */
export function brigadeEntryCount(snapshot: GasOpsSnapshot, brigadeId: string): number {
  return snapshot.entries.filter((e) => e.brigadeId === brigadeId).length;
}

/**
 * Убрать бригаду без записей: состав, ставки, отпуск, назначения разделов и дней.
 * Сотрудники бригады уходят вместе с ней; пользователь-бригадир остаётся без бригады
 */
export function removeBrigade(snapshot: GasOpsSnapshot, brigadeId: string): GasOpsSnapshot {
  return {
    ...snapshot,
    brigades: snapshot.brigades.filter((b) => b.id !== brigadeId),
    employees: snapshot.employees.filter((e) => e.brigadeId !== brigadeId),
    crew: snapshot.crew.filter((c) => c.brigadeId !== brigadeId),
    rates: snapshot.rates.filter((r) => r.brigadeId !== brigadeId),
    brigadeAvailability: snapshot.brigadeAvailability.filter((a) => a.brigadeId !== brigadeId),
    sectionAssignments: (snapshot.sectionAssignments ?? []).filter(
      (a) => a.brigadeId !== brigadeId,
    ),
    assignments: snapshot.assignments.filter((a) => a.brigadeId !== brigadeId),
    frames: snapshot.frames.filter((f) => f.brigadeId !== brigadeId),
    users: snapshot.users.map((u) => (u.brigadeId === brigadeId ? { ...u, brigadeId: null } : u)),
    directoryUndo: null,
  };
}

/* ---------------------------------------------------------------- Очистка */

/** Что уйдёт при очистке: для диалога подтверждения */
export function clearCounts(snapshot: GasOpsSnapshot): CleanupCounts {
  return {
    objects: snapshot.objects.length,
    estimates: snapshot.estimateVersions.length,
    files: (snapshot.estimateFiles ?? []).length,
    entries: snapshot.entries.length,
    sections: (snapshot.objectSections ?? []).length,
    reports: snapshot.reportIssues.length,
    weeks: snapshot.periods.length,
  };
}

export function isEmptyData(counts: CleanupCounts): boolean {
  return Object.values(counts).every((n) => n === 0);
}

/**
 * Чистая база со справочниками: можно заново загрузить сметы и внести время.
 * Журнал действий не очищается (туда пишется сама очистка), закрытые недели уходят вместе
 * с записями: без записей версия недели ничего не значит
 */
export function clearWorkingData(snapshot: GasOpsSnapshot): {
  snapshot: GasOpsSnapshot;
  counts: CleanupCounts;
} {
  const counts = clearCounts(snapshot);
  return {
    counts,
    snapshot: {
      ...snapshot,
      objects: [],
      estimates: [],
      entries: [],
      reviews: [],
      frames: [],
      assignments: snapshot.assignments.map((a) => ({ ...a, objectIds: [] })),
      estimateVersions: [],
      estimateFiles: [],
      objectSections: [],
      sectionAssignments: [],
      sectionProgress: [],
      costRules: snapshot.costRules.filter((r) => r.objectId === null),
      schedule: null,
      brigadeAvailability: [],
      finalChecks: [],
      reportIssues: [],
      periods: [],
      directoryUndo: null,
      users: snapshot.users.map((u) =>
        u.allowedObjectIds === "all" ? u : { ...u, allowedObjectIds: [] },
      ),
      supply: { ...snapshot.supply, requests: [], offers: [], receipts: [], limits: [] },
      docs: {
        ...snapshot.docs,
        sheets: [],
        works: [],
        files: [],
        docs: [],
        registries: [],
        journal: [],
      },
    },
  };
}

/** Пути исходных файлов смет, на которые больше никто не ссылается: их убирает сервер */
export function orphanStoragePaths(before: GasOpsSnapshot, after: GasOpsSnapshot): string[] {
  const kept = new Set(
    (after.estimateFiles ?? []).map((f) => f.storagePath).filter((p): p is string => !!p),
  );
  const gone = new Set(
    (before.estimateFiles ?? [])
      .map((f) => f.storagePath)
      .filter((p): p is string => !!p && !kept.has(p)),
  );
  return [...gone];
}

/** «2 объекта, 3 сметы, 41 запись»: только ненулевые части */
export function countsPhrase(counts: CleanupCounts): string {
  const parts: [number, [string, string, string]][] = [
    [counts.objects, ["объект", "объекта", "объектов"]],
    [counts.estimates, ["смета", "сметы", "смет"]],
    [counts.files, ["файл", "файла", "файлов"]],
    [counts.entries, ["запись времени", "записи времени", "записей времени"]],
    [counts.sections, ["раздел", "раздела", "разделов"]],
    [counts.reports, ["сданный отчёт", "сданных отчёта", "сданных отчётов"]],
    [counts.weeks, ["закрытая неделя", "закрытые недели", "закрытых недель"]],
  ];
  const text = parts
    .filter(([n]) => n > 0)
    .map(([n, forms]) => `${n} ${pluralRu(n, forms)}`)
    .join(", ");
  return text || "нет данных";
}

function pluralRu(n: number, [one, few, many]: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
