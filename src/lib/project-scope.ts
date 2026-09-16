import { useQuery } from "@tanstack/react-query";
import { employeeRoleLabel } from "@/contracts";
import { queries } from "@/api/queries";
import { CURRENT_USER_ID } from "@/api/config";
import { ALL_PROJECTS, useApp } from "@/lib/app-context";

/** Выбранный в шапке объект или null для всех объектов; несуществующий id — тоже null. */
export function useProjectId(): string | null {
  const { projectId } = useApp();
  const { data } = useQuery(queries.projects());
  const id = projectId === ALL_PROJECTS ? null : projectId;
  return id && data?.some((item) => item.project.id === id) ? id : null;
}

/** Текущий пользователь — сотрудник из справочника, с подписью роли. */
export function useCurrentUser() {
  const { data } = useQuery(queries.employees());
  const employee = data?.find((item) => item.id === CURRENT_USER_ID);
  return employee ? { ...employee, roleLabel: employeeRoleLabel[employee.role] } : null;
}
