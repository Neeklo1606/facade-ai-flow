import { Suspense, lazy, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { queries } from "@/api/queries";
import { useProjectId } from "@/lib/project-scope";

const ProjectSheet = lazy(() =>
  import("./sheets").then((module) => ({ default: module.ProjectSheet })),
);

/**
 * Чип объекта в шапке телефона (ADR-026, п. 8). На широком экране объект выбирают селектором
 * в сайдбаре; на телефоне сайдбара нет, и без чипа сменить объект было нельзя.
 *
 * Скрыт, когда объект у человека один: выбор из одного — кнопка без смысла. Выбор хранится
 * там же, где раньше, — в состоянии сессии (`app-context`), новых хранилищ не вводится.
 */
export function ProjectChip() {
  const [open, setOpen] = useState(false);
  const projectId = useProjectId();
  const projects = useQuery(queries.projects()).data ?? [];
  if (projects.length < 2) return null;

  const current = projects.find((item) => item.project.id === projectId)?.project.name;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Объект: ${current ?? "все объекты"}. Сменить`}
        className="focus-ring flex h-8 max-w-[44vw] shrink-0 items-center gap-1 rounded-[var(--r-pill)] border border-line bg-surface-2 px-2.5 text-[12px] leading-none text-text-2 transition-fast lg:hidden"
      >
        <span className="truncate">{current ?? "Все объекты"}</span>
        <ChevronDown className="size-3.5 shrink-0 text-text-3" strokeWidth={1.75} aria-hidden />
      </button>
      {/* Список объектов грузится по требованию: до нажатия чипа он не нужен */}
      {open && (
        <Suspense fallback={null}>
          <ProjectSheet open onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
