import { employeeRoleLabel } from "@/contracts";
import { ALL_PROJECTS, CURRENT_USER_ID, useApp } from "@/lib/app-context";
import { useSpecStore } from "@/lib/spec-store";

/** Выбранный в шапке объект или null для всех объектов; несуществующий id — тоже null. */
export function useProjectId(): string | null {
  const { projectId } = useApp();
  const id = projectId === ALL_PROJECTS ? null : projectId;
  const exists = useSpecStore((s) => (id ? s.projects.some((item) => item.id === id) : false));
  return id && exists ? id : null;
}

/** Текущий пользователь — сотрудник из справочника, с подписью роли. */
export function useCurrentUser() {
  const employee = useSpecStore((s) => s.employees.find((item) => item.id === CURRENT_USER_ID));
  return employee ? { ...employee, roleLabel: employeeRoleLabel[employee.role] } : null;
}
