import { useEffect, type ComponentType } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ScreenSkeleton } from "@/components/common/ScreenStates";
import { queries } from "@/api/queries";
import { prefetch } from "@/api/prefetch";
import type { ProjectCard } from "@/api/types";

/**
 * Загрузчик маршрутов объекта: предзагружает карточку объекта (заголовок страницы и шапка экрана).
 * Объекта может не быть на сервере — он создан во вкладке демо, — поэтому 404 решает клиент.
 */
export async function loadProject(queryClient: QueryClient, id: string) {
  const card = await prefetch(queryClient, queries.project(id));
  return { id, project: card?.project ?? null };
}

export type ProjectPageProps = ProjectCard;

/** Обёртка экрана объекта: карточка объекта из запроса; пока грузится — скелетон, нет объекта — 404. */
export function withProject(Page: ComponentType<ProjectPageProps>) {
  return function ProjectRoute() {
    const { id } = useParams({ strict: false }) as { id: string };
    const { data: card, isPending } = useQuery(queries.project(id));
    const name = card?.project.name;
    // Объект, созданный во вкладке, сервер не знает и подписывает заголовок «Объект» — уточняем на клиенте
    useEffect(() => {
      if (name) document.title = document.title.replace(/(^|— )Объект( —|$)/, `$1${name}$2`);
    }, [name]);
    if (isPending) return <ScreenSkeleton kind="summary" />;
    if (!card) return <ProjectNotFound />;
    return <Page {...card} />;
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
