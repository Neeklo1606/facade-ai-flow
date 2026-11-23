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
import type {
  EstimateFile,
  IntakeOutcome,
  ObjectSection,
  PressureMode,
} from "@/domain/gas-ops/estimate-intake";
import type { EstimateAddress } from "@/domain/gas-ops/estimate-labels";
import type {
  CorrectionTarget,
  CostRule,
  CostRuleTerm,
  EstimateVersion,
} from "@/domain/gas-ops/work-cost";
import type {
  DirectoryKind,
  DirectoryRow,
  DirectoryUndo,
  Skipped,
} from "@/domain/gas-ops/directory-import";
import type {
  BrigadeAvailability,
  BrigadeWeekStatus,
  ScheduleRow,
} from "@/domain/gas-ops/schedule";
import type { FinalCheck, ReviewMode, ReviewSettings } from "@/domain/gas-ops/review-policy";
import type {
  AccrualDecision,
  AccrualMode,
  SectionAssignment,
  SectionProgress,
} from "@/domain/gas-ops/section-accrual";
import type { CrewMember, PersonInput, Rate } from "@/domain/gas-ops/crew";
import type { FieldSnapshot } from "@/domain/gas-ops/field";
import type { Acceptance, PeriodVersion } from "@/domain/gas-ops/week";
import type { SupplyState } from "@/domain/gas-ops/supply";
import type { DocsState } from "@/domain/gas-ops/exec-docs";
import type { CleanupCounts } from "@/domain/gas-ops/cleanup";

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

/** Итог импорта справочника: «добавлено N, обновлено M, пропущено K с причинами» */
export interface DirectoryImportReport {
  added: number;
  updated: number;
  skipped: Skipped[];
  /** Импорт можно отменить этим номером (решение владельца 2); null — менять было нечего */
  undoId: string | null;
}

/** Итог смены правила: что пересчитано и где посчитать нельзя */
export interface CostRuleChange {
  /** Действующее правило уровня после смены; null — правило объекта снято */
  rule: CostRule | null;
  /** Объекты, у которых сменилась стоимость */
  changedObjects: number;
  /** Неподтверждённые записи с новой суммой */
  changedEntries: number;
  /** Объекты с подтверждённой сметой, где нет строки правила: стоимость не менялась */
  missingObjects: number;
  staleReports: number;
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
  /** Файлы папки смет (ADR-077); нет ключа — снимок до папки */
  estimateFiles?: EstimateFile[];
  /** Разделы объектов из прикреплённых смет (ADR-077) */
  objectSections?: ObjectSection[];
  /** Назначения разделов бригадам на период (ADR-078) */
  sectionAssignments?: SectionAssignment[];
  /** История доли выполнения разделов (ADR-078) */
  sectionProgress?: SectionProgress[];
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
  /** Последний импорт справочников для отмены тостом (ADR-062); нет — отменять нечего */
  directoryUndo?: DirectoryUndo<Brigade, Employee, CrewMember, Rate> | null;
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
  /** Раздел сметы (ADR-078): один назначенный подставляется сам, из нескольких выбирают */
  sectionKey?: string | null | undefined;
}

export interface UpdateEntryInput {
  id: string;
  start?: string | undefined;
  end?: string | undefined;
  breakMinutes?: string | number | undefined;
  objectId?: string | undefined;
  day?: string | undefined;
  headcount?: number | null | undefined;
  sectionKey?: string | null | undefined;
  /** Обязателен, когда правит проверяющий: правка без причины в журнал не идёт */
  comment?: string | undefined;
}

/** Файл папки смет на входе порта: опись и разбор; байты остаются в хранилище сервера */
export interface IntakeFileInput {
  sha256: string;
  name: string;
  size: number;
  storagePath: string | null;
  /** null — файл не прочитан как Excel, причина в `error` */
  parsed: ParsedWorkbook | null;
  error?: string | null | undefined;
}

export interface ReviewInput {
  id: string;
  action: "confirm" | "reject" | "clarify";
  comment?: string | undefined;
  /**
   * Доля и начисление раздела при подтверждении (ADR-078): нет — предложенная доля.
   * Ручное начисление — с причиной
   */
  accrual?: AccrualDecision | undefined;
}

export interface AssignSectionInput {
  objectId: string;
  sectionKey: string;
  brigadeId: string;
  from: string;
  to: string | null;
}

/** Ошибка правил направления: код нужен интерфейсу, чтобы подсветить нужное поле */
export class GasOpsError extends Error {
  constructor(
    readonly code:
      | "no-section"
      | "section-required"
      | "accrual"
      | "bad-period"
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
      | "close-blocked"
      | "rule-invalid"
      | "rule-changed"
      | "same-person",
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
  /**
   * Вернуть запись, принятую системой без менеджера, в очередь проверки (финальный промт, 1.2).
   * Доступно до закрытия недели; запись снова ждёт решения человека.
   */
  undoAutoAccept(id: string): Promise<TimeEntry>;
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
  /**
   * Отменить импорт сметы (ADR-061, 12): неподтверждённая версия удаляется. Подтверждённую
   * не удалить: по ней уже посчитана стоимость объекта
   */
  discardEstimateVersion(id: string): Promise<void>;
  /** Сменить роль пользователя (ADR-061, 12): делает администратор, себе роль не меняет */
  setUserRole(input: { userId: string; role: Role }): Promise<User>;
  /** Привязать версию к объекту: подсказку подтверждает человек. Разделы пишутся в объект */
  linkEstimateVersion(input: {
    id: string;
    objectId: string;
    pressureMode?: PressureMode | undefined;
  }): Promise<EstimateVersion>;
  /** Сметчик проверил замечания разбора */
  reviewEstimateIssues(id: string): Promise<EstimateVersion>;
  /**
   * Поправить значение разбора до подтверждения (ADR-066): итог, раздел или строку ниже
   * «ВСЕГО». Основание обязательно, «было» сохраняется, правка пишется в журнал
   */
  correctEstimateValue(input: {
    id: string;
    target: CorrectionTarget;
    kopecks: number;
    note: string;
  }): Promise<EstimateVersion>;
  /**
   * Подтвердить версию: стоимость объекта по правилу, пересчёт неподтверждённых записей,
   * пометка сданных отчётов «требует обновления»
   */
  confirmEstimateVersion(id: string): Promise<{
    version: EstimateVersion;
    estimate: Estimate;
    /** Записи, получившие новую сумму (F4: и подтверждённые без суммы) */
    changedEntries: number;
    /** Непроверенные без суммы: стоимость придёт при проверке */
    waitingEntries: number;
    /** Записи закрытой недели: не менялись */
    lockedEntries: number;
    /** Проверенные с суммой: сумма не менялась, сданный отчёт помечается */
    keptEntries: number;
    staleReports: number;
  }>;
  /**
   * Подтвердить действующую редакцию правила: objectId null — для компании. `terms` — то,
   * что видел человек: правило успело смениться — отказ, а не подтверждение чужой редакции
   */
  confirmCostRule(input: { objectId: string | null; terms: CostRuleTerm[] }): Promise<CostRule>;
  /**
   * Новая редакция правила из конструктора (ADR-062, F2): статус «Требует согласования»,
   * пересчёт стоимости объектов с подтверждённой сметой и их неподтверждённых записей
   */
  saveCostRule(input: { objectId: string | null; terms: CostRuleTerm[] }): Promise<CostRuleChange>;
  /** Отмена редакции (тост 6 секунд): вернуть правило до неё и пересчитать обратно */
  undoCostRule(input: { objectId: string | null; revision: number }): Promise<CostRuleChange>;
  /**
   * Снять своё правило объекта (ADR-062, решение владельца 2): объект снова считается
   * по правилу компании, стоимость пересчитывается, в журнал пишется снятие
   */
  resetObjectRule(input: { objectId: string }): Promise<CostRuleChange>;
  /** Применить недельный график; возвращает прежний для отмены */
  applySchedule(input: { rows: ScheduleRow[]; fileName: string }): Promise<WeekSchedule | null>;
  /** Отменить применение графика: вернуть прежний (тост 6 секунд) */
  restoreSchedule(previous: WeekSchedule | null): Promise<void>;
  setBrigadeWeek(input: {
    brigadeId: string;
    weekFrom: string;
    status: BrigadeWeekStatus;
  }): Promise<BrigadeAvailability[]>;
  setReviewSettings(input: {
    mode: ReviewMode;
    thresholdPercent: number;
    /** Нет — прежнее значение */
    secondRuleApprover?: boolean | undefined;
    /** Доля выборочной проверки при автопилоте, проценты; нет — прежнее (ADR-070) */
    samplePercent?: number | undefined;
    /** Менеджер видел, что совпадение ниже порога, и включает автопилот сам */
    acceptBelowTarget?: boolean | undefined;
  }): Promise<ReviewSettings>;
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
  /**
   * Импорт справочника из Excel (ADR-062, F3): строки файла, план порт считает сам.
   * Бригады и сотрудников ведёт менеджер, ставки — руководитель
   */
  importDirectory(input: {
    kind: DirectoryKind;
    rows: DirectoryRow[];
    skipped?: Skipped[] | undefined;
  }): Promise<DirectoryImportReport>;
  /**
   * Отменить импорт справочника (ADR-062, решение владельца 2): справочники возвращаются
   * к состоянию до импорта, в журнал пишется отмена. Отказ, если после импорта их меняли
   */
  undoDirectoryImport(input: { id: string }): Promise<{ added: number; updated: number }>;
  /** Добавить объект вручную (F3): адрес, свой номер, вид работ */
  addObject(input: { label: string; code: string; workType: string | null }): Promise<WorkObject>;
  /** Добавить бригаду вручную (ADR-066): название уникально, подразделение из справочника */
  addBrigade(input: { name: string; groupId: string; phone: string | null }): Promise<Brigade>;
  /**
   * Папка смет (ADR-077): принять разобранный файл. Тот же хеш — «Уже загружена», версии нет.
   * Иначе файл и версия сметы; другой файл известного объекта (тот же номер сметы) — новая
   * версия этого объекта. Стоимость по-прежнему подтверждает человек
   */
  intakeEstimateFile(input: IntakeFileInput): Promise<IntakeOutcome>;
  /** Повторный разбор файла: неподтверждённая версия получает новый разбор */
  reparseEstimateFile(input: {
    fileId: string;
    parsed: ParsedWorkbook | null;
    error?: string | null | undefined;
  }): Promise<IntakeOutcome>;
  /**
   * Создать объект из сметы: поля проверил человек. Объект с тем же адресом или номером уже
   * есть — отказ с подсказкой прикрепить. Версия прикрепляется, разделы пишутся в объект
   */
  /** Назначить раздел сметы объекта бригаде на период (ADR-078) */
  assignSection(input: AssignSectionInput): Promise<SectionAssignment>;
  /** Снять назначение: записи, уже отправленные по разделу, остаются */
  unassignSection(id: string): Promise<{ id: string }>;
  /** Ответ бригадира «Работы по разделу закончены?»: null — пропустить */
  setSectionDone(input: { entryId: string; done: boolean | null }): Promise<TimeEntry>;
  /** Режим начисления: по доле раздела или по времени всей сметы */
  setAccrualMode(mode: AccrualMode): Promise<ReviewSettings>;
  createObjectFromEstimate(input: {
    versionId: string;
    label: string;
    code: string;
    workType: string | null;
    address: EstimateAddress | null;
    estimateNumber: string | null;
    pressureMode?: PressureMode | undefined;
  }): Promise<WorkObject>;
  /**
   * Удалить неподтверждённую смету вместе с её файлами (ADR-088): тот же файл можно
   * загрузить заново. Подтверждённая удаляется только вместе с объектом
   */
  deleteEstimate(versionId: string): Promise<CleanupCounts>;
  /** Удалить объект и всё, что на него ссылается. Записи закрытой недели не удаляются */
  deleteObject(objectId: string): Promise<CleanupCounts>;
  /** Изменить бригаду: название (уникально), подразделение, телефон. Код не меняется */
  updateBrigade(input: {
    id: string;
    name: string;
    groupId: string;
    phone: string | null;
  }): Promise<Brigade>;
  /** Удалить бригаду без записей времени вместе с составом, ставками и назначениями */
  deleteBrigade(id: string): Promise<{ id: string }>;
  /** Очистить рабочие данные: справочники и пользователи остаются (ADR-088) */
  clearData(): Promise<CleanupCounts>;
  /** Вернуть демонстрацию к исходному состоянию */
  reset(): Promise<GasOpsSnapshot>;
}

/**
 * Имена методов порта по порядку объявления: по ним собирается серверная реализация
 * (`adapters/gas-ops/remote.ts`) и таблица доступа сервера (`api/gas-ops-server.ts`)
 */
export const GAS_OPS_METHODS = [
  "snapshot",
  "signIn",
  "createEntry",
  "updateEntry",
  "submitEntry",
  "review",
  "undoReview",
  "undoAutoAccept",
  "setEstimate",
  "addEstimateVersion",
  "discardEstimateVersion",
  "setUserRole",
  "linkEstimateVersion",
  "reviewEstimateIssues",
  "correctEstimateValue",
  "confirmEstimateVersion",
  "confirmCostRule",
  "saveCostRule",
  "undoCostRule",
  "resetObjectRule",
  "applySchedule",
  "restoreSchedule",
  "setBrigadeWeek",
  "setReviewSettings",
  "finalCheck",
  "issueReport",
  "fieldSnapshot",
  "answerClarify",
  "closeWeek",
  "reopenWeek",
  "setRate",
  "addCrewMember",
  "endCrewMember",
  "importDirectory",
  "undoDirectoryImport",
  "addObject",
  "addBrigade",
  "intakeEstimateFile",
  "reparseEstimateFile",
  "createObjectFromEstimate",
  "assignSection",
  "unassignSection",
  "setSectionDone",
  "setAccrualMode",
  "deleteEstimate",
  "deleteObject",
  "updateBrigade",
  "deleteBrigade",
  "clearData",
  "reset",
] as const satisfies readonly (keyof GasOpsPort)[];

export type { Role };
