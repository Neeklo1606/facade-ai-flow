/**
 * Слой данных газового направления (ADR-001, п. 5; ADR-042).
 *
 * Экраны и компоненты берут отсюда и готовые цифры, и действия, и подписи. Порт, домен
 * и адаптер ниже этого слоя: когда демо-адаптер сменится на сервер, экраны не изменятся.
 */
import { useCallback, useMemo } from "react";
import {
  effectiveMinutes,
  fmtHours,
  fmtRate,
  fmtRub,
  formatClock,
  hoursOfMinutes,
  type MinutesResult,
} from "@/domain/gas-ops/calc";
import {
  ENTRY_STATUS_LABEL,
  FLAG_LABEL,
  ROLE_LABEL,
  type DataSource,
  type EntryFlag,
  type EntryStatus,
  type Estimate,
  type Role,
  type TimeEntry,
  type WorkObject,
} from "@/domain/gas-ops/model";
import {
  analyticRows,
  customerFormatRows,
  reportEntries,
  type AnalyticRow,
  type ReportMode,
  type ReportRow,
} from "@/domain/gas-ops/report";
import {
  allowedObjects,
  brigadeCards,
  dashboardMetrics,
  entryView,
  myEntries,
  objectCards,
  queue,
  queueCounts,
  type BrigadeCard,
  type DashboardMetrics,
  type EntryView,
  type ObjectCard,
} from "@/domain/gas-ops/view";
import {
  useGasAction,
  useGasActor,
  useGasData,
  useGasHydration,
  useGasOps,
  type GasActor,
} from "@/lib/gas-ops/use-gas-ops";
import type { CreateEntryInput, ReviewInput, UpdateEntryInput } from "@/ports/gas-ops";

export {
  ENTRY_STATUS_LABEL,
  FLAG_LABEL,
  ROLE_LABEL,
  fmtHours,
  fmtRate,
  fmtRub,
  formatClock,
  hoursOfMinutes,
  useGasActor,
  useGasHydration,
};

export type {
  AnalyticRow,
  BrigadeCard,
  DashboardMetrics,
  DataSource,
  EntryFlag,
  EntryStatus,
  EntryView,
  Estimate,
  GasActor,
  MinutesResult,
  ObjectCard,
  ReportMode,
  ReportRow,
  Role,
  TimeEntry,
  WorkObject,
};

/** Неделя отчёта и «сегодня» направления */
export function useGasWeek(): {
  today: string;
  from: string;
  to: string;
  days: string[];
  yesterday: string;
} {
  const data = useGasData();
  const index = data.week.days.indexOf(data.today);
  return {
    today: data.today,
    from: data.week.from,
    to: data.week.to,
    days: data.week.days,
    yesterday: data.week.days[index - 1] ?? data.today,
  };
}

/** Кто может войти: список ролей для переключателя на экране */
export function useGasUsers(): { id: string; name: string; role: Role }[] {
  const data = useGasData();
  return data.users.map((user) => ({ id: user.id, name: user.name, role: user.role }));
}

export function useGasDashboard(): DashboardMetrics {
  const data = useGasData();
  return useMemo(() => dashboardMetrics(data), [data]);
}

export function useGasQueue(status: EntryStatus | "all"): EntryView[] {
  const data = useGasData();
  return useMemo(() => queue(data, status), [data, status]);
}

export function useGasQueueCounts(): Record<EntryStatus, number> {
  const data = useGasData();
  return useMemo(() => queueCounts(data), [data]);
}

export interface EntriesFilter {
  brigadeId?: string | undefined;
  status?: EntryStatus | undefined;
  day?: string | undefined;
  source?: DataSource | undefined;
  search?: string | undefined;
  /** Только своя бригада: так журнал видит бригадир */
  ownBrigadeOnly?: boolean | undefined;
}

/** Журнал записей с фильтрами. Сборка готова к показу: подписи и признаки уже посчитаны */
export function useGasEntries(filter: EntriesFilter): EntryView[] {
  const data = useGasData();
  const actor = useGasActor();
  return useMemo(() => {
    const text = (filter.search ?? "").trim().toLowerCase();
    return data.entries
      .filter((entry) =>
        filter.ownBrigadeOnly && actor.brigadeId ? entry.brigadeId === actor.brigadeId : true,
      )
      .filter((entry) => (filter.brigadeId ? entry.brigadeId === filter.brigadeId : true))
      .filter((entry) => (filter.status ? entry.status === filter.status : true))
      .filter((entry) => (filter.day ? entry.day === filter.day : true))
      .filter((entry) => (filter.source ? entry.source === filter.source : true))
      .map((entry) => entryView(data, entry))
      .filter((view) =>
        text
          ? [view.object?.label, view.brigade?.name, view.employee?.name, view.entry.number]
              .filter((value): value is string => !!value)
              .some((value) => value.toLowerCase().includes(text))
          : true,
      )
      .sort(
        (a, b) =>
          b.entry.day.localeCompare(a.entry.day) || a.entry.number.localeCompare(b.entry.number),
      );
  }, [data, actor, filter]);
}

export function useGasEntry(id: string | null): EntryView | null {
  const data = useGasData();
  return useMemo(() => {
    const entry = id ? data.entries.find((e) => e.id === id) : null;
    return entry ? entryView(data, entry) : null;
  }, [data, id]);
}

export function useGasBrigades(mode: "confirmed" | "all" = "confirmed"): BrigadeCard[] {
  const data = useGasData();
  return useMemo(() => brigadeCards(data, mode), [data, mode]);
}

export function useGasObjects(): ObjectCard[] {
  const data = useGasData();
  return useMemo(() => objectCards(data), [data]);
}

export function useGasEstimates(): { estimate: Estimate; object: WorkObject | null }[] {
  const data = useGasData();
  return useMemo(
    () =>
      data.estimates.map((estimate) => ({
        estimate,
        object: data.objects.find((o) => o.id === estimate.objectId) ?? null,
      })),
    [data],
  );
}

export interface EmployeeRow {
  id: string;
  name: string;
  brigadeName: string;
  isLead: boolean;
  maxId: string | null;
  entries: number;
  minutes: number;
  source: DataSource;
}

export function useGasEmployees(): EmployeeRow[] {
  const data = useGasData();
  return useMemo(
    () =>
      data.employees.map((employee) => {
        const own = data.entries.filter((e) => e.employeeId === employee.id);
        return {
          id: employee.id,
          name: employee.name,
          brigadeName: data.brigades.find((b) => b.id === employee.brigadeId)?.name ?? "—",
          isLead: employee.isLead,
          maxId: employee.maxId,
          entries: own.length,
          minutes: own.reduce((a, e) => a + e.minutes, 0),
          source: employee.source,
        };
      }),
    [data],
  );
}

/** Объекты, по которым этому человеку разрешено вводить время */
export function useGasAllowedObjects(): WorkObject[] {
  const data = useGasData();
  return useMemo(() => allowedObjects(data), [data]);
}

/** Записи бригады текущего человека: история в боте */
export function useGasMyEntries(): EntryView[] {
  const data = useGasData();
  return useMemo(() => myEntries(data), [data]);
}

export interface ReportData {
  rows: ReportRow[];
  analytic: AnalyticRow[];
  days: string[];
  week: { from: string; to: string };
  count: number;
}

export function useGasReport(mode: ReportMode): ReportData {
  const data = useGasData();
  return useMemo(() => {
    const base = {
      groups: data.groups,
      brigades: data.brigades,
      employees: data.employees,
      objects: data.objects,
      days: data.week.days,
      entries: data.entries,
      mode,
    };
    return {
      rows: customerFormatRows({ ...base, frames: data.frames }),
      analytic: analyticRows(base),
      days: data.week.days,
      week: { from: data.week.from, to: data.week.to },
      count: reportEntries(data.entries, mode).length,
    };
  }, [data, mode]);
}

/** Справочники для фильтров экранов */
export function useGasDirectory(): {
  brigades: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  objects: WorkObject[];
  days: string[];
} {
  const data = useGasData();
  return {
    brigades: data.brigades.map((b) => ({ id: b.id, name: b.name })),
    groups: data.groups.map((g) => ({ id: g.id, name: g.name })),
    objects: data.objects,
    days: data.week.days,
  };
}

export function useGasAudit(): {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}[] {
  const data = useGasData();
  return data.audit;
}

/** Предварительный расчёт минут для экрана ввода: тот же домен, что считает запись */
export function previewMinutes(
  start: string,
  end: string,
  breakMinutes: string | number,
): MinutesResult {
  return effectiveMinutes({ start, end, breakMinutes });
}

export type ActionResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

/** Действия направления. Ошибка правил приходит текстом, который можно показать человеку */
export function useGasActions(): {
  signIn: (userId: string) => Promise<ActionResult<unknown>>;
  createEntry: (input: CreateEntryInput) => Promise<ActionResult<TimeEntry>>;
  updateEntry: (input: UpdateEntryInput) => Promise<ActionResult<TimeEntry>>;
  submitEntry: (id: string) => Promise<ActionResult<TimeEntry>>;
  review: (input: ReviewInput) => Promise<ActionResult<TimeEntry>>;
  setEstimate: (input: {
    objectId: string;
    amountRub: number;
    note?: string | undefined;
  }) => Promise<ActionResult<Estimate>>;
  reset: () => Promise<ActionResult<unknown>>;
} {
  const run = useGasAction();
  const port = useGasOps();
  return {
    signIn: useCallback((userId) => run(() => port.signIn(userId)), [run, port]),
    createEntry: useCallback((input) => run(() => port.createEntry(input)), [run, port]),
    updateEntry: useCallback((input) => run(() => port.updateEntry(input)), [run, port]),
    submitEntry: useCallback((id) => run(() => port.submitEntry(id)), [run, port]),
    review: useCallback((input) => run(() => port.review(input)), [run, port]),
    setEstimate: useCallback((input) => run(() => port.setEstimate(input)), [run, port]),
    reset: useCallback(() => run(() => port.reset()), [run, port]),
  };
}
