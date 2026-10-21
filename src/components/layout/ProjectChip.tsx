import { Suspense, lazy, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { queries } from "@/api/queries";
import { useProjectId } from "@/lib/project-scope";
import { shortName } from "@/lib/format";

const ProjectSheet = lazy(() =>
  import("./sheets").then((module) => ({ default: module.ProjectSheet })),
);

/**
 * Чип объекта в шапке телефона (ADR-026, п. 8; строка под заголовком — ADR-027, поправка).
 * На широком экране объект выбирают селектором в сайдбаре; на телефоне сайдбара нет,
 * и без чипа сменить объект было нельзя.
 *
 * Скрыт, когда объект у человека один: выбор из одного — кнопка без смысла. Выбор хранится
 * там же, где раньше, — в состоянии сессии (`app-context`), новых хранилищ не вводится.
 */
export function ProjectChip() {
  const [open, setOpen] = useState(false);
  const projectId = useProjectId();
  const projects = useQuery(queries.projects()).data ?? [];
  if (projects.length === 0) return null;
  const current = projects.find((item) => item.project.id === projectId)?.project.name;
  // Объект один: выбирать не из чего, но человек всё равно видит, где он (правило 5)
  if (projects.length === 1) {
    return (
      <span className="text-meta flex h-7 min-w-0 items-center rounded-full bg-surface-2 px-3 text-text-2 lg:hidden">
        <span className="truncate">{shortName(projects[0]!.project.name)}</span>
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Объект: ${current ?? "все объекты"}. Сменить`}
        /*
          Строка под заголовком: высота самой плашки 28 px, но вертикальные поля доводят цель
          нажатия до 48 px — в перчатке в 28 px не попасть, и проверка ширин это ловит.
        */
        className="text-meta focus-ring -my-2.5 flex h-12 min-w-0 items-center gap-1 text-text-2 transition-fast lg:hidden"
      >
        <span className="flex h-7 min-w-0 items-center gap-1 rounded-full bg-surface-2 px-3">
          <span className="truncate">{current ? shortName(current) : "Все объекты"}</span>
          <ChevronDown className="size-3.5 shrink-0 text-text-3" strokeWidth={1.75} aria-hidden />
        </span>
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
