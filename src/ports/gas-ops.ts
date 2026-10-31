/**
 * Порт газового направления (ADR-043): учёт фактического времени бригад и недельный отчёт.
 *
 * Интерфейс такой, каким станет будущий HTTP-API: экраны зовут только его, а не состояние
 * демонстрации. Поэтому замена демо-адаптера на сервер не переписывает интерфейс.
 */
import type {
  EntryChannel,
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
import type { ParsedWorkbook } from "@/domain/gas-ops/estimate-labels";
import type { CostRule, CostRuleTerm, EstimateVersion } from "@/domain/gas-ops/work-cost";
import type {
  BrigadeAvailability,
  BrigadeWeekStatus,
  ScheduleRow,
} from "@/domain/gas-ops/schedule";
import type { FinalCheck, ReviewMode, ReviewSettings } from "@/domain/gas-ops/review-policy";
import type { CrewMember, PersonInput, Rate } from "@/domain/gas-ops/crew";
import type { FieldSnapshot } from "@/domain/gas-ops/field";
import type { Acceptance, PeriodVersion } from "@/domain/gas-ops/week";
import type { SupplyState } from "@/domain/gas-ops/supply";
import type { DocsState } from "@/domain/gas-ops/exec-docs";

/** Недельный график объектов, применённый из файла заказчика (ADR-053, 4) */
export interface WeekSchedule {
  rows: ScheduleRow[];
  fileName: string;
  appliedAt: string;
  appliedBy: string;
}

/** Сданный отчёт недели: что вошло и не устарел ли он после смены сметы (ADR-053, 3) */
export interface ReportIssue {
  id: string;
  weekFrom: string;
  issuedAt: string;
  issuedBy: string;
  totalRub: number;
  objectIds: string[];
  /** Отчёт требует обновления: после сдачи подтверждена новая версия сметы его объекта */
  stale: boolean;
  staleReason: string | null;
}

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
  /** Загруженные сметы по версиям (ADR-053) */
  estimateVersions: EstimateVersion[];
  /** Правило состава стоимости работ: компании и переопределения объектов */
  costRules: CostRule[];
  /** Недельный график из файла заказчика; null — ещё не загружали */
  schedule: WeekSchedule | null;
  /** Отметки бригад «работает / в отпуске» по неделям */
  brigadeAvailability: BrigadeAvailability[];
  reviewSettings: ReviewSettings;
  finalChecks: FinalCheck[];
  reportIssues: ReportIssue[];
  /** Состав бригад с периодами (ADR-056) */
  crew: CrewMember[];
  /** Ставки с периодами; пусто — стоимость труда скрыта с меткой «Ставки не заданы» */
  rates: Rate[];
  /** Версии закрытых недель: v1, после переоткрытия v2 */
  periods: PeriodVersion[];
  /** Снабжение (ADR-057): номенклатура, поставщики, заявки, предложения, приёмки, лимиты */
  supply: SupplyState;
  /** Исполнительная документация (ADR-058) */
  docs: DocsState;
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
  /** Сколько людей работало; null — состав не указан */
  headcount?: number | null | undefined;
  /** «У сотрудников разное время»: тогда начало и окончание записи — рамка строк */
  people?: PersonInput[] | null | undefined;
  /** Ключ отправки с телефона: повтор с ним возвращает ту же запись, дубля нет */
  clientKey?: string | null | undefined;
  channel?: EntryChannel | undefined;
  note?: string | null | undefined;
}

export interface UpdateEntryInput {
  id: string;
  start?: string | undefined;
  end?: string | undefined;
  breakMinutes?: string | number | undefined;
  objectId?: string | undefined;
  day?: string | undefined;
  headcount?: number | null | undefined;
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
      | "comment-required"
      | "nothing-to-undo"
      | "estimate-not-ready"
      | "mode-unavailable"
      | "final-check-required"
      | "period-closed"
      | "close-blocked",
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
  /**
   * Отменить последнее решение проверки по записи (тост «Отменить», 6 секунд): запись
   * возвращается в прежний статус и с прежней суммой, решение убирается из истории,
   * в журнал действий пишется отмена. Исправление времени так не отменяется.
   */
  undoReview(id: string): Promise<TimeEntry>;
  /** Ручная сумма по объекту без сметы: подтверждает менеджер (OPEN-QUESTION 4) */
  setEstimate(input: {
    objectId: string;
    amountRub: number;
    note?: string | undefined;
  }): Promise<Estimate>;
  /** Загрузить разобранную смету новой версией. Файл в состояние не кладётся, только итоги */
  addEstimateVersion(input: {
    parsed: ParsedWorkbook;
    fileName: string;
    objectId: string | null;
  }): Promise<EstimateVersion>;
  /** Привязать версию к объекту: подсказку подтверждает человек */
  linkEstimateVersion(input: { id: string; objectId: string }): Promise<EstimateVersion>;
  /** Сметчик проверил замечания разбора */
  reviewEstimateIssues(id: string): Promise<EstimateVersion>;
  /**
   * Подтвердить версию: стоимость объекта по правилу, пересчёт неподтверждённых записей,
   * пометка сданных отчётов «требует обновления»
   */
  confirmEstimateVersion(id: string): Promise<{
    version: EstimateVersion;
    estimate: Estimate;
    changedEntries: number;
    staleReports: number;
  }>;
  /** Подтвердить правило состава: objectId null — для компании */
  confirmCostRule(input: { objectId: string | null; terms: CostRuleTerm[] }): Promise<CostRule>;
  /** Применить недельный график; возвращает прежний для отмены */
  applySchedule(input: { rows: ScheduleRow[]; fileName: string }): Promise<WeekSchedule | null>;
  /** Отменить применение графика: вернуть прежний (тост 6 секунд) */
  restoreSchedule(previous: WeekSchedule | null): Promise<void>;
  setBrigadeWeek(input: {
    brigadeId: string;
    weekFrom: string;
    status: BrigadeWeekStatus;
  }): Promise<BrigadeAvailability[]>;
  setReviewSettings(input: { mode: ReviewMode; thresholdPercent: number }): Promise<ReviewSettings>;
  /** Итоговая проверка: подтверждение записей без ручного решения одним действием */
  finalCheck(): Promise<FinalCheck>;
  /** Сдать отчёт недели: только после итоговой проверки */
  issueReport(): Promise<ReportIssue>;
  /**
   * Выборка бригадира: своя бригада, без сумм, смет и ставок (1.2). Другие роли получают
   * выборку бригады, за которую смотрят
   */
  fieldSnapshot(brigadeId?: string | undefined): Promise<FieldSnapshot>;
  /** Ответ бригадира на вопрос «На уточнении»: запись снова ждёт проверки */
  answerClarify(input: { id: string; text: string }): Promise<TimeEntry>;
  /** Закрыть неделю: версия v1 (после переоткрытия v2) с копией подтверждённых записей */
  closeWeek(input: { accepted: Acceptance[] }): Promise<PeriodVersion>;
  /** Переоткрыть закрытую неделю с причиной: версия остаётся, следующее закрытие даст новую */
  reopenWeek(input: { reason: string }): Promise<PeriodVersion>;
  /** Ставка с периодом: на человека или на бригаду */
  setRate(input: {
    employeeId: string | null;
    brigadeId: string;
    rubPerHour: number;
    from: string;
  }): Promise<Rate>;
  /** Добавить человека в состав с даты */
  addCrewMember(input: { brigadeId: string; name: string; from: string }): Promise<CrewMember>;
  /** Вывести из состава: последний день включительно */
  endCrewMember(input: { id: string; to: string }): Promise<CrewMember>;
  /** Вернуть демонстрацию к исходному состоянию */
  reset(): Promise<GasOpsSnapshot>;
}

export type { Role };
