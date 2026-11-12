/**
 * Рабочий контур для пилота на данных заказчика (ADR-069).
 *
 * - Пустая компания: снимок без демо-набора, с одним подразделением, правилом стоимости
 *   по умолчанию и первым администратором. С него начинаются импорт бригад, объектов и смет.
 * - Календарь: «сегодня» и неделя берутся из настоящей даты в часовом поясе компании.
 *   Неделя отчёта заказчика: понедельник–суббота, как в его файле. Назад календарь не идёт.
 * - Пользователь учёта времени заводится с тем же идентификатором, что сотрудник входа:
 *   сессия даёт идентификатор сотрудника, по нему сервер находит роль в учёте времени.
 */
import type { GasOpsSnapshot } from "@/ports/gas-ops";
import { DEFAULT_COMPANY_RULE } from "./work-cost";
import { DEFAULT_REVIEW_SETTINGS } from "./review-policy";
import type { Role, User } from "./model";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Дата `YYYY-MM-DD` в часовом поясе компании */
export function localDay(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shift(day: string, days: number): string {
  const at = Date.parse(`${day}T00:00:00Z`) + days * DAY_MS;
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * Неделя отчёта, в которую попадает день: понедельник–суббота. Воскресенье относится
 * к прошедшей неделе: смена в воскресенье редкость, и неделя ещё не сдана
 */
export function weekOf(day: string): GasOpsSnapshot["week"] {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 — воскресенье
  const fromMonday = weekday === 0 ? 6 : weekday - 1;
  const from = shift(day, -fromMonday);
  const days = Array.from({ length: 6 }, (_, i) => shift(from, i));
  return { from, to: days[5]!, days };
}

/**
 * Перевести календарь снимка на сегодняшний день. Возвращает тот же объект, если день
 * не изменился или часы ушли назад: прошедшее «сегодня» не возвращается
 */
export function advanceCalendar(snapshot: GasOpsSnapshot, today: string): GasOpsSnapshot {
  if (today <= snapshot.today) return snapshot;
  const week = weekOf(today);
  return { ...snapshot, today, week };
}

export interface PilotOwner {
  id: string;
  name: string;
}

/** Снимок пустой компании: только подразделение, правило по умолчанию и администратор */
export function emptyCompany(input: {
  today: string;
  groupName: string;
  owner: PilotOwner;
}): GasOpsSnapshot {
  const groupName = input.groupName.trim();
  if (!groupName) throw new Error("Название подразделения не может быть пустым.");
  return {
    today: input.today,
    week: weekOf(input.today),
    groups: [{ id: "grp-1", name: groupName, code: null, excelRow: null }],
    brigades: [],
    employees: [],
    objects: [],
    estimates: [],
    entries: [],
    reviews: [],
    audit: [],
    frames: [],
    assignments: [],
    users: [gasUser({ id: input.owner.id, name: input.owner.name, role: "admin" })],
    actorId: input.owner.id,
    estimateVersions: [],
    costRules: [DEFAULT_COMPANY_RULE],
    schedule: null,
    brigadeAvailability: [],
    reviewSettings: DEFAULT_REVIEW_SETTINGS,
    directoryUndo: null,
    finalChecks: [],
    reportIssues: [],
    crew: [],
    rates: [],
    periods: [],
    supply: { items: [], suppliers: [], requests: [], offers: [], receipts: [], limits: [] },
    docs: {
      participants: [],
      sheets: [],
      kinds: [],
      works: [],
      files: [],
      docs: [],
      registries: [],
      journal: [],
    },
  };
}

/** Роли, которых заводят в учёт времени на пилоте */
export const PILOT_ROLES = ["admin", "manager", "director", "foreman"] as const;
export type PilotRole = (typeof PILOT_ROLES)[number];

export function isPilotRole(value: string): value is PilotRole {
  return (PILOT_ROLES as readonly string[]).includes(value);
}

/** Роль сотрудника входа (таблица `employees`), соответствующая роли учёта времени */
export const EMPLOYEE_ROLE_FOR: Record<PilotRole, "manager" | "director" | "worker"> = {
  admin: "director",
  manager: "manager",
  director: "director",
  // Бригадир — не прораб ГАЙКИ: в основной системе он рабочий без её разделов
  foreman: "worker",
};

export function gasUser(input: {
  id: string;
  name: string;
  role: Role;
  brigadeId?: string | null;
}): User {
  return {
    id: input.id,
    name: input.name.trim(),
    role: input.role,
    brigadeId: input.brigadeId ?? null,
    allowedObjectIds: "all",
  };
}

/**
 * Добавить пользователя учёта времени. Бригадиру нужна существующая бригада: он вводит
 * время только за неё. Повтор идентификатора отклоняется: у сотрудника одна роль
 */
export function addGasUser(
  snapshot: GasOpsSnapshot,
  input: { id: string; name: string; role: PilotRole; brigadeName?: string | null },
): GasOpsSnapshot {
  if (!input.name.trim()) throw new Error("Укажите имя сотрудника.");
  if (snapshot.users.some((u) => u.id === input.id)) {
    throw new Error("Этот сотрудник уже заведён в учёте времени.");
  }
  let brigadeId: string | null = null;
  if (input.role === "foreman") {
    const name = (input.brigadeName ?? "").trim().toLowerCase();
    const brigade = snapshot.brigades.find((b) => b.name.trim().toLowerCase() === name);
    if (!brigade) {
      throw new Error(
        `Бригады «${input.brigadeName ?? ""}» нет в справочнике. Сначала загрузите бригады.`,
      );
    }
    brigadeId = brigade.id;
  }
  return {
    ...snapshot,
    users: [...snapshot.users, gasUser({ ...input, brigadeId })],
  };
}

/**
 * Бригада, за которую смотрят ввод менеджер и администратор: демо-бригада показа, если
 * она есть, иначе первая из справочника заказчика. Пустой справочник — null
 */
export function viewBrigadeId(
  brigades: readonly { id: string }[],
  preferred = "brg-1",
): string | null {
  return (brigades.find((b) => b.id === preferred) ?? brigades[0])?.id ?? null;
}
