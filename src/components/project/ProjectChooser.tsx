import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { projects } from "@/mock/repository";
import { useProjectId } from "@/lib/project-scope";
import { useOverviews } from "@/lib/project-overview";
import { fmtNum } from "@/lib/format";

/**
 * Раздел, который ведётся по объекту. Если объект выбран в шапке — сразу открываем его экран,
 * иначе предлагаем выбрать объект.
 */
export function ProjectChooser({
  title,
  description,
  section,
  metric,
}: {
  title: string;
  description: string;
  section: "materials" | "field-reports" | "timeline";
  metric: (
    overview: NonNullable<ReturnType<typeof useOverviews>[number]>,
  ) => { label: string; value: number }[];
}) {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const overviews = useOverviews(projects.map((project) => project.id));

  useEffect(() => {
    if (projectId) void navigate({ to: `/projects/${projectId}/${section}`, replace: true });
  }, [projectId, navigate, section]);

  return (
    <>
      <PageHeader title={title} description={description} />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project, index) => {
          const overview = overviews[index];
          return (
            <li key={project.id}>
              <Link
                to={`/projects/${project.id}/${section}` as string}
                className="card-surface group flex h-full min-h-11 flex-col p-4 transition-fast hover:border-border-strong hover:shadow-[var(--shadow-sm)]"
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
                {overview && (
                  <span className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-caption text-text-muted">
                    {metric(overview).map((m) => (
                      <span key={m.label}>
                        {m.label}
                        <b className="tnum block text-[15px] font-semibold text-text-primary">
                          {fmtNum(m.value)}
                        </b>
                      </span>
                    ))}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
