/**
 * Порт газового направления (ADR-043): учёт фактического времени бригад и недельный отчёт.
 *
 * Интерфейс такой, каким станет будущий HTTP-API: экраны зовут только его, а не состояние
 * демонстрации. Поэтому замена демо-адаптера на сервер не переписывает интерфейс.
 */
import type {
  Assignment,
  AuditLog,
  Brigade,
  Employee,
  Estimate,
  Group,
  Review,
  Role,
  TimeEntry,
  User,
  WorkObject,
} from "@/domain/gas-ops/model";

export interface GasOpsSnapshot {
  /** «Сегодня» направления: в демонстрации это последний день недели отчёта */
  today: string;
  week: { from: string; to: string; days: string[] };
  groups: Group[];
  brigades: Brigade[];
  employees: Employee[];
  objects: WorkObject[];
  estimates: Estimate[];
  entries: TimeEntry[];
  reviews: Review[];
  audit: AuditLog[];
  frames: { brigadeId: string; employeeId: string | null; day: string; frame: string }[];
  /** Объекты бригад «на сегодня»: демо-назначения, в выгрузке заказчика их нет */
  assignments: Assignment[];
  users: User[];
  /** Кто сейчас в системе: выбирается на экране входа, настоящей проверки пароля нет */
  actorId: string;
}

export interface CreateEntryInput {
  day: string;
  brigadeId: string;
  employeeId: string | null;
  objectId: string;
  /** Как ввёл человек: «8:20» или «8.20» */
  start: string;
  end: string;
  breakMinutes: string | number;
  /** Отправить сразу на проверку или оставить черновиком */
  submit: boolean;
}

export interface UpdateEntryInput {
  id: string;
  start?: string | undefined;
  end?: string | undefined;
  breakMinutes?: string | number | undefined;
  objectId?: string | undefined;
  day?: string | undefined;
  /** Обязателен, когда правит проверяющий: правка без причины в журнал не идёт */
  comment?: string | undefined;
}

export interface ReviewInput {
  id: string;
  action: "confirm" | "reject" | "clarify";
  comment?: string | undefined;
}

/** Ошибка правил направления: код нужен интерфейсу, чтобы подсветить нужное поле */
export class GasOpsError extends Error {
  constructor(
    readonly code:
      | "bad-time"
      | "duplicate"
      | "overlap"
      | "no-object"
      | "not-allowed"
      | "not-found"
      | "already-reviewed"
      | "comment-required",
    message: string,
  ) {
    super(message);
    this.name = "GasOpsError";
  }
}

export interface GasOpsPort {
  snapshot(): Promise<GasOpsSnapshot>;
  /** Сменить роль: мок-вход без пароля, роль меняет меню и разрешённые действия */
  signIn(userId: string): Promise<GasOpsSnapshot>;
  createEntry(input: CreateEntryInput): Promise<TimeEntry>;
  updateEntry(input: UpdateEntryInput): Promise<TimeEntry>;
  submitEntry(id: string): Promise<TimeEntry>;
  review(input: ReviewInput): Promise<TimeEntry>;
  /** Ручная сумма по объекту без сметы: подтверждает менеджер (OPEN-QUESTION 4) */
  setEstimate(input: {
    objectId: string;
    amountRub: number;
    note?: string | undefined;
  }): Promise<Estimate>;
  /** Вернуть демонстрацию к исходному состоянию */
  reset(): Promise<GasOpsSnapshot>;
}

export type { Role };
