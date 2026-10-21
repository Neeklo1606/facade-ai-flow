/**
 * Карточка факта в очереди, как событие календаря в референсе (ADR-044, раздел 2): цветная
 * полоса источника слева, вид работ крупно, объём справа на месте времени, исходная фраза
 * рядом с полями. Свайп вправо принимает, влево возвращает, кнопки дублируют свайп.
 *
 * Кнопки решения стоят только у карточки, до которой дошла очередь: у остальных карточек
 * действие одно — открыть детали. Иначе на экране столько акцентов, сколько карточек.
 */
import { Check, Image, PencilLine, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDirectory } from "@/api/directory";
import { fmtNum, fmtTime, metaLine, plural, shortName } from "@/lib/format";
import { useSwipe } from "@/hooks/use-swipe";
import { cn } from "@/lib/utils";
import { sourceMarker, sourceTone, type FactRow } from "./model";
import { useFactDecision } from "./use-decision";

export function FactCard({
  row,
  current,
  selected,
  accent,
  onOpen,
}: {
  row: FactRow;
  /** Карточка, до которой дошла очередь: у неё кнопки решения */
  current: boolean;
  /** Открыта в панели деталей (десктоп) */
  selected: boolean;
  /** Главное действие залито акцентом: на десктопе акцент у панели деталей */
  accent: boolean;
  onOpen: () => void;
}) {
  const { card, projectName, zoneName } = row;
  const { report, source, evidence } = card;
  const { employeeName } = useDirectory();
  const decision = useFactDecision(row);
  const { mayDecide } = decision;
  const tone = sourceTone(source);

  const swipe = useSwipe({
    ...(mayDecide ? { onRight: () => decision.accept(), onLeft: decision.back } : {}),
  });

  return (
    <li className="relative">
      {/* Подложка свайпа: видна только под пальцем и говорит, что случится при отпускании */}
      {swipe.shift !== 0 ? (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center rounded-[var(--r-xl)] px-6 text-[15px] font-semibold",
            swipe.shift > 0
              ? "justify-start bg-ok-bg text-ok"
              : "justify-end bg-danger-bg text-danger",
          )}
          style={{ opacity: 0.4 + swipe.progress * 0.6 }}
        >
          {swipe.shift > 0 ? (
            <span className="inline-flex items-center gap-2">
              <Check className="size-5" /> Принять
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              Вернуть <Undo2 className="size-5" />
            </span>
          )}
        </div>
      ) : null}

      <article
        {...(mayDecide ? swipe.handlers : {})}
        style={swipe.shift ? { transform: `translateX(${swipe.shift}px)` } : undefined}
        data-current={current || undefined}
        className={cn(
          "card-v3 relative touch-pan-y px-4 py-4 sm:px-5",
          !swipe.shift && "transition-fast",
          selected && "ring-2 ring-text/40",
        )}
      >
        {/*
          Вся карточка открывает детали: кнопка лежит под содержимым, а содержимое пропускает
          касания к ней. Кнопки решения стоят выше и ловят касания сами.
        */}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Подробнее: ${report.workType}, ${zoneName}`}
          className="absolute inset-0 rounded-[var(--r-xl)] focus-ring is-hover:bg-surface-2/40"
        />
        <div className="pointer-events-none relative">
          <div className="flex min-w-0 items-stretch gap-3">
            <span aria-hidden className={cn("w-[3px] shrink-0 rounded-full", tone.bar)} />
            <div className="min-w-0 flex-1">
              <h3 className="text-[19px] leading-[25px] font-semibold tracking-[-0.01em] text-balance sm:text-[20px] sm:leading-[26px]">
                {report.workType}
              </h3>
              <p className="mt-1 text-[14px] leading-5 text-text-2">
                {metaLine(zoneName, shortName(projectName), employeeName(report.authorId))}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[24px] leading-[28px] font-semibold tracking-[-0.02em] tnum">
                {fmtNum(report.declaredQty ?? 0)}
              </div>
              <div className="mt-0.5 text-[13px] leading-4 text-text-3">
                {report.unit}
                {report.sentAt ? <span className="tnum"> · {fmtTime(report.sentAt)}</span> : null}
              </div>
            </div>
          </div>

          {/* Источник значения рядом с ним: откуда пришло и что сказано (правило 2) */}
          <div className="mt-3 rounded-[18px] bg-surface-2 px-3.5 py-3">
            <div className="flex items-center gap-2 text-[13px] leading-4 text-text-3">
              {source ? (
                <span data-marker="" className="text-marker">
                  {sourceMarker(source)}
                </span>
              ) : null}
              {evidence.length > 0 ? (
                <span className="ms-auto inline-flex items-center gap-1 tnum">
                  <Image className="size-3.5" aria-hidden />
                  {fmtNum(evidence.length)} {plural(evidence.length, "фото", "фото", "фото")}
                </span>
              ) : null}
            </div>
            <p
              className={cn(
                "mt-1.5 text-[15px] leading-[21px] text-text",
                !current && "line-clamp-2",
              )}
            >
              «{report.summary}»
            </p>
          </div>
        </div>

        {current && mayDecide ? (
          <div className="relative mt-4 flex items-center gap-2">
            <Button
              variant={accent ? "accent" : "secondary"}
              className="h-12 min-w-0 flex-1 rounded-full text-[16px] font-semibold"
              onClick={() => decision.accept()}
            >
              <Check className="size-5" /> Принять
            </Button>
            <Button
              variant="secondary"
              aria-label="Исправить объём"
              className="h-12 shrink-0 rounded-full px-4"
              onClick={decision.openQty}
            >
              {/* На самых узких телефонах подпись короче, имя кнопки прежнее */}
              <PencilLine className="size-4 min-[400px]:hidden" />
              <span className="min-[400px]:hidden">Объём</span>
              <span className="hidden min-[400px]:inline">Исправить объём</span>
            </Button>
            <Button
              variant="secondary"
              aria-label="Вернуть на уточнение"
              title="Вернуть на уточнение"
              className="size-12 shrink-0 rounded-full p-0"
              onClick={decision.back}
            >
              <Undo2 className="size-5" />
            </Button>
          </div>
        ) : null}
        {current && !mayDecide ? (
          <p className="mt-4 text-[13px] text-text-3">
            Решение принимают ПТО и руководитель проекта.
          </p>
        ) : null}
      </article>
      {decision.qtySheet}
    </li>
  );
}
