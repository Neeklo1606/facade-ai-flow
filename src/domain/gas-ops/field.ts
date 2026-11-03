/**
 * Данные интерфейса бригадира (ADR-056; 1.2: «финансы бригадиру не отдаются ни в интерфейсе,
 * ни из серверной функции»). Это не фильтр поверх полного снимка на экране, а отдельная
 * выборка порта: в ней нет ни сумм, ни смет, ни ставок, ни чужих бригад. Поля перечислены
 * явно, поэтому новое денежное поле записи сюда само не попадёт.
 */
import { crewOn, type CrewMember } from "./crew";
import { ENTRY_STATUS_LABEL, type EntryChannel, type EntryStatus, type PersonTime } from "./model";
import { actorOf, allowedObjectIdsFor, dayObjects, type GasData } from "./view";
import { isDayLocked, type PeriodVersion } from "./week";

export interface FieldEntry {
  id: string;
  number: string;
  day: string;
  objectId: string;
  objectLabel: string;
  startMinutes: number | null;
  endMinutes: number | null;
  breakMinutes: number;
  minutes: number;
  headcount: number | null;
  people: PersonTime[] | null;
  note: string | null;
  status: EntryStatus;
  statusLabel: string;
  /** Вопрос менеджера, если запись на уточнении */
  question: string | null;
  channel: EntryChannel | null;
  createdAt: string;
  clientKey: string | null;
  /** Неделя закрыта: запись не меняется */
  locked: boolean;
}

export interface FieldSnapshot {
  today: string;
  yesterday: string;
  brigade: { id: string; name: string } | null;
  crew: { employeeId: string; name: string; role: CrewMember["role"] }[];
  /** Объекты бригады на сегодня: из графика или демо-назначений */
  todayObjects: { id: string; label: string; code: string }[];
  /** Все объекты, по которым бригадиру можно вносить время */
  allowedObjects: { id: string; label: string; code: string }[];
  entries: FieldEntry[];
}

export interface FieldInput {
  crew: readonly CrewMember[];
  periods: readonly PeriodVersion[];
  allowedObjectIds: Set<string> | "all";
}

/** Выборка для бригады. `brigadeId` — своя бригада бригадира; чужие записи сюда не попадают */
export function fieldSnapshot(
  data: GasData,
  brigadeId: string | null,
  input: FieldInput,
): FieldSnapshot {
  const index = data.week.days.indexOf(data.today);
  const yesterday = data.week.days[index - 1] ?? data.today;
  const brigade = data.brigades.find((b) => b.id === brigadeId) ?? null;
  const plain = (o: { id: string; label: string; code: string }) => ({
    id: o.id,
    label: o.label,
    code: o.code,
  });
  const allowed =
    input.allowedObjectIds === "all"
      ? data.objects
      : data.objects.filter((o) => (input.allowedObjectIds as Set<string>).has(o.id));
  const questionOf = (entryId: string) =>
    data.reviews.find((r) => r.entryId === entryId && r.action === "clarify")?.comment ?? null;

  return {
    today: data.today,
    yesterday,
    brigade: brigade ? { id: brigade.id, name: brigade.name } : null,
    crew: brigade
      ? crewOn(input.crew, brigade.id, data.today).map((m) => ({
          employeeId: m.employeeId,
          name: m.name,
          role: m.role,
        }))
      : [],
    todayObjects: brigade ? dayObjects(data, brigade.id, data.today).map(plain) : [],
    allowedObjects: allowed.map(plain),
    entries: brigade
      ? data.entries
          .filter((e) => e.brigadeId === brigade.id)
          .sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt))
          .map((e) => ({
            id: e.id,
            number: e.number,
            day: e.day,
            objectId: e.objectId,
            objectLabel: data.objects.find((o) => o.id === e.objectId)?.label ?? "Объект",
            startMinutes: e.startMinutes,
            endMinutes: e.endMinutes,
            breakMinutes: e.breakMinutes,
            minutes: e.minutes,
            headcount: e.headcount ?? null,
            people: e.people ?? null,
            note: e.note ?? null,
            status: e.status,
            statusLabel: ENTRY_STATUS_LABEL[e.status],
            question: e.status === "clarify" ? (e.comment ?? questionOf(e.id)) : null,
            channel: e.channel ?? null,
            createdAt: e.createdAt,
            clientKey: e.clientKey ?? null,
            locked: isDayLocked(input.periods, e.day),
          }))
      : [],
  };
}

/**
 * Выборка по текущей роли: бригадир получает только свою бригаду, что бы ни пришло
 * параметром; остальные смотрят бригаду, за которую открыли интерфейс. Одна функция
 * и для порта, и для экрана — правило не расходится
 */
export function fieldFor(
  data: GasData & { crew: CrewMember[]; periods: PeriodVersion[] },
  brigadeId?: string | null,
): FieldSnapshot {
  const actor = actorOf(data);
  const foreman = actor?.role === "foreman";
  return fieldSnapshot(data, foreman ? actor.brigadeId : (brigadeId ?? null), {
    crew: data.crew,
    periods: data.periods,
    allowedObjectIds: foreman ? allowedObjectIdsFor(data, actor) : "all",
  });
}

/**
 * Прошлая запись бригады до дня (финальный промт, 2.2): от неё форма берёт перерыв и число
 * людей по умолчанию. Черновики, отклонённые и записи без перерыва не в счёт; нет такой —
 * форма ставит 60 минут и состав бригады.
 */
export function lastEntryBefore(entries: readonly FieldEntry[], day: string): FieldEntry | null {
  return (
    entries
      // Перерыв 0 в выгрузке и наборе показа значит «не указан»: такие записи не образец
      .filter(
        (e) => e.day < day && e.status !== "draft" && e.status !== "rejected" && e.breakMinutes > 0,
      )
      .sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt))[0] ??
    null
  );
}

/**
 * «Как вчера» одной кнопкой: вчерашняя запись с рамкой смены на объект, который сегодня
 * снова по графику и по которому сегодня ещё ничего не внесено. Нет такой — кнопки нет.
 */
export function sameAsYesterday(input: {
  entries: readonly FieldEntry[];
  yesterday: string;
  today: string;
  todayObjectIds: readonly string[];
}): FieldEntry | null {
  const planned = new Set(input.todayObjectIds);
  const done = new Set(
    input.entries
      .filter((e) => e.day === input.today && e.status !== "rejected")
      .map((e) => e.objectId),
  );
  return (
    input.entries.find(
      (e) =>
        e.day === input.yesterday &&
        e.status !== "draft" &&
        e.status !== "rejected" &&
        e.startMinutes !== null &&
        e.endMinutes !== null &&
        !e.people?.length &&
        planned.has(e.objectId) &&
        !done.has(e.objectId),
    ) ?? null
  );
}
