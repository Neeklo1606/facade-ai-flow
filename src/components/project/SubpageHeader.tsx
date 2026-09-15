import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { Project } from "@/mock/repository";

/** Шапка вложенного экрана объекта: возврат в карточку, название раздела и действия. */
export function SubpageHeader({
  project,
  title,
  description,
  actions,
  meta,
}: {
  project: Project;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-4">
      <Link
        to="/projects/$id"
        params={{ id: project.id }}
        className="focus-ring mb-2 inline-flex items-center gap-1.5 rounded-[var(--r-xs)] text-caption text-text-muted transition-fast hover:text-text-primary"
      >
        <ArrowLeft className="size-3.5" /> {project.name}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
          {description && <p className="mt-1 text-[13px] text-text-secondary">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">{meta}</div>}
        </div>
        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>
        )}
      </div>
    </div>
  );
}
