import { z } from "zod";
import {
  contracts,
  crewView,
  employeeView,
  milestoneView,
  projectOverview,
  projectStatus,
  projectView,
  workZoneView,
  type Contract,
  type Crew,
  type Employee,
  type Milestone,
  type Project,
  type ProjectOverview,
  type WorkZone,
  zoneLevel,
} from "@/contracts";
import type { Actor } from "./common";

export const projectList = z.array(z.object({ project: projectView, overview: projectOverview }));
export const projectListItem = z.object({ project: projectView, overview: projectOverview });

/** Фильтр реестра объектов: на экране и в выгрузке одинаковый */
export const listProjectsInput = z.object({
  region: z.string().min(1).optional(),
  managerId: z.string().min(1).optional(),
  status: projectStatus.schema.optional(),
  unverified: z.boolean().optional(),
});

export const projectCard = z.object({
  project: projectView,
  overview: projectOverview,
  contract: contracts.nullable(),
  milestones: z.array(milestoneView),
  zones: z.array(workZoneView),
  crews: z.array(crewView),
  team: z.array(employeeView),
});

export const createProjectInput = z
  .object({
    name: z.string().trim().min(1),
    code: z.string().trim().min(1),
    region: z.string().trim().min(1),
    /** Название заказчика; если такого контрагента нет, он создаётся */
    customer: z.string().trim().min(1),
    /** Номер договора; пусто — договора ещё нет */
    contractNumber: z.string().trim(),
    startDate: z.string().date(),
    endDate: z.string().date(),
    managerId: z.string().min(1),
  })
  .refine((input) => input.endDate >= input.startDate, {
    message: "Срок сдачи раньше начала работ",
    path: ["endDate"],
  });

/** Сменить статус объекта: переходы — `projectStatusTransitions` (ADR-015, п. 7) */
export const setProjectStatusInput = z.object({
  projectId: z.string().min(1),
  status: projectStatus.schema,
});

/** Отметить контрольную точку выполненной; объект — для проверки прав и принадлежности */
/** Захватка объекта: создать или изменить (ADR-024) */
export const saveZoneInput = z.object({
  /** null — новая захватка */
  id: z.string().min(1).nullable(),
  projectId: z.string().min(1),
  /** null — верхний уровень объекта */
  parentId: z.string().min(1).nullable(),
  level: zoneLevel.schema,
  name: z.string().trim().min(2).max(120),
  axes: z.string().trim().max(60).nullable(),
  floors: z.string().trim().max(60).nullable(),
  planQty: z.number().nonnegative(),
  /** Выполнено до начала учёта отчётами: факт = это значение плюс принятые объёмы */
  baselineFactQty: z.number().nonnegative(),
  unit: z.string().trim().min(1).max(20),
});

export const completeMilestoneInput = z.object({
  projectId: z.string().min(1),
  milestoneId: z.string().min(1),
});

export type ProjectListItem = z.infer<typeof projectListItem>;
export type ListProjectsInput = z.infer<typeof listProjectsInput>;
export type CreateProjectInput = z.infer<typeof createProjectInput>;
export type SetProjectStatusInput = z.infer<typeof setProjectStatusInput>;
export type CompleteMilestoneInput = z.infer<typeof completeMilestoneInput>;
export type SaveZoneInput = z.infer<typeof saveZoneInput>;

export interface ProjectCard {
  project: Project;
  overview: ProjectOverview;
  contract: Contract | null;
  milestones: Milestone[];
  zones: WorkZone[];
  crews: Crew[];
  team: Employee[];
}

/** Объекты, договоры, захватки, команда. Сводка считается представлением `project_overview`. */
export interface ProjectsPort {
  /** Реестр: отфильтрован и упорядочен — сначала просроченные ответы, затем непроверенные строки */
  list(input?: ListProjectsInput): Promise<ProjectListItem[]>;
  /** Выгрузка реестра в Excel с тем же фильтром (P3-5) */
  exportRegistry(input: ListProjectsInput): Promise<Blob>;
  /** null — объекта нет */
  card(projectId: string): Promise<ProjectCard | null>;
  /** Код объекта уникален: при повторе — ConflictError */
  create(input: CreateProjectInput, actor: Actor): Promise<Project>;
  /** Переход не по таблице — ConflictError; запись в истории объекта */
  setStatus(input: SetProjectStatusInput, actor: Actor): Promise<Project>;
  /** Выполненную повторно — ConflictError; точка чужого объекта — NotFoundError */
  completeMilestone(input: CompleteMilestoneInput, actor: Actor): Promise<Milestone>;
  /** Завести или изменить захватку; удаления нет — на неё ссылаются принятые отчёты (ADR-024) */
  saveZone(input: SaveZoneInput, actor: Actor): Promise<WorkZone>;
}
