/**
 * Область доступа (ADR-012): какие объекты у сотрудника и какому объекту принадлежит запись.
 * Нужен обёртке прав, чтобы роль со «своими объектами» не читала и не меняла чужие.
 */
export type ScopeKind =
  "report" | "source" | "position" | "revision" | "document" | "request" | "delivery" | "remark";

export interface ScopePort {
  /** Объекты сотрудника: он в команде объекта или прораб его бригады */
  projectsOf(employeeId: string): Promise<string[]>;
  /** Объект записи; null — записи нет или она не привязана к объекту */
  projectOf(kind: ScopeKind, id: string): Promise<string | null>;
}
