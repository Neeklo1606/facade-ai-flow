/**
 * Сборка данных для экранов газового направления (ADR-043). Правила живут здесь,
 * а не в компонентах: карточка проверки, журнал, бригады, объекты и сводка считаются
 * из одного снимка, поэтому цифры на экранах не расходятся.
 */
import { flagsOf, hoursOfMinutes, revenuePerHour, totalsOf, type Totals } from "./calc";
import type {
  Assignment,
  AuditLog,
  Brigade,
  Employee,
  EntryFlag,
  EntryStatus,
  Estimate,
  Group,
  Review,
  TimeEntry,
  User,
  WorkObject,
} from "./model";

export interface GasData {
  today: string;
  week: { from: string; to: string; days: string[] };
  groups: Group[];
  brigades: Brigade[];
  employees: Employee[];
  objects: WorkObject[];
  estimates: Estimate[];
  entries: TimeEntry[];
  reviews: Review[];
  users: User[];
  /** Рамки смен из отчёта заказчика: нужны строке интервала в «Формате заказчика» */
  frames: { brigadeId: string; employeeId: string | null; day: string; frame: string }[];
  /** Объекты бригад «на сегодня» (демо-назначения) */
  assignments: Assignment[];
  /** Журнал действий: кто и что сделал */
  audit: AuditLog[];
  actorId: string;
}

export interface EntryView {
  entry: TimeEntry;
  object: WorkObject | null;
  brigade: Brigade | null;
  employee: Employee | null;
  group: Group | null;
  /** Подтверждённая стоимость работ объекта, если она есть */
  estimate: Estimate | null;
  /** Откуда взята сумма записи: без источника сумма не показывается как подтверждённая */
  amountOrigin: "entry" | "estimate" | "manual" | "none";
  hours: number;
  revenue: number | null;
  flags: EntryFlag[];
  history: Review[];
}

export function actorOf(data: GasData): User | null {
  return data.users.find((u) => u.id === data.actorId) ?? null;
}

/** Сколько дней работали по объекту: нужно признаку «объект на несколько дней» */
function objectDays(data: GasData, objectId: string): number {
  return new Set(data.entries.filter((e) => e.objectId === objectId).map((e) => e.day)).size;
}

export function entryView(data: GasData, entry: TimeEntry): EntryView {
  const object = data.objects.find((o) => o.id === entry.objectId) ?? null;
  const brigade = data.brigades.find((b) => b.id === entry.brigadeId) ?? null;
  const employee = data.employees.find((e) => e.id === entry.employeeId) ?? null;
  const group = data.groups.find((g) => g.id === brigade?.groupId) ?? null;
  const estimate =
    data.estimates.find((e) => e.objectId === entry.objectId && e.status === "confirmed") ??
    data.estimates.find((e) => e.objectId === entry.objectId) ??
    null;

  const amountOrigin: EntryView["amountOrigin"] =
    entry.amountRub === null
      ? "none"
      : entry.source === "fact-report"
        ? "entry"
        : estimate?.origin === "manual"
          ? "manual"
          : estimate?.status === "confirmed"
            ? "estimate"
            : "entry";

  return {
    entry,
    object,
    brigade,
    employee,
    group,
    estimate,
    amountOrigin,
    hours: hoursOfMinutes(entry.minutes),
    revenue: revenuePerHour(entry.amountRub, entry.minutes),
    flags: flagsOf({
      entry,
      all: data.entries,
      hasEstimate: estimate?.status === "confirmed" || entry.source === "fact-report",
      objectDays: objectDays(data, entry.objectId),
    }),
    history: data.reviews.filter((r) => r.entryId === entry.id),
  };
}

/** Очередь проверки: сначала то, что ждёт решения, внутри — по времени создания */
export function queue(data: GasData, status: EntryStatus | "all" = "pending"): EntryView[] {
  const picked =
    status === "all"
      ? data.entries.filter((e) => e.status !== "confirmed" || e.source === "mock")
      : data.entries.filter((e) => e.status === status);
  return picked
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((entry) => entryView(data, entry));
}

export function queueCounts(data: GasData): Record<EntryStatus, number> {
  const counts: Record<EntryStatus, number> = {
    draft: 0,
    pending: 0,
    confirmed: 0,
    rejected: 0,
    clarify: 0,
  };
  for (const entry of data.entries) counts[entry.status] += 1;
  return counts;
}

export interface BrigadeCard {
  brigade: Brigade;
  group: Group | null;
  lead: Employee | null;
  members: Employee[];
  objects: WorkObject[];
  totals: Totals;
  /** Сколько записей бригады ждут проверки */
  pending: number;
}

export function brigadeCards(
  data: GasData,
  mode: "confirmed" | "all" = "confirmed",
): BrigadeCard[] {
  return data.brigades.map((brigade) => {
    const all = data.entries.filter((e) => e.brigadeId === brigade.id);
    const counted = mode === "confirmed" ? all.filter((e) => e.status === "confirmed") : all;
    const members = data.employees.filter((e) => e.brigadeId === brigade.id);
    const objectIds = [...new Set(counted.map((e) => e.objectId))];
    return {
      brigade,
      group: data.groups.find((g) => g.id === brigade.groupId) ?? null,
      lead: members.find((m) => m.isLead) ?? null,
      members,
      objects: objectIds
        .map((id) => data.objects.find((o) => o.id === id))
        .filter((o): o is WorkObject => !!o),
      totals: totalsOf(counted),
      pending: all.filter((e) => e.status === "pending").length,
    };
  });
}

export interface ObjectCard {
  object: WorkObject;
  estimate: Estimate | null;
  brigades: Brigade[];
  entries: TimeEntry[];
  totals: Totals;
  days: string[];
  /** Признаки объекта: нет стоимости, работа несколько дней, аномальная доходность */
  flags: EntryFlag[];
}

export function objectCards(data: GasData): ObjectCard[] {
  return data.objects.map((object) => {
    const entries = data.entries.filter((e) => e.objectId === object.id);
    const confirmed = entries.filter((e) => e.status === "confirmed");
    const estimate = data.estimates.find((e) => e.objectId === object.id) ?? null;
    const brigadeIds = [...new Set(entries.map((e) => e.brigadeId))];
    const days = [...new Set(entries.map((e) => e.day))].sort();
    const flags = [...new Set(entries.flatMap((entry) => entryView(data, entry).flags))];
    return {
      object,
      estimate,
      brigades: brigadeIds
        .map((id) => data.brigades.find((b) => b.id === id))
        .filter((b): b is Brigade => !!b),
      entries,
      totals: totalsOf(confirmed),
      days,
      flags,
    };
  });
}

export interface DashboardMetrics {
  totals: Totals;
  /** По дням недели: сумма и минуты подтверждённых записей */
  byDay: { day: string; amountRub: number; minutes: number; revenue: number | null }[];
  activeBrigades: number;
  activeObjects: number;
  pending: number;
  clarify: number;
  withoutAmount: number;
  flagged: number;
}

export function dashboardMetrics(data: GasData): DashboardMetrics {
  const confirmed = data.entries.filter((e) => e.status === "confirmed");
  const counts = queueCounts(data);
  return {
    totals: totalsOf(confirmed),
    byDay: data.week.days.map((day) => {
      const own = confirmed.filter((e) => e.day === day);
      const totals = totalsOf(own);
      return {
        day,
        amountRub: totals.amountRub,
        minutes: totals.minutes,
        revenue: totals.revenuePerHour,
      };
    }),
    activeBrigades: new Set(confirmed.map((e) => e.brigadeId)).size,
    activeObjects: new Set(confirmed.map((e) => e.objectId)).size,
    pending: counts.pending,
    clarify: counts.clarify,
    withoutAmount: confirmed.filter((e) => e.amountRub === null).length,
    flagged: data.entries.filter((e) => entryView(data, e).flags.length > 0).length,
  };
}

/**
 * Разрешённые объекты бригадира (ТЗ, п. 5.3; ADR-044, F4): объекты, где его бригада работала
 * или куда назначена, плюс явно закреплённые за ним. Остальные роли вводят по любому объекту.
 * Бригадир не видит 82 объекта списком: в боте MAX столько кнопок невозможно.
 */
export function allowedObjectIdsFor(
  data: Pick<GasData, "entries" | "assignments">,
  user: User,
): Set<string> | "all" {
  if (user.role !== "foreman" || !user.brigadeId) return "all";
  const ids = new Set<string>();
  for (const entry of data.entries) if (entry.brigadeId === user.brigadeId) ids.add(entry.objectId);
  for (const a of data.assignments)
    if (a.brigadeId === user.brigadeId) a.objectIds.forEach((id) => ids.add(id));
  if (user.allowedObjectIds !== "all") user.allowedObjectIds.forEach((id) => ids.add(id));
  return ids;
}

/** Объекты, по которым этому человеку разрешено вводить время (ТЗ, п. 5.3) */
export function allowedObjects(data: GasData): WorkObject[] {
  const actor = actorOf(data);
  if (!actor) return [];
  const allowed = allowedObjectIdsFor(data, actor);
  if (allowed === "all") return data.objects;
  return data.objects.filter((o) => allowed.has(o.id));
}

/** Объекты бригады «на сегодня»: первые кнопки бота. Порядок как в назначении */
export function dayObjects(
  data: Pick<GasData, "assignments" | "objects">,
  brigadeId: string,
  day: string,
): WorkObject[] {
  const ids =
    data.assignments.find((a) => a.brigadeId === brigadeId && a.day === day)?.objectIds ?? [];
  return ids.map((id) => data.objects.find((o) => o.id === id)).filter((o): o is WorkObject => !!o);
}

/** Занятые интервалы бригады за день: кнопки времени с ними недоступны (F4) */
export interface BusyInterval {
  id: string;
  number: string;
  start: number;
  end: number;
}

export function busyIntervals(
  data: Pick<GasData, "entries">,
  brigadeId: string,
  day: string,
  exceptId?: string,
): BusyInterval[] {
  return data.entries
    .filter(
      (e) =>
        e.brigadeId === brigadeId &&
        e.day === day &&
        e.id !== exceptId &&
        e.status !== "rejected" &&
        e.startMinutes !== null &&
        e.endMinutes !== null,
    )
    .map((e) => ({ id: e.id, number: e.number, start: e.startMinutes!, end: e.endMinutes! }))
    .sort((a, b) => a.start - b.start);
}

/** Интервал, с которым пересекается [start, end): первый найденный или null */
export function clashOf(busy: BusyInterval[], start: number, end: number): BusyInterval | null {
  return busy.find((b) => Math.min(end, b.end) - Math.max(start, b.start) > 0) ?? null;
}

/** Записи бригадира за день: его история в боте */
export function myEntries(data: GasData, day?: string): EntryView[] {
  const actor = actorOf(data);
  if (!actor) return [];
  return data.entries
    .filter((e) => (actor.brigadeId ? e.brigadeId === actor.brigadeId : e.createdBy === actor.id))
    .filter((e) => (day ? e.day === day : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((entry) => entryView(data, entry));
}
