import { ArrowRight, Compass } from "lucide-react";
import { SECTIONS, useAccess, type Section } from "@/api/access";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "./PageHeader";
import { Panel } from "./Panel";

/** Куда идти сейчас, чтобы закрыть ту же задачу другим разделом */
export interface PlaceholderRoute {
  label: string;
  to: string;
  search?: Record<string, string | boolean>;
  /** Одна строка: что именно там доступно */
  note: string;
}

/**
 * Экран раздела, которого ещё нет. Он не обещает сроков и не говорит «планируется»:
 * перечисляет, что в разделе будет, и отправляет туда, где задача решается сегодня
 * (TASK-A2, п. 4 — ни один экран не конечная точка).
 */
const isSection = (value: string): value is Section =>
  (SECTIONS as readonly string[]).includes(value);

export function PagePlaceholder({
  title,
  description,
  planned,
  available,
}: {
  title: string;
  description: string;
  planned: string[];
  /** Работающие разделы, которые частично закрывают ту же задачу */
  available: PlaceholderRoute[];
}) {
  // Ведём только в разделы, открытые роли (ADR-012); выбор раздела через реестр — тоже по праву
  const { canOpen, can } = useAccess();
  const open = available.filter((route) => {
    const section = route.search?.["section"];
    return (
      canOpen(route.to) && (typeof section !== "string" || !isSection(section) || can(section))
    );
  });
  return (
    <>
      <PageHeader title={title} description={description} />
      <div data-main-zone className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <Panel title="Что будет в разделе">
          <ul className="grid gap-2 sm:grid-cols-2">
            {planned.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 rounded-md border border-border bg-subtle px-3 py-2 text-[13px]"
              >
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-text-3" aria-hidden />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Что доступно сейчас">
          <ul className="space-y-2">
            {open.map((route) => (
              <li key={route.to + route.label}>
                <Link
                  to={route.to as string}
                  search={(route.search ?? {}) as never}
                  className="focus-ring group flex min-h-11 items-center gap-3 rounded-[var(--r-sm)] border border-line bg-surface-2 px-3 py-2 transition-fast is-hover:border-line-2"
                >
                  <Compass className="size-4 shrink-0 text-text-3" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-text">{route.label}</span>
                    <span className="block text-[12px] leading-[1.4] text-text-3">
                      {route.note}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-text-3 transition-fast group-hover:text-text-2"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
