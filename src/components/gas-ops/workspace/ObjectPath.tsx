/**
 * Полоса пути объекта (ADR-080): Смета → Стоимость → Бригады → Часы → Начисление. Пройденные
 * шаги с галочкой, у текущего одно действие. Пять шагов в строку на компьютере, на телефоне
 * прокрутка вбок не нужна: шаги идут сеткой, текущий шаг с подсказкой крупнее.
 */
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useGasActor } from "@/api/gas-ops";
import { useObjectPath, usePendingEstimateId, type PathStep } from "@/api/gas-section-accrual";
import { EstimateFlowButton } from "@/components/gas-ops/estimates/EstimateFlow";
import { cn } from "@/lib/utils";

const actionClass =
  "inline-flex min-h-11 items-center rounded-control bg-surface-2 px-4 text-body-strong focus-ring";

export function ObjectPath({ objectId, label }: { objectId: string; label: string }) {
  const steps = useObjectPath(objectId);
  const actor = useGasActor();
  const manage = actor.role === "manager" || actor.isAdmin;
  const current = steps.find((s) => s.state === "current") ?? null;
  // «Подтвердить стоимость» открывает шторку именно этой сметы, а не общий список
  const pendingId = usePendingEstimateId(objectId);
  if (steps.length === 0) return null;
  return (
    <section
      aria-labelledby="object-path"
      className="surface-1 flex flex-col gap-3 p-4 lg:p-5"
      data-testid="object-path"
    >
      <h2 id="object-path" className="sr-only">
        Путь объекта
      </h2>
      <ol className="grid grid-cols-5 gap-1.5">
        {steps.map((step, i) => (
          <Step key={step.key} step={step} index={i + 1} />
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-text-2" data-testid="object-path-hint">
          {current ? (
            <>
              <span className="text-body-strong text-text">
                <span className="sm:hidden">
                  Шаг {steps.indexOf(current) + 1} из {steps.length} ·{" "}
                </span>
                {current.label}:
              </span>{" "}
              {current.hint}
            </>
          ) : (
            "Путь пройден: часы принимаются, начисление идёт по доле разделов"
          )}
        </p>
        <span className="flex flex-wrap gap-2">
          {current?.key === "estimate" ? <EstimateFlowButton /> : null}
          {current?.key === "cost" && actor.canManageEstimates ? (
            <Link
              to="/gas/estimates"
              search={pendingId ? { open: pendingId } : {}}
              className={actionClass}
              data-testid="object-path-cost"
            >
              Подтвердить стоимость
            </Link>
          ) : null}
          {current?.key === "brigades" && manage ? (
            <a href="#object-sections" className={actionClass}>
              Назначить бригады
            </a>
          ) : null}
          {current?.key === "hours" || current?.key === "accrual" ? (
            <Link to="/gas/moderation" className={actionClass}>
              Проверка записей
            </Link>
          ) : null}
          <Link
            to="/gas/tabel"
            search={{ q: label }}
            className={actionClass}
            data-testid="object-path-tabel"
          >
            Табель объекта
          </Link>
        </span>
      </div>
    </section>
  );
}

function Step({ step, index }: { step: PathStep; index: number }) {
  return (
    <li
      className="flex min-w-0 flex-col gap-1.5"
      data-state={step.state}
      aria-current={step.state === "current" ? "step" : undefined}
    >
      <span
        className={cn(
          "h-1.5 rounded-full",
          step.state === "done" ? "bg-ok" : step.state === "current" ? "bg-orange" : "bg-surface-3",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "flex min-w-0 items-center gap-1 text-meta",
          step.state === "todo" ? "text-text-3" : "text-text",
          step.state === "current" && "text-meta-strong",
        )}
      >
        {step.state === "done" ? (
          <Check className="size-3.5 shrink-0 text-ok" aria-hidden />
        ) : (
          <span className="tnum shrink-0" aria-hidden>
            {index}
          </span>
        )}
        {/* На телефоне только номер: название текущего шага стоит в подсказке под полосой */}
        <span className="sr-only sm:not-sr-only sm:truncate">{step.label}</span>
        <span className="sr-only">
          {step.state === "done" ? ", готово" : step.state === "current" ? ", сейчас" : ""}
        </span>
      </span>
    </li>
  );
}
