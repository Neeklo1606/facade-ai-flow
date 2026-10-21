import type { ReactNode } from "react";
import { recordAction } from "@/lib/guide/telemetry";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2, CheckCheck, Clock, type LucideIcon } from "lucide-react";
import { EmptyState, SourceRef } from "@/components/common";
import { ListRowSkeleton } from "@/components/common/Skeletons";
import type { AttentionRow } from "@/api/types";
import { cn } from "@/lib/utils";
import { EventCard } from "@/components/v3";
import { stretchedLink, type V3Tone } from "@/components/v3/classes";

const severityTone: Record<AttentionRow["severity"], V3Tone> = {
  danger: "danger",
  warn: "warn",
  info: "info",
};

const severityWord: Record<AttentionRow["severity"], string> = {
  danger: "срочно",
  warn: "ждёт решения",
  info: "к рассмотрению",
};

/**
 * «Требует решения» по всем объектам: карточки событий v3 с полосой критичности слева,
 * причина под заголовком, чипы «объект», «срок», «источник». Ссылка растянута на карточку —
 * карточка нажимается целиком, с клавиатуры ссылка получает фокус.
 */
export function AttentionList({
  rows,
  pending,
  onSource,
  extra,
  extraCount = 0,
}: {
  rows: AttentionRow[];
  pending: boolean;
  onSource: (sourceId: string) => void;
  /** Ещё карточки той же ленты, которые собирает экран: отчёты на проверке (ГАЙКА) */
  extra?: ReactNode;
  extraCount?: number;
}) {
  if (pending)
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <ListRowSkeleton key={index} />
        ))}
      </div>
    );

  if (!rows.length && !extraCount)
    return (
      <div className="card-v3 px-5 py-6">
        <EmptyState
          icon={CheckCheck}
          title="Открытых вопросов нет"
          description="Просроченных ответов поставщиков и решений, которые ждут человека, по объектам не осталось."
        />
      </div>
    );

  return (
    <ul data-tour="attention-list" className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.id}>
          <EventCard
            tone={severityTone[row.severity]}
            title={
              <>
                {row.title}
                <span className="sr-only">, {severityWord[row.severity]}</span>
              </>
            }
            meta={<span className="line-clamp-2">{row.reason}</span>}
            footer={
              <>
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
              </>
            }
            aside={
              <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-text-2 transition-fast group-hover:text-text">
                <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
              </span>
            }
            action={
              <Link
                to={row.to as string}
                onClick={() => recordAction("openAttention")}
                aria-label={`Открыть: ${row.title}`}
                className={stretchedLink}
              />
            }
          />
        </li>
      ))}
      {extra}
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
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-3 text-[13px] leading-none",
        tone === "danger" ? "bg-danger-bg text-danger" : "bg-surface-2 text-text-2",
      )}
    >
      <Icon className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}
