import { Link } from "@tanstack/react-router";
import { notFound } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { overviewOf, projectById } from "@/mock/repository";

/** Загрузчик маршрутов объекта: объект и его сводка или 404. */
export function loadProject(id: string) {
  const project = projectById(id);
  const overview = overviewOf(id);
  if (!project || !overview) throw notFound();
  return { project, overview };
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
