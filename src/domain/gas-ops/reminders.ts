/**
 * Напоминания и сводки (ADR-061, 13; раздел 5 документа табеля): кому что напомнить на момент T.
 * Вместо обзвона бригадиров: после времени напоминания бригадир, у которого по графику нет
 * записи за день, получает сообщение; бригадир с записью на уточнении — вопрос; менеджер —
 * сводку дня. Отправка не здесь: её делает порт OutboundMessenger.
 */
import { coverage, type Expectation } from "./week";
import type { Brigade, TimeEntry, User, WorkObject } from "./model";

export type ReminderKind = "missing" | "clarify" | "summary";

export interface ReminderLink {
  label: string;
  to: string;
}

export interface Reminder {
  /** День, вид и получатель: повтор с тем же ключом не отправляется */
  key: string;
  day: string;
  kind: ReminderKind;
  userId: string;
  text: string;
  links: ReminderLink[];
}

export interface ReminderInput {
  /** Момент проверки, местное время: «2026-10-03T18:05» */
  at: string;
  /** Время напоминания из «Подключений»: «18:00» */
  time: string;
  /** Ожидания недели: график заказчика или демо-назначения (`expectations`) */
  expected: readonly Expectation[];
  entries: readonly TimeEntry[];
  users: readonly Pick<User, "id" | "name" | "role" | "brigadeId">[];
  brigades: readonly Pick<Brigade, "id" | "name">[];
  objects: readonly Pick<WorkObject, "id" | "label">[];
}

const minutesOf = (clock: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return null;
  const value = Number(match[1]) * 60 + Number(match[2]);
  return value < 24 * 60 ? value : null;
};

const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** Сводка читается в одном сообщении: три названия и «и ещё N» */
const names = (list: string[]) =>
  list.length > 3 ? `${list.slice(0, 3).join(", ")} и ещё ${list.length - 3}` : list.join(", ");

/**
 * Что отправить на момент `at`. До времени напоминания — ничего. Бригада без бригадира
 * в системе не теряется: она попадает в сводку менеджера отдельной строкой
 */
export function remindersAt(input: ReminderInput): Reminder[] {
  const day = input.at.slice(0, 10);
  const now = minutesOf(input.at.slice(11, 16));
  const due = minutesOf(input.time);
  if (now === null || due === null || now < due) return [];

  const brigadeName = (id: string) => input.brigades.find((b) => b.id === id)?.name ?? "Бригада";
  const objectLabel = (id: string) => input.objects.find((o) => o.id === id)?.label ?? "объект";
  const foremanOf = (brigadeId: string) =>
    input.users.find((u) => u.role === "foreman" && u.brigadeId === brigadeId) ?? null;

  const { missing } = coverage(
    input.expected.filter((x) => x.day === day),
    input.entries,
  );
  const missingBy = new Map<string, Expectation[]>();
  for (const x of missing) missingBy.set(x.brigadeId, [...(missingBy.get(x.brigadeId) ?? []), x]);

  const list: Reminder[] = [];
  const orphans: string[] = [];
  for (const [brigadeId, items] of missingBy) {
    const foreman = foremanOf(brigadeId);
    if (!foreman) {
      orphans.push(brigadeName(brigadeId));
      continue;
    }
    const objects = items.map((x) => objectLabel(x.objectId));
    list.push({
      key: `${day}|missing|${foreman.id}`,
      day,
      kind: "missing",
      userId: foreman.id,
      text: `Нет записи времени за ${shortDay(day)}: ${objects.join("; ")}. Внесите время, пока помните.`,
      links: [{ label: "Внести время", to: "/gas/foreman" }],
    });
  }

  const clarify = input.entries.filter((e) => e.status === "clarify");
  const clarifyBy = new Map<string, TimeEntry[]>();
  for (const e of clarify) clarifyBy.set(e.brigadeId, [...(clarifyBy.get(e.brigadeId) ?? []), e]);
  for (const [brigadeId, items] of clarifyBy) {
    const foreman = foremanOf(brigadeId);
    if (!foreman) continue;
    list.push({
      key: `${day}|clarify|${foreman.id}`,
      day,
      kind: "clarify",
      userId: foreman.id,
      text: `Менеджер ждёт ответа по ${items.length === 1 ? "записи" : "записям"} ${items.map((e) => e.number).join(", ")}.`,
      links: [{ label: "Ответить", to: "/gas/foreman" }],
    });
  }

  const pending = input.entries.filter((e) => e.status === "pending").length;
  const parts: string[] = [];
  if (missingBy.size)
    parts.push(
      `нет записи у бригад: ${missingBy.size} (${names([...missingBy.keys()].map(brigadeName))})`,
    );
  if (orphans.length) parts.push(`без бригадира в системе, напоминание не ушло: ${names(orphans)}`);
  if (pending) parts.push(`ждут проверки: ${pending}`);
  if (clarify.length) parts.push(`на уточнении: ${clarify.length}`);
  if (parts.length) {
    for (const manager of input.users.filter((u) => u.role === "manager"))
      list.push({
        key: `${day}|summary|${manager.id}`,
        day,
        kind: "summary",
        userId: manager.id,
        text: `Сводка за ${shortDay(day)}: ${parts.join("; ")}.`,
        links: [
          { label: "Проверка", to: "/gas/moderation" },
          { label: "Неделя", to: "/gas/week" },
        ],
      });
  }
  return list;
}

/** Ещё не отправленные: повторная проверка в тот же день не шлёт то же сообщение */
export function unsent(list: readonly Reminder[], sentKeys: ReadonlySet<string>): Reminder[] {
  return list.filter((r) => !sentKeys.has(r.key));
}
