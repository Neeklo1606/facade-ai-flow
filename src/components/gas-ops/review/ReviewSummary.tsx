/**
 * Сводка «Проверки» в теме «Газ v4» (ADR-065): кольцо проверенного за неделю и одна строка,
 * что ждёт решения. Цифры из счётчиков очереди: принятые, ожидающие, на уточнении.
 */
import { plural } from "@/lib/format";

export function ReviewSummary({
  pending,
  clarify,
  confirmed,
  clean,
  lastChange,
}: {
  pending: number;
  clarify: number;
  confirmed: number;
  clean: number;
  lastChange: string | null;
}) {
  const total = pending + clarify + confirmed;
  const share = total ? confirmed / total : 1;
  const remarks = Math.max(0, pending - clean);
  return (
    <section
      aria-label="Итог проверки"
      data-testid="review-summary"
      className="card-v3 mb-4 flex items-center gap-5 p-5"
    >
      <div className="relative size-20 shrink-0" aria-hidden>
        <svg viewBox="0 0 36 36" className="size-full -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            strokeWidth="3.5"
            className="stroke-surface-2"
          />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${share * 97.4} 97.4`}
            className="stroke-up transition-[stroke-dasharray] duration-700"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center type-label tnum">
          {Math.round(share * 100)}%
        </span>
      </div>
      <div className="min-w-0 flex-1">
        {pending ? (
          <>
            <p className="type-kpi">
              {pending} {plural(pending, "ждёт", "ждут", "ждут")} проверки
            </p>
            <p className="mt-1 type-text text-ink-2">
              {remarks} с замечаниями · {clean} без замечаний
              {clarify ? ` · ${clarify} на уточнении` : ""}
            </p>
          </>
        ) : (
          <>
            <p className="type-kpi text-up">Всё проверено</p>
            <p className="mt-1 type-text text-ink-2">
              {lastChange ? `Отчёт обновлён в ${lastChange}` : "Новые записи появятся здесь сами"}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
