import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { projects } from "@/mock/repository";
import { useProjectId } from "@/lib/project-scope";
import { useOverviews } from "@/lib/project-overview";
import { fmtNum } from "@/lib/format";

export const Route = createFileRoute("/materials")({
  head: () => ({
    meta: [
      { title: "Материалы — neeklo FieldOps" },
      {
        name: "description",
        content:
          "Что требуется купить по каждому объекту: позиции спецификации, проверка и этап закупки.",
      },
      { property: "og:title", content: "Материалы — neeklo FieldOps" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: MaterialsIndex,
});

/** Материалы ведутся по объекту. Если объект выбран — сразу открываем его реестр, иначе предлагаем выбрать. */
function MaterialsIndex() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const overviews = useOverviews(projects.map((project) => project.id));

  useEffect(() => {
    if (projectId)
      navigate({ to: "/projects/$id/materials", params: { id: projectId }, replace: true });
  }, [projectId, navigate]);

  return (
    <>
      <PageHeader
        title="Материалы"
        description="Реестр материалов ведётся по объекту. Выберите, по какому объекту смотреть, что требуется купить."
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project, index) => {
          const overview = overviews[index];
          const verified = overview ? overview.specTotal - overview.specUnverified : 0;
          return (
            <li key={project.id}>
              <Link
                to="/projects/$id/materials"
                params={{ id: project.id }}
                className="card-surface group flex h-full flex-col p-4 transition-fast hover:border-border-strong hover:shadow-[var(--shadow-sm)]"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[15px] font-semibold group-hover:text-accent">
                    {project.name}
                  </span>
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-text-muted transition-fast group-hover:translate-x-0.5 group-hover:text-accent" />
                </span>
                <span className="mt-0.5 text-caption text-text-muted">
                  {project.code} · {overview?.region}
                </span>
                <span className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-caption text-text-muted">
                  <span>
                    Позиций
                    <b className="tnum block text-[15px] font-semibold text-text-primary">
                      {fmtNum(overview?.specTotal ?? 0)}
                    </b>
                  </span>
                  <span>
                    Проверено
                    <b className="tnum block text-[15px] font-semibold text-text-primary">
                      {fmtNum(verified)}
                    </b>
                  </span>
                  <span>
                    В закупке
                    <b className="tnum block text-[15px] font-semibold text-text-primary">
                      {fmtNum(overview?.inRequests ?? 0)}
                    </b>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
