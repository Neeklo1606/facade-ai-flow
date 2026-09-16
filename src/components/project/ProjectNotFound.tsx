import { useEffect, type ComponentType } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ScreenSkeleton } from "@/components/common/ScreenStates";
import { projectById, type Project, type ProjectOverview } from "@/mock/repository";
import { projectOf, useIsClient, useSpecStore } from "@/lib/spec-store";
import { useProjectOverview } from "@/lib/project-overview";

/**
 * Загрузчик маршрутов объекта. Объект мог быть создан в этой вкладке и существовать только
 * в клиентском хранилище, поэтому сервер не отвечает 404 — решение принимает клиент.
 */
export function loadProject(id: string) {
  return { id, project: projectById(id) };
}

export interface ProjectPageProps {
  project: Project;
  overview: ProjectOverview;
}

/** Обёртка экрана объекта: берёт объект и сводку из хранилища, пока их нет — скелетон или 404. */
export function withProject(Page: ComponentType<ProjectPageProps>) {
  return function ProjectRoute() {
    const { id } = useParams({ strict: false }) as { id: string };
    const isClient = useIsClient();
    const project = useSpecStore((s) => projectOf(s, id));
    const overview = useProjectOverview(id);
    const name = project?.name;
    // Объект, созданный во вкладке, сервер не знает и подписывает заголовок «Объект» — уточняем на клиенте
    useEffect(() => {
      if (name) document.title = document.title.replace(/(^|— )Объект( —|$)/, `$1${name}$2`);
    }, [name]);
    if (!project || !overview) {
      return isClient ? <ProjectNotFound /> : <ScreenSkeleton kind="summary" />;
    }
    return <Page project={project} overview={overview} />;
  };
}

export function ProjectNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-section-title">Объект не найден</h1>
      <p className="mt-2 text-text-secondary">Возможно, объект удалён или ссылка устарела.</p>
      <Button asChild className="mt-6" size="sm">
        <Link to="/projects">К реестру объектов</Link>
      </Button>
    </div>
  );
}
