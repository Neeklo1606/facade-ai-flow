import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { EmptyState, ProgressBar } from "@/components/common";
import { SkeletonLine } from "@/components/common/Skeletons";
import type { ProjectProgress } from "@/api/types";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Отклонение от графика: цвет по величине, знак по направлению */
function deviationTone(pp: number | null) {
  if (pp === null) return "info" as const;
  if (pp >= 0) return "ok" as const;
  return pp <= -10 ? ("danger" as const) : ("warn" as const);
}

const toneText: Record<"ok" | "warn" | "danger" | "info", string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-text-3",
};

/**
 * «Объекты»: компактный список с процентом готовности по захваткам и отклонением от графика.
 * Риска на полосе — доля прошедшего срока договора: видно, идёт объект впереди или отстаёт.
 */
export function ProjectsMini({ rows, pending }: { rows: ProjectProgress[]; pending: boolean }) {
  if (pending)
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <SkeletonLine className="w-2/3" />
            <SkeletonLine className="h-1.5 w-full" />
          </div>
        ))}
      </div>
    );

  if (!rows.length)
    return (
      <EmptyState
        icon={Building2}
        title="Объектов в работе нет"
        description="Добавьте объект и загрузите договор — готовность появится, когда будут захватки."
      />
    );

  return (
    <ul className="space-y-3.5">
      {rows.map((row) => {
        const tone = deviationTone(row.deviationPp);
        const elapsed = row.deviationPp === null ? undefined : row.donePct - row.deviationPp;
        return (
          <li key={row.projectId} className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <Link
                to="/projects/$id"
                params={{ id: row.projectId }}
                className="focus-ring flex min-h-11 min-w-0 flex-1 items-center truncate text-[14px] leading-[1.4] font-medium text-text transition-fast is-hover:text-orange-hot lg:min-h-0"
              >
                {row.name}
              </Link>
              <span className="tnum shrink-0 text-[14px] font-medium text-text">
                {row.donePct}%
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <ProgressBar
                value={row.donePct}
                tone={tone === "info" ? "info" : tone}
                {...(elapsed === undefined ? {} : { reference: elapsed })}
                label={`${row.name}: выполнено ${row.donePct}% объёма`}
                className="flex-1"
              />
              <span className={cn("tnum shrink-0 text-[12px]", toneText[tone])}>
                {row.deviationPp === null
                  ? "нет срока"
                  : row.deviationPp === 0
                    ? "по графику"
                    : `${row.deviationPp > 0 ? "+" : "−"}${Math.abs(row.deviationPp)} п. п.`}
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-[1.4] text-text-3">
              {row.statusLabel} · осталось {fmtNum(row.qtyLeft)} {row.unit}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
