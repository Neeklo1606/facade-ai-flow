/**
 * Слой данных газового направления (ADR-001, п. 5; ADR-043).
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
  busyIntervals,
  clashOf,
  dayObjects,
  dashboardMetrics,
  entryView,
  myEntries,
  objectCards,
  queue,
  queueCounts,
  type BrigadeCard,
  type BusyInterval,
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
  useGasSnapshot,
  type GasActor,
} from "@/lib/gas-ops/use-gas-ops";
import type { CreateEntryInput, ReviewInput, UpdateEntryInput } from "@/ports/gas-ops";
import { fieldFor, type FieldEntry, type FieldSnapshot } from "@/domain/gas-ops/field";
import {
  CREW_ROLE_LABEL,
  crewOn,
  crewSummary,
  fmtManHours,
  headcountOf,
  manMinutesOf,
  type CrewMember,
  type PersonInput,
  type Rate,
} from "@/domain/gas-ops/crew";
import {
  accruedByDay,
  blockingReasons,
  closeReasons,
  coverage,
  expectations,
  periodState,
  weekMetrics,
  type Acceptance,
  type CloseReason,
  type Expectation,
  type PeriodState,
  type PeriodVersion,
  type WeekMetrics,
} from "@/domain/gas-ops/week";
import { CHANNEL_LABEL, type EntryChannel } from "@/domain/gas-ops/model";
import { AUTO_ACTOR } from "@/domain/gas-ops/review-policy";
import {
  CUSTOMER_DAY_HEADERS,
  CUSTOMER_PROFILE,
  profileCheck,
  type ExportProfile,
  type ProfileCheck,
} from "@/domain/gas-ops/export-profile";

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

export { clashOf };

export {
  CHANNEL_LABEL,
  CREW_ROLE_LABEL,
  blockingReasons,
  crewSummary,
  fmtManHours,
  headcountOf,
  manMinutesOf,
};
export type {
  Acceptance,
  CloseReason,
  CrewMember,
  EntryChannel,
  Expectation,
  FieldEntry,
  FieldSnapshot,
  PeriodState,
  PeriodVersion,
  PersonInput,
  Rate,
  WeekMetrics,
};

/**
 * Интерфейс бригадира (ADR-056): та же выборка, что отдаёт порт, — без сумм и чужих бригад.
 * Менеджер и администратор смотрят им за выбранную бригаду
 */
export function useGasField(brigadeId?: string | null): FieldSnapshot {
  const data = useGasSnapshot();
  return useMemo(() => fieldFor(data, brigadeId), [data, brigadeId]);
}

export interface GasWeekView {
  metrics: WeekMetrics;
  byDay: { day: string; value: number | null }[];
  coverage: { received: number; expected: number; missing: Expectation[] };
  /** Источник ожидания: график заказчика, демо-назначения или ничего */
  expectationSource: "schedule" | "assignment" | null;
  reasons: CloseReason[];
  period: PeriodState;
  /** По объектам: подтверждённое, часы, человеко-часы, выработка, готовность */
  objects: {
    id: string;
    label: string;
    code: string;
    minutes: number;
    manMinutes: number | null;
    accruedRub: number;
    outputPerHour: number | null;
    ready: boolean;
  }[];
}

/** Неделя руководителя: показатели, полнота, причины, версии (ADR-056, 5) */
export function useGasWeekView(): GasWeekView {
  const data = useGasSnapshot();
  return useMemo(() => {
    const days = data.week.days;
    const expected = expectations({
      days,
      brigades: data.brigades,
      objects: data.objects,
      schedule: data.schedule,
      assignments: data.assignments,
    });
    const cov = coverage(expected, data.entries);
    const reasons = closeReasons({
      days,
      entries: data.entries,
      estimates: data.estimates,
      objects: data.objects,
      brigades: data.brigades,
      crew: data.crew,
      finalChecks: data.finalChecks,
      missing: cov.missing,
    });
    const week = new Set(days);
    const own = data.entries.filter((e) => week.has(e.day) && e.status !== "rejected");
    const blocked = new Set(reasons.flatMap((r) => r.entryIds));
    const objects = [...new Set(own.map((e) => e.objectId))].map((id) => {
      const object = data.objects.find((o) => o.id === id);
      const list = own.filter((e) => e.objectId === id);
      const confirmed = list.filter((e) => e.status === "confirmed");
      const minutes = confirmed.reduce((a, e) => a + e.minutes, 0);
      const man = confirmed.map(manMinutesOf);
      const accruedRub = confirmed.reduce((a, e) => a + (e.amountRub ?? 0), 0);
      return {
        id,
        label: object?.label ?? "Объект",
        code: object?.code ?? "",
        minutes,
        manMinutes:
          man.length && man.every((m) => m !== null)
            ? man.reduce<number>((a, m) => a + (m ?? 0), 0)
            : null,
        accruedRub,
        outputPerHour: minutes > 0 ? Math.round(accruedRub / (minutes / 60)) : null,
        ready: list.every((e) => e.status === "confirmed" && !blocked.has(e.id)),
      };
    });
    return {
      metrics: weekMetrics(data.entries, days, data.rates),
      byDay: accruedByDay(data.entries, days),
      coverage: cov,
      expectationSource: expected[0]?.source ?? null,
      reasons,
      period: periodState(data.periods, data.week.from),
      objects: objects.sort((a, b) => b.accruedRub - a.accruedRub),
    };
  }, [data]);
}

/** Справочники: состав на сегодня с периодами и ставки */
export function useGasCrew(): {
  crew: (CrewMember & { active: boolean })[];
  rates: Rate[];
} {
  const data = useGasSnapshot();
  return useMemo(() => {
    const active = new Set(
      data.brigades.flatMap((b) => crewOn(data.crew, b.id, data.today).map((m) => m.id)),
    );
    return { crew: data.crew.map((m) => ({ ...m, active: active.has(m.id) })), rates: data.rates };
  }, [data]);
}

/** Разбор фразы бригадира правилом domain (ADR-049): экран бота зовёт его отсюда */
export { parseTimeMessage } from "@/domain/gas-ops/parse-time-message";
export type { ParsedTime, ParseObject } from "@/domain/gas-ops/parse-time-message";

export type {
  AnalyticRow,
  BrigadeCard,
  BusyInterval,
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

/** Объекты бригады «на сегодня»: первые кнопки бота (ADR-044, F4) */
export function useGasDayObjects(brigadeId: string | null, day: string): WorkObject[] {
  const data = useGasData();
  return useMemo(() => (brigadeId ? dayObjects(data, brigadeId, day) : []), [data, brigadeId, day]);
}

/** Занятые интервалы бригады за день: кнопки времени с ними недоступны (F4) */
export function useGasBusy(
  brigadeId: string | null,
  day: string,
  exceptId?: string,
): BusyInterval[] {
  const data = useGasData();
  return useMemo(
    () => (brigadeId ? busyIntervals(data, brigadeId, day, exceptId) : []),
    [data, brigadeId, day, exceptId],
  );
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

/**
 * Отчёт недели. `entries` — записи версии закрытой недели (ADR-056, 5): файл v1 строится
 * из её копии, а не из текущих записей, поэтому после переоткрытия он не меняется
 */
export function useGasReport(mode: ReportMode, entries?: readonly TimeEntry[] | null): ReportData {
  const data = useGasData();
  return useMemo(() => {
    const base = {
      groups: data.groups,
      brigades: data.brigades,
      employees: data.employees,
      objects: data.objects,
      days: data.week.days,
      entries: entries ? [...entries] : data.entries,
      mode,
    };
    return {
      rows: customerFormatRows({ ...base, frames: data.frames }),
      analytic: analyticRows(base),
      days: data.week.days,
      week: { from: data.week.from, to: data.week.to },
      count: reportEntries(base.entries, mode).length,
    };
  }, [data, mode, entries]);
}

/** Справочники для фильтров экранов */
export function useGasDirectory(): {
  brigades: { id: string; name: string; leadName: string | null }[];
  groups: { id: string; name: string }[];
  objects: WorkObject[];
  days: string[];
} {
  const data = useGasData();
  return {
    brigades: data.brigades.map((b) => ({
      id: b.id,
      name: b.name,
      leadName: data.employees.find((e) => e.brigadeId === b.id && e.isLead)?.name ?? null,
    })),
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
  /** Отменить последнее решение проверки: тост «Отменить» */
  undoReview: (id: string) => Promise<ActionResult<TimeEntry>>;
  setEstimate: (input: {
    objectId: string;
    amountRub: number;
    note?: string | undefined;
  }) => Promise<ActionResult<Estimate>>;
  reset: () => Promise<ActionResult<unknown>>;
  answerClarify: (input: { id: string; text: string }) => Promise<ActionResult<TimeEntry>>;
  closeWeek: (input: { accepted: Acceptance[] }) => Promise<ActionResult<PeriodVersion>>;
  reopenWeek: (input: { reason: string }) => Promise<ActionResult<PeriodVersion>>;
  setRate: (input: {
    employeeId: string | null;
    brigadeId: string;
    rubPerHour: number;
    from: string;
  }) => Promise<ActionResult<Rate>>;
  addCrewMember: (input: {
    brigadeId: string;
    name: string;
    from: string;
  }) => Promise<ActionResult<CrewMember>>;
  endCrewMember: (input: { id: string; to: string }) => Promise<ActionResult<CrewMember>>;
} {
  const run = useGasAction();
  const port = useGasOps();
  return {
    signIn: useCallback((userId) => run(() => port.signIn(userId)), [run, port]),
    createEntry: useCallback((input) => run(() => port.createEntry(input)), [run, port]),
    updateEntry: useCallback((input) => run(() => port.updateEntry(input)), [run, port]),
    submitEntry: useCallback((id) => run(() => port.submitEntry(id)), [run, port]),
    review: useCallback((input) => run(() => port.review(input)), [run, port]),
    undoReview: useCallback((id) => run(() => port.undoReview(id)), [run, port]),
    setEstimate: useCallback((input) => run(() => port.setEstimate(input)), [run, port]),
    reset: useCallback(() => run(() => port.reset()), [run, port]),
    answerClarify: useCallback((input) => run(() => port.answerClarify(input)), [run, port]),
    closeWeek: useCallback((input) => run(() => port.closeWeek(input)), [run, port]),
    reopenWeek: useCallback((input) => run(() => port.reopenWeek(input)), [run, port]),
    setRate: useCallback((input) => run(() => port.setRate(input)), [run, port]),
    addCrewMember: useCallback((input) => run(() => port.addCrewMember(input)), [run, port]),
    endCrewMember: useCallback((input) => run(() => port.endCrewMember(input)), [run, port]),
  };
}

/** Принято людьми сегодня: решения системы в автоматическом режиме сюда не входят */
export function useGasAcceptedToday(): number {
  const data = useGasSnapshot();
  return useMemo(
    () =>
      data.entries.filter(
        (e) =>
          e.status === "confirmed" &&
          e.reviewedBy !== AUTO_ACTOR &&
          e.reviewedAt?.slice(0, 10) === data.today,
      ).length,
    [data],
  );
}

/** Профиль выгрузки Excel и его сверка с экраном «Неделя» (ADR-056, 6) */
export function useGasExportProfile(): {
  profile: ExportProfile;
  headers: readonly string[];
  check: ProfileCheck;
} {
  const report = useGasReport("confirmed");
  const view = useGasWeekView();
  return useMemo(
    () => ({
      profile: CUSTOMER_PROFILE,
      headers: CUSTOMER_DAY_HEADERS,
      check: profileCheck({
        profile: CUSTOMER_PROFILE,
        headers: CUSTOMER_DAY_HEADERS,
        rows: report.rows,
        screenTotalRub: view.metrics.accruedRub,
      }),
    }),
    [report.rows, view.metrics.accruedRub],
  );
}
