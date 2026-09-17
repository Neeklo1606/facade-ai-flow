import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { type Project } from "@/contracts";
import { PageActions } from "@/components/layout/PageActions";

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
    <div className={description || meta ? "mb-6" : "lg:contents"}>
      <Link
        to="/projects/$id"
        params={{ id: project.id }}
        className="focus-ring mb-1 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r-xs)] text-caption text-text-muted transition-fast hover:text-text-primary lg:hidden"
      >
        <ArrowLeft className="size-3.5" /> {project.name}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {/* Заголовок страницы показывает шапка контента; здесь он остаётся для чтения с экрана */}
          <h1 className="sr-only">{title}</h1>
          {description && <p className="mt-1 text-[13px] text-text-secondary">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">{meta}</div>}
        </div>
        {actions && <PageActions>{actions}</PageActions>}
      </div>
    </div>
  );
}
