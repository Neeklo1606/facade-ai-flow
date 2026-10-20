/**
 * Газовое направление: учёт фактического времени бригад и недельный отчёт (ADR-043).
 *
 * Деньги здесь — целые рубли, а не копейки, как в остальной базе (docs/db/schema.md).
 * Так приходит отчёт заказчика: «44 847 ₽» без копеек, и сметные суммы он утверждает
 * тоже в рублях. Чтобы это не путалось с `fmtMoney(kopecks)`, у направления свой
 * форматтер `fmtRub` и своё имя поля — `amountRub`.
 */

/** Этапы проверки записи по ТЗ v1.0, п. 5.8 */
export type EntryStatus = "draft" | "pending" | "confirmed" | "rejected" | "clarify";

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  draft: "Черновик",
  pending: "Ожидает проверки",
  confirmed: "Подтверждено",
  rejected: "Отклонено",
  clarify: "Требует уточнения",
};

/** Откуда взялась запись: из фактического отчёта заказчика или придумана для демонстрации */
export type DataSource = "fact-report" | "mock";

export interface Group {
  id: string;
  /** «1. СТАЛЬНЫЕ» — подразделение в отчёте заказчика */
  name: string;
  code: string | null;
  excelRow: number | null;
}

export interface Brigade {
  id: string;
  groupId: string;
  name: string;
  code: string;
  excelRow: number | null;
  source: DataSource;
}

export interface Employee {
  id: string;
  brigadeId: string;
  name: string;
  /** Бригадир вводит время за бригаду; остальные только числятся в составе */
  isLead: boolean;
  /** Идентификатор в мессенджере MAX. Канал не подключён, поэтому значение помечено как имитация */
  maxId: string | null;
  excelRow: number | null;
  source: DataSource;
}

/** Объект работ. Имя `Object` занято языком, поэтому `WorkObject` (ТЗ, п. 6) */
export interface WorkObject {
  id: string;
  /** Анонимная подпись: населённый пункт, демо-улица, вид работ */
  label: string;
  settlement: string | null;
  workType: string | null;
  /** Адрес не единственный ключ: у объекта есть свой номер (ТЗ, п. 6) */
  code: string;
  source: DataSource;
}

/** Подтверждённая стоимость работ объекта без материалов (ТЗ, п. 6) */
export interface Estimate {
  id: string;
  objectId: string;
  version: number;
  /** Стоимость работ без материалов, целые рубли */
  amountRub: number;
  status: "confirmed" | "manual-pending" | "missing";
  /** Откуда взята сумма: смета, ручной ввод менеджера, нет источника */
  origin: "estimate" | "manual" | "none";
  confirmedBy: string | null;
  confirmedAt: string | null;
  note: string | null;
  source: DataSource;
}

/** Факт времени по объекту за день */
export interface TimeEntry {
  id: string;
  /** Номер записи, который бригадир видит в боте: «ГЗ-00042» */
  number: string;
  day: string;
  brigadeId: string;
  employeeId: string | null;
  objectId: string;
  /** Минуты от полуночи; null — запись пришла из выгрузки без рамки смены */
  startMinutes: number | null;
  endMinutes: number | null;
  breakMinutes: number;
  /** Эффективные минуты: именно они считаются, а не округлённые часы */
  minutes: number;
  /** Подтверждённое начисление по объекту за этот день; null — суммы нет */
  amountRub: number | null;
  status: EntryStatus;
  createdBy: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  comment: string | null;
  source: DataSource;
  /** Доходность часа из файла заказчика — для сверки расчёта с выгрузкой */
  revenueInFile?: number | null;
  excelRow?: number | null;
}

/**
 * Назначение бригады на день: какие объекты у неё «на сегодня» (ADR-044, F3–F4). В выгрузке
 * заказчика назначений нет, поэтому все они демо-данные и помечены `source: "mock"`.
 */
export interface Assignment {
  brigadeId: string;
  day: string;
  objectIds: string[];
  source: DataSource;
}

export interface Review {
  id: string;
  entryId: string;
  action: "confirm" | "reject" | "correct" | "clarify";
  actor: string;
  at: string;
  comment: string | null;
  /** Что именно поправили: поле, было, стало */
  changes: { field: string; from: string; to: string }[];
}

export interface AuditLog {
  id: string;
  at: string;
  actor: string;
  action: string;
  entityId: string;
  detail: string;
}

export type Role = "admin" | "manager" | "foreman" | "director";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Администратор",
  manager: "Менеджер проверки",
  foreman: "Бригадир",
  director: "Руководитель",
};

export interface User {
  id: string;
  name: string;
  role: Role;
  /** Бригада, за которую вводит время бригадир */
  brigadeId: string | null;
  /** Объекты, по которым бригадиру разрешено вводить время */
  allowedObjectIds: string[] | "all";
}

/** Признак, который видит проверяющий: пересечение, дубль, аномалия, нет суммы */
export type EntryFlag =
  "no-amount" | "overlap" | "duplicate" | "high-rate" | "multi-day-object" | "no-estimate";

export const FLAG_LABEL: Record<EntryFlag, string> = {
  "no-amount": "Нет суммы",
  overlap: "Пересечение времени",
  duplicate: "Возможный дубль",
  "high-rate": "Аномальная доходность",
  "multi-day-object": "Объект на несколько дней",
  "no-estimate": "Нет подтверждённой стоимости",
};
