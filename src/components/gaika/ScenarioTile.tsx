import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Плитка сценария на «Сегодня» (дизайн-система, раздел 8). Три штуки: отчёт, задача, проблема.
 * Тёмная плитка, мягкое свечение сверху своим оттенком. Оттенок появляется только здесь,
 * на чипе и в шапке карточки своего типа.
 */
export type ScenarioKind = "report" | "task" | "problem";

const tone: Record<ScenarioKind, { glow: string; mark: string; label: string }> = {
  report: { glow: "from-ember/20", mark: "text-ember", label: "Отчёт" },
  task: { glow: "from-sand/20", mark: "text-sand", label: "Задача" },
  problem: { glow: "from-risk/20", mark: "text-risk", label: "Проблема" },
};

export function ScenarioTile({
  kind,
  hint,
  icon: Icon,
  disabled = false,
  onClick,
  className,
}: {
  kind: ScenarioKind;
  hint: string;
  icon?: LucideIcon;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const { glow, mark, label } = tone[kind];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "focus-ring press relative min-h-[112px] overflow-hidden rounded-[var(--r-lg)] bg-surface p-5 text-left",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-x-0 top-0 h-16 bg-gradient-to-b to-transparent", glow)}
      />
      <span className="relative flex flex-col gap-1">
        <span className="flex items-center gap-2">
          {Icon ? <Icon className={cn("size-5", mark)} /> : null}
          <span className="text-card-title">{label}</span>
        </span>
        <span className="text-caption text-text-2">{hint}</span>
      </span>
    </button>
  );
}
