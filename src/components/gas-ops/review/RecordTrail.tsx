/**
 * Путь записи одной строкой (PROMPT_UX_FINAL 3.2, ADR-068): Внесено → Проверено →
 * Подтверждено → В отчёте. Каждый шаг словом и знаком, не только цветом. Шаги выводятся
 * из статуса записи и замечаний, ничего не придумывается: нет решения — шаг пустой.
 */
import { Check, CircleAlert, Circle, X } from "lucide-react";
import { trailOf, type EntryView, type TrailState } from "@/api/gas-ops";
import { cn } from "@/lib/utils";

const ICON = { done: Check, warn: CircleAlert, fail: X, todo: Circle } as const;
const TONE: Record<TrailState, string> = {
  done: "text-ok",
  warn: "text-warn",
  fail: "text-danger",
  todo: "text-text-3",
};

export function RecordTrail({ view, remarkCount }: { view: EntryView; remarkCount: number }) {
  const steps = trailOf(view.entry.status, remarkCount);
  return (
    <ol aria-label="Путь записи" className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {steps.map((step, index) => {
        const Icon = ICON[step.state];
        return (
          <li
            key={step.label}
            className={`flex items-center gap-1 text-meta ${step.state === "todo" ? "text-text-3" : "text-text-2"}`}
          >
            {index ? (
              <span aria-hidden className="text-text-3">
                →
              </span>
            ) : null}
            <Icon className={cn("size-3.5 shrink-0", TONE[step.state])} aria-hidden />
            <span>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
