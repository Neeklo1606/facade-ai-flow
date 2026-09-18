import { useQuery } from "@tanstack/react-query";
import { employeeRoleLabel, type EmployeeRole } from "@/contracts";
import { queries } from "@/api/queries";
import { ALL_PROJECTS, useApp } from "@/lib/app-context";

/** Выбранный в шапке объект или null для всех объектов; несуществующий id — тоже null. */
export function useProjectId(): string | null {
  const { projectId } = useApp();
  const { data } = useQuery(queries.projects());
  const id = projectId === ALL_PROJECTS ? null : projectId;
  return id && data?.some((item) => item.project.id === id) ? id : null;
}

/**
 * Текущий пользователь — выбранная персона демонстрации (ADR-008), с подписью роли.
 * До появления сессий это единственный способ показать разницу ролей.
 */
export function useCurrentUser() {
  const { personaId } = useApp();
  const { data } = useQuery(queries.employees());
  const employee = data?.find((item) => item.id === personaId);
  return employee ? { ...employee, roleLabel: employeeRoleLabel[employee.role] } : null;
}

/** Роль текущей персоны; пока справочник не загружен — роль руководителя проекта */
export function useCurrentRole(): EmployeeRole {
  return useCurrentUser()?.role ?? "manager";
}
