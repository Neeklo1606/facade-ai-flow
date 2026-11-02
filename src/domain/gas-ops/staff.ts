/**
 * «Сотрудники» (ADR-061, 12; раздел 4.7, образец ПТО Онлайн): одна таблица людей — состав
 * бригад с периодами и пользователи офиса. Роль в системе — у того, у кого есть вход.
 * Последняя активность — по записям и журналу действий, а не выдумана.
 */
import { CREW_ROLE_LABEL, type CrewMember } from "./crew";
import {
  ROLE_LABEL,
  type AuditLog,
  type Brigade,
  type Employee,
  type Role,
  type TimeEntry,
  type User,
} from "./model";

export interface StaffRow {
  id: string;
  name: string;
  position: string;
  brigadeId: string | null;
  brigadeName: string | null;
  /** Вход в систему: пользователь и его роль; null — входа нет */
  userId: string | null;
  role: Role | null;
  /** Идентификатор MAX; канал не подключён, значение из демо-данных */
  maxId: string | null;
  /** Состоит в бригаде сегодня (для людей офиса — всегда) */
  active: boolean;
  /** Строка состава бригады: по ней деактивируют */
  crewId: string | null;
  /** Последний день в составе, если человека деактивировали; null — состоит без срока */
  until: string | null;
  lastActivity: string | null;
  source: "fact-report" | "mock";
}

export interface StaffInput {
  crew: readonly CrewMember[];
  users: readonly User[];
  employees: readonly Employee[];
  brigades: readonly Brigade[];
  entries: readonly TimeEntry[];
  audit: readonly AuditLog[];
  today: string;
}

const latest = (values: (string | null | undefined)[]): string | null =>
  values
    .filter((v): v is string => !!v)
    .sort()
    .at(-1) ?? null;

/** Бригадир-пользователь бригады — тот же человек, что бригадир в её составе */
function userOfMember(member: CrewMember, users: readonly User[]): User | null {
  if (member.role !== "lead") return null;
  return users.find((u) => u.brigadeId === member.brigadeId && u.role === "foreman") ?? null;
}

export function staffRows(input: StaffInput): StaffRow[] {
  const linked = new Set<string>();
  const activityOf = (userId: string | null, employeeId: string | null) =>
    latest([
      ...input.entries
        .filter(
          (e) => (userId && e.createdBy === userId) || (employeeId && e.employeeId === employeeId),
        )
        .map((e) => e.createdAt),
      ...(userId ? input.audit.filter((a) => a.actor === userId).map((a) => a.at) : []),
    ]);

  const crewRows: StaffRow[] = input.crew.map((member) => {
    const user = userOfMember(member, input.users);
    if (user) linked.add(user.id);
    const employee = input.employees.find((e) => e.id === member.employeeId);
    const active =
      (member.from === null || member.from <= input.today) &&
      (member.to === null || member.to >= input.today);
    return {
      id: member.id,
      name: member.name,
      position: CREW_ROLE_LABEL[member.role],
      brigadeId: member.brigadeId,
      brigadeName: input.brigades.find((b) => b.id === member.brigadeId)?.name ?? null,
      userId: user?.id ?? null,
      role: user?.role ?? null,
      maxId: employee?.maxId ?? null,
      active,
      crewId: member.id,
      until: member.to,
      lastActivity: activityOf(user?.id ?? null, member.employeeId),
      source: member.source,
    };
  });

  // Люди офиса: вход есть, в составе бригад их нет
  const officeRows: StaffRow[] = input.users
    .filter((u) => !linked.has(u.id) && !(u.role === "foreman" && u.brigadeId))
    .map((user) => ({
      id: user.id,
      name: user.name,
      position: ROLE_LABEL[user.role],
      brigadeId: null,
      brigadeName: null,
      userId: user.id,
      role: user.role,
      maxId: null,
      active: true,
      crewId: null,
      until: null,
      lastActivity: activityOf(user.id, null),
      source: "mock" as const,
    }));

  return [...officeRows, ...crewRows];
}

/**
 * Приглашение в MAX для демо: код из идентификатора сотрудника и ссылка с ним. Канал не
 * подключён — экран пишет это рядом, ничего не отправляется
 */
export function inviteOf(rowId: string): { code: string; link: string } {
  let hash = 2166136261;
  for (const char of rowId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const code = String(hash % 1_000_000).padStart(6, "0");
  // Имени бота ещё нет: ссылка показывает форму, а не ведёт в чужой аккаунт
  return { code, link: `https://max.ru/<бот компании>?start=${code}` };
}
