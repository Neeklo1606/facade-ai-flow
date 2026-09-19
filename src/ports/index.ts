import type { AgentPort } from "./agent";
import type { CatalogPort } from "./catalog";
import type { ClockPort } from "./clock";
import type { DirectoryPort } from "./directory";
import type { DocumentsPort } from "./documents";
import type { PositionsPort } from "./positions";
import type { ProcurementPort } from "./procurement";
import type { ProjectsPort } from "./projects";
import type { ReportsPort } from "./reports";
import type { ScopePort } from "./scope";
import type { TimelinePort } from "./timeline";

export * from "./agent";
export * from "./catalog";
export * from "./clock";
export * from "./common";
export * from "./directory";
export * from "./documents";
export * from "./positions";
export * from "./procurement";
export * from "./projects";
export * from "./reports";
export * from "./scope";
export * from "./timeline";

/** Все порты приложения. Адаптер (фикстуры или БД) реализует этот набор целиком. */
export interface Repositories {
  clock: ClockPort;
  directory: DirectoryPort;
  projects: ProjectsPort;
  documents: DocumentsPort;
  positions: PositionsPort;
  procurement: ProcurementPort;
  reports: ReportsPort;
  timeline: TimelinePort;
  /** Номенклатура и категории (ADR-014) */
  catalog: CatalogPort;
  /** Область доступа для проверки прав (ADR-012) */
  scope: ScopePort;
  /** Ассистент поверх остальных портов (ADR-006) */
  agent: AgentPort;
}
