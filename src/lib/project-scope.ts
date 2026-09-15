import { ALL_SITES, useApp } from "@/lib/app-context";
import { projects } from "@/mock/repository";

/** Выбранный в шапке объект в терминах репозитория: p-… или null для всех объектов. */
export function useProjectId(): string | null {
  const { siteId } = useApp();
  if (siteId === ALL_SITES) return null;
  const id = siteId.replace(/^s-/, "p-");
  return projects.some((item) => item.id === id) ? id : null;
}

/** Обратное преобразование: id проекта репозитория → значение селектора объекта в контексте. */
export function siteIdOf(projectId: string) {
  return projectId.replace(/^p-/, "s-");
}

export function projectName(id: string) {
  return projects.find((item) => item.id === id)?.name ?? "—";
}

export function projectCode(id: string) {
  return projects.find((item) => item.id === id)?.code ?? "";
}
