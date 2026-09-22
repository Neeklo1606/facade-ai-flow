import type { ReactNode } from "react";
import { recordAction } from "@/lib/guide/telemetry";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2, CheckCheck, Clock, type LucideIcon } from "lucide-react";
import { EmptyState, SourceRef } from "@/components/common";
import { ListRowSkeleton } from "@/components/common/Skeletons";
import type { AttentionRow } from "@/api/types";
import { cn } from "@/lib/utils";

const severityBar: Record<AttentionRow["severity"], string> = {
  danger: "bg-danger",
  warn: "bg-warn",
  info: "bg-info",
};

const severityWord: Record<AttentionRow["severity"], string> = {
  danger: "срочно",
  warn: "ждёт решения",
  info: "к рассмотрению",
};

/**
 * «Требует решения» по всем объектам: полоса критичности слева, причина одной строкой,
 * чипы «объект», «срок», «источник». Ссылка «Открыть» растянута на строку — строка кликабельна
 * целиком; на мышке кнопка проявляется при наведении, на телефоне видна всегда,
 * с клавиатуры получает фокус.
 */
export function AttentionList({
  rows,
  pending,
  onSource,
}: {
  rows: AttentionRow[];
  pending: boolean;
  onSource: (sourceId: string) => void;
}) {
  if (pending)
    return (
      <div className="md:-mx-6 md:divide-y md:divide-line">
        {Array.from({ length: 4 }).map((_, index) => (
          <ListRowSkeleton key={index} />
        ))}
      </div>
    );

  if (!rows.length)
    return (
      <EmptyState
        icon={CheckCheck}
        title="Открытых вопросов нет"
        description="Просроченных ответов поставщиков и решений, которые ждут человека, по объектам не осталось."
      />
    );

  return (
    <ul
      data-tour="attention-list"
      className="space-y-2.5 md:-mx-6 md:space-y-0 md:divide-y md:divide-line"
    >
      {rows.map((row) => (
        <li
          key={row.id}
          className="group relative flex items-start gap-3 overflow-hidden rounded-[var(--r-md)] border border-line bg-surface-2 px-4 py-3 transition-fast md:rounded-none md:border-0 md:bg-transparent md:px-6 md:py-3.5 md:is-hover:bg-surface-2"
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-0 bottom-0 left-0 w-[3px] md:top-3.5 md:bottom-3.5 md:rounded-r-full",
              severityBar[row.severity],
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-[1.35] font-medium text-text">
              {row.title}
              <span className="sr-only">, {severityWord[row.severity]}</span>
            </p>
            <p
              className="mt-0.5 truncate text-[13px] leading-[1.45] text-text-3"
              title={row.reason}
            >
              {row.reason}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Chip icon={Building2}>{row.projectName}</Chip>
              {row.due && (
                <Chip icon={Clock} tone={row.severity === "danger" ? "danger" : "default"}>
                  {row.due}
                </Chip>
              )}
              <SourceRef
                sourceId={row.sourceId}
                onOpen={() => row.sourceId && onSource(row.sourceId)}
                className="relative z-[2] lg:size-6"
              />
            </div>
          </div>
          <Link
            to={row.to as string}
            onClick={() => recordAction("openAttention")}
            aria-label={`Открыть: ${row.title}`}
            className="focus-ring inline-flex h-11 shrink-0 items-center gap-1.5 self-center rounded-[var(--r-sm)] border border-line-2 bg-surface-3 px-3 text-[13px] font-medium text-text-2 transition-fast after:absolute after:inset-0 after:content-[''] is-hover:text-text md:bg-surface-2 lg:h-9"
          >
            Открыть <ArrowRight className="size-3.5" strokeWidth={1.75} aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Chip({
  icon: Icon,
  tone = "default",
  children,
}: {
  icon: LucideIcon;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2.5 text-[12px] leading-none",
        tone === "danger" ? "bg-danger-bg text-danger" : "bg-surface-3 text-text-2",
      )}
    >
      <Icon className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}
