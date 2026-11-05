/**
 * Итог «Проверки» в теме «Газ v4» (ADR-065), когда новых записей не осталось: кольцо принятого
 * за неделю и время последнего изменения. Пока очередь не пуста, счётчики показывает строка
 * над очередью, а очередь стоит сразу под шапкой (приёмка: первая карточка не ниже 200 px).
 */
export function ReviewSummary({
  clarify,
  confirmed,
  lastChange,
}: {
  clarify: number;
  confirmed: number;
  lastChange: string | null;
}) {
  const total = clarify + confirmed;
  const share = total ? confirmed / total : 1;
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
        <p className="type-kpi text-up">Всё проверено</p>
        <p className="mt-1 type-text text-ink-2">
          {clarify ? `${clarify} на уточнении у бригадиров. ` : ""}
          {lastChange ? `Отчёт обновлён в ${lastChange}` : "Новые записи появятся здесь сами"}
        </p>
      </div>
    </section>
  );
}
