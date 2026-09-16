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
} from "@/contracts";
import type { Actor } from "./common";

export const listProjectsInput = z.object({
  status: projectStatus.schema.optional(),
  region: z.string().optional(),
  managerId: z.string().optional(),
  /** Только объекты, где есть непроверенные позиции */
  withUnverified: z.boolean().optional(),
});

export const projectListItem = z.object({ project: projectView, overview: projectOverview });

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
    contractNumber: z.string().trim().nullable(),
    startDate: z.string().date(),
    endDate: z.string().date(),
    managerId: z.string().min(1),
  })
  .refine((input) => input.endDate >= input.startDate, {
    message: "Срок сдачи раньше начала работ",
    path: ["endDate"],
  });

export type ListProjectsInput = z.infer<typeof listProjectsInput>;
export type ProjectListItem = z.infer<typeof projectListItem>;
export type CreateProjectInput = z.infer<typeof createProjectInput>;

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
  list(input: ListProjectsInput): Promise<ProjectListItem[]>;
  /** null — объекта нет */
  card(projectId: string): Promise<ProjectCard | null>;
  /** Код объекта уникален: при повторе — ConflictError */
  create(input: CreateProjectInput, actor: Actor): Promise<Project>;
}
