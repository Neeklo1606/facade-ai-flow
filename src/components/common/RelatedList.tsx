import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { EntityLink, OriginStep } from "@/api/types";
import { cn } from "@/lib/utils";

/**
 * Блок «Связано» (ADR-018, п. 2). Каждая строка — переход к связанной сущности.
 * Связи приходят готовыми из слоя данных: чего нет в данных, того нет и в списке,
 * поэтому пустого блока и строк «—» здесь не бывает.
 */
export function RelatedList({ links, className }: { links: EntityLink[]; className?: string }) {
  if (!links.length) return null;
  return (
    <ul className={cn("space-y-1.5", className)}>
      {links.map((link) => (
        <li key={`${link.label}:${link.title}`}>
          <Link
            to={link.to as string}
            search={link.search ?? {}}
            className="focus-ring group flex items-start gap-2 rounded-[var(--r-sm)] border border-line px-3 py-2 transition-fast is-hover:border-line-2 is-hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] leading-[1.35] text-text-3">{link.label}</span>
              <span className="mt-0.5 block truncate text-[13px] leading-[1.4] font-medium text-text">
                {link.title}
              </span>
              {link.hint && (
                <span className="mt-0.5 block truncate text-[12px] leading-[1.35] text-text-3">
                  {link.hint}
                </span>
              )}
            </span>
            <ArrowUpRight
              className="mt-0.5 size-4 shrink-0 text-text-3 transition-fast group-hover:text-text-2"
              strokeWidth={1.75}
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Происхождение значения одной строкой: документ → лист → позиция (ADR-018, п. 3).
 * Строка кликабельна целиком и ведёт туда, где значение стоит в оригинале.
 */
export function OriginTrail({
  steps,
  to,
  search,
  className,
}: {
  steps: OriginStep[];
  to: string;
  search?: Record<string, string>;
  className?: string;
}) {
  if (!steps.length) return null;
  return (
    <Link
      to={to as string}
      search={search ?? {}}
      aria-label={`Происхождение: ${steps.map((step) => `${step.label} ${step.value}`).join(", ")}`}
      className={cn(
        "focus-ring flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-[var(--r-sm)] border border-line px-3 py-2 text-[13px] transition-fast is-hover:border-line-2 is-hover:bg-surface-2",
        className,
      )}
    >
      {steps.map((step, index) => (
        <span key={step.label} className="flex min-w-0 items-center gap-1.5">
          {index > 0 && (
            <span aria-hidden className="text-text-3">
              →
            </span>
          )}
          <span className="truncate">
            <span className="text-text-3">{step.label} </span>
            <span className="font-medium text-text">{step.value}</span>
          </span>
        </span>
      ))}
      <ArrowUpRight
        className="ml-auto size-4 shrink-0 text-text-3"
        strokeWidth={1.75}
        aria-hidden
      />
    </Link>
  );
}
