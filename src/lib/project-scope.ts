import { ALL_SITES, useApp } from "@/lib/app-context";
import { useSpecStore } from "@/lib/spec-store";

/** Выбранный в шапке объект в терминах репозитория: p-… или null для всех объектов. */
export function useProjectId(): string | null {
  const { siteId } = useApp();
  const id = siteId === ALL_SITES ? null : siteId.replace(/^s-/, "p-");
  const exists = useSpecStore((s) => (id ? s.projects.some((item) => item.id === id) : false));
  return id && exists ? id : null;
}

/** Обратное преобразование: id проекта репозитория → значение селектора объекта в контексте. */
export function siteIdOf(projectId: string) {
  return projectId.replace(/^p-/, "s-");
}
