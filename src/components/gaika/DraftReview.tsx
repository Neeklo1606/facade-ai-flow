import { useState } from "react";
import { HardHat, PackageSearch } from "lucide-react";
import type { CreateReportInput, DraftCard, RequestPrefill } from "@/api/types";
import { AttentionDot } from "./AttentionDot";
import { Button } from "@/components/ui/button";
import { WidgetCard, WidgetCardHeader } from "@/components/common";
import { cn } from "@/lib/utils";

/**
 * Черновик разбора: карточки «Работы, Люди, Материалы, Проблемы, Завтра» и два действия —
 * «Верно» заводит отчёт, «Создать заявку» отправляет нехватку материала снабжению
 * (ADR-037, сценарии 1 и 3).
 *
 * Ничего не применяется само: пока человек не нажал, это черновик. Сомнительное помечено
 * янтарной точкой с причиной, а не молча.
 */
export function DraftReview({
  cards,
  ready,
  prefill,
  demo,
  onConfirm,
  onRequest,
  pending,
  done,
}: {
  /** Карточки разбора: считает слой данных, экран показывает (ADR-001, п. 5) */
  cards: DraftCard[];
  /** Записи, готовые стать отчётом: у них есть захватка, вид работ, объём и единица */
  ready: CreateReportInput[];
  prefill: RequestPrefill | null;
  /** Разбор подготовлен заранее: пометка показа стоит рядом с результатом (правило 4) */
  demo: boolean;
  onConfirm: (reports: CreateReportInput[]) => void;
  onRequest: (prefill: RequestPrefill) => void;
  pending: boolean;
  /** Что уже заведено: кнопки не предлагают сделать это второй раз */
  done: { reports: number; request: boolean };
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <WidgetCard>
      <WidgetCardHeader
        level={2}
        icon={HardHat}
        title="Что система услышала"
        hint={demo ? "разбор подготовлен заранее" : "разобрано моделью"}
      />
      <div className="mt-2 flex flex-col gap-4">
        {cards.map((card) => (
          <section key={card.key}>
            <h4 className="text-overline text-text-3">{card.title}</h4>
            <dl className="divide-line mt-1 divide-y">
              {card.fields.map((field, index) => (
                <div key={`${card.key}-${index}`} className="flex items-start gap-3 py-2.5">
                  <dt className="text-text-3 w-28 shrink-0 text-[13px]">{field.label}</dt>
                  <dd className="min-w-0 flex-1">
                    <span className="text-list flex items-center gap-2">
                      {field.value}
                      {field.attention ? <AttentionDot reason={field.attention} /> : null}
                    </span>
                    {field.quote ? (
                      <button
                        type="button"
                        onClick={() =>
                          setOpen(open === `${card.key}-${index}` ? null : `${card.key}-${index}`)
                        }
                        className="focus-ring text-text-3 is-hover:text-text-2 mt-1 text-[13px] underline-offset-2 hover:underline"
                      >
                        {open === `${card.key}-${index}` ? "Скрыть источник" : "Показать источник"}
                      </button>
                    ) : null}
                    {open === `${card.key}-${index}` && field.quote ? (
                      <p className="bg-surface-2 text-text-2 mt-1 rounded-[var(--r-xs)] px-3 py-2 text-[13px]">
                        «{field.quote}»
                      </p>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <div className={cn("mt-4 flex flex-wrap items-center gap-2")}>
        {ready.length > 0 ? (
          <Button
            variant="accent"
            disabled={pending || done.reports > 0}
            onClick={() => onConfirm(ready)}
          >
            <HardHat className="size-4" />
            {done.reports > 0
              ? `Отчёт заведён: ${done.reports}`
              : ready.length > 1
                ? `Верно: завести ${ready.length} записи`
                : "Верно: завести отчёт"}
          </Button>
        ) : null}
        {prefill ? (
          <Button
            variant="secondary"
            disabled={pending || done.request}
            onClick={() => onRequest(prefill)}
          >
            <PackageSearch className="size-4" />
            {done.request ? "Заявка создана" : "Создать заявку снабжению"}
          </Button>
        ) : null}
      </div>
      <p className="text-caption text-text-3 mt-2">
        Пока вы не нажали, это черновик: в сводку объекта он не попадает. Отчёт проходит проверку,
        заявка уходит снабжению — ничего не заказывается автоматически.
      </p>
    </WidgetCard>
  );
}
