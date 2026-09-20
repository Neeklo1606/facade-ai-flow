import { z } from "zod";
import { col, idSchema, pgEnum, table } from "./db";

/* ---------- Объект ---------- */

/**
 * Переходы статуса объекта (ADR-015, п. 7): одна таблица для схемы БД и для проверки в адаптере.
 * «Завершён» — последний
 */
export const projectStatusTransitions = {
  active: ["at_risk", "paused", "done"],
  at_risk: ["active", "paused", "done"],
  paused: ["active", "done"],
  done: [],
} as const;

export const projectStatus = pgEnum(
  "project_status",
  ["active", "at_risk", "paused", "done"],
  "Состояние объекта для реестра",
  projectStatusTransitions,
);

export const projects = table(
  {
    name: "projects",
    comment: "Строительный объект",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      { columns: ["code"], unique: true, purpose: "короткий код объекта в реестре и поиске" },
      { columns: ["status", "name"], purpose: "реестр: фильтр по статусу, сортировка по названию" },
      { columns: ["managerId"], purpose: "реестр: фильтр по ответственному" },
      { columns: ["region"], purpose: "реестр: фильтр по региону" },
    ],
    checks: ["end_date >= start_date"],
  },
  {
    id: col.id(),
    name: col.name(),
    code: col.name(),
    customerId: col.ref("counterparties", "restrict"),
    region: col.name(),
    stage: col.text({ comment: "стадия работ словами: «Монтаж фасада, этап 1»" }),
    status: col.enum(projectStatus),
    managerId: col.ref("employees", "restrict"),
    startDate: col.date(),
    endDate: col.date(),
  },
);

/* ---------- Договор ---------- */

export const contractStatus = pgEnum(
  "contract_status",
  ["draft", "active", "closed"],
  "Жизненный цикл договора",
  { draft: ["active"], active: ["closed"] },
);

export const contracts = table(
  {
    name: "contracts",
    comment: "Договор с заказчиком по объекту",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      { columns: ["number"], unique: true, purpose: "номер договора в шапке объекта и поиске" },
      { columns: ["projectId", "signedAt desc"], purpose: "действующий договор объекта" },
    ],
    checks: ["amount >= 0", "advance between 0 and amount", "end_date >= start_date"],
  },
  {
    id: col.id(),
    projectId: col.ref("projects", "restrict"),
    customerId: col.ref("counterparties", "restrict"),
    number: col.name(),
    signedAt: col.date(),
    startDate: col.date(),
    endDate: col.date(),
    amount: col.money(),
    advance: col.money(),
    retentionPct: col.percent({ comment: "гарантийное удержание, %" }),
    paymentTermDays: col.smallint(),
    status: col.enum(contractStatus),
    sourceId: col.ref("sources", "set null", { nullable: true }),
  },
);

/** Переходы контрольной точки: выполненная — последний статус (ADR-015, п. 7) */
export const milestoneTransitions = {
  planned: ["done"],
  at_risk: ["done"],
  overdue: ["done"],
  done: [],
} as const;

export const milestoneStatus = pgEnum(
  "milestone_status",
  ["planned", "at_risk", "done", "overdue"],
  "Состояние контрольной точки договора",
  milestoneTransitions,
);

export const milestones = table(
  {
    name: "milestones",
    comment: "Контрольная точка договора: этап, требование, срок",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      { columns: ["contractId", "dueDate"], purpose: "контрольные точки на вкладке «Ход работ»" },
    ],
  },
  {
    id: col.id(),
    contractId: col.ref("contracts", "cascade"),
    name: col.name(),
    dueDate: col.date(),
    requirement: col.text(),
    status: col.enum(milestoneStatus),
    sourceId: col.ref("sources", "set null", { nullable: true }),
    location: col.text({ comment: "где в договоре: страница, пункт" }),
  },
);

/* ---------- Захватки ---------- */

export const zoneLevel = pgEnum(
  "zone_level",
  ["building", "section", "floor", "zone"],
  "Уровень участка фасада",
);

export const workZones = table(
  {
    name: "work_zones",
    comment: "Участок фасада: здание, секция, этаж, захватка",
    primaryKey: ["id"],
    audited: true,
    indexes: [
      { columns: ["projectId", "name"], purpose: "захватки объекта в фильтрах и «Ходе работ»" },
      { columns: ["parentId"], purpose: "дерево участков" },
    ],
    checks: ["plan_qty >= 0", "baseline_fact_qty >= 0"],
  },
  {
    id: col.id(),
    projectId: col.ref("projects", "cascade"),
    parentId: col.ref("work_zones", "cascade", { nullable: true }),
    level: col.enum(zoneLevel),
    name: col.name(),
    axes: col.text({ nullable: true }),
    floors: col.text({ nullable: true }),
    planQty: col.qty(),
    baselineFactQty: col.qty({
      comment: "выполнено до начала учёта отчётами; факт = это значение + принятые объёмы (R15)",
    }),
    unit: col.name(),
  },
);

/* ---------- Представления ---------- */

/** Объект для экранов: заказчик и номер договора подставлены словами. */
export const projectView = projects.omit({ customerId: true, managerId: true }).extend({
  customerId: idSchema,
  customer: z.string(),
  contractId: idSchema.nullable(),
  contract: z.string(),
  manager: idSchema,
});

export const milestoneView = milestones.extend({ projectId: idSchema });

export const workZoneView = workZones
  .omit({ baselineFactQty: true })
  .extend({ factQty: z.number() });

/**
 * Сводка объекта: представление `project_overview`. В таблицах не хранится,
 * формулы — в docs/domain/glossary.md, §3.
 */
export const projectOverview = z.object({
  projectId: idSchema,
  region: z.string(),
  stage: z.string(),
  /** Последняя загруженная ревизия документации: «Рев. 3» */
  docVersion: z.string(),
  specTotal: z.number().int().nonnegative(),
  specUnverified: z.number().int().nonnegative(),
  inRequests: z.number().int().nonnegative(),
  offersReceived: z.number().int().nonnegative(),
  ordered: z.number().int().nonnegative(),
  inTransit: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  activeRequests: z.number().int().nonnegative(),
  overdueRequests: z.number().int().nonnegative(),
  openChanges: z.number().int().nonnegative(),
  missingReports: z.number().int().nonnegative(),
  /** Поставки, которые прибыли и ждут приёмки (ADR-011) */
  deliveriesToAccept: z.number().int().nonnegative(),
  /** Открытые замечания по поставкам — очередь снабжения */
  openRemarks: z.number().int().nonnegative(),
});

export type ProjectRow = z.infer<typeof projects>;
export type Project = z.infer<typeof projectView>;
export type ProjectStatus = z.infer<typeof projectStatus.schema>;
export type Contract = z.infer<typeof contracts>;
export type MilestoneRow = z.infer<typeof milestones>;
export type Milestone = z.infer<typeof milestoneView>;
export type WorkZoneRow = z.infer<typeof workZones>;
export type WorkZone = z.infer<typeof workZoneView>;
export type ProjectOverview = z.infer<typeof projectOverview>;

/* ---------- Словари ---------- */

export const projectStatusLabel: Record<ProjectStatus, string> = {
  active: "В работе",
  at_risk: "Под риском",
  paused: "Приостановлен",
  done: "Завершён",
};

export const milestoneStatusLabel: Record<Milestone["status"], string> = {
  planned: "По плану",
  at_risk: "Под риском",
  done: "Выполнено",
  overdue: "Просрочено",
};
