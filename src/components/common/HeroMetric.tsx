import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Главная метрика с фирменным градиентом. Одна на экран, не больше.
 * Слои: --ember, зерно, затемнение 45% для читаемости, контент.
 *
 * Цвета текста — `--on-ember` и `--on-ember-2`: градиент тёмный в обеих темах, поэтому его
 * подписи теме не подчиняются (ADR-017, п. 4). Читаемость проверяет `expectEmberGradient`.
 */
export function HeroMetric({
  label,
  value,
  unit,
  secondary,
  note,
  noteSummary,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Та же величина в других единицах: строка под значением */
  secondary?: ReactNode;
  note?: ReactNode;
  /**
   * Подпись раскрытия пояснения на телефоне. Пояснение занимает там половину карты, а карта —
   * половину экрана: с этой подписью оно сворачивается и открывается нажатием (ADR-028, п. 4).
   * С 1024 px пояснение видно сразу — там место есть.
   */
  noteSummary?: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative flex flex-col justify-between gap-4 overflow-hidden rounded-[var(--r-lg)] p-6 shadow-[var(--lift-2),var(--glow-soft)]",
        noteSummary ? "min-h-48 lg:min-h-60" : "min-h-60",
        className,
      )}
    >
      {/* .grain задаёт position: relative, поэтому слой градиента — внутри абсолютной обёртки */}
      <div aria-hidden className="absolute inset-0">
        <div className="bg-ember grain size-full" />
      </div>
      {/*
        Затемнение 55%: в сжатой карте (ADR-028) пояснение опускается на светлую часть
        градиента, и при 45% его контраст падал до 4,15:1 при норме 4,5 — поймала проверка
        читаемости на градиенте
      */}
      <div aria-hidden className="absolute inset-0 bg-black/55" />
      <div className="relative text-[12px] leading-[1.4] text-on-ember/85">{label}</div>
      <div className="relative">
        <div className="text-[44px] leading-none font-semibold tracking-[-0.025em] text-on-ember sm:text-[56px]">
          {value}
          {unit && (
            <span className="ml-2 text-[25px] font-semibold tracking-[-0.025em] text-on-ember/75 sm:text-[31px]">
              {unit}
            </span>
          )}
        </div>
        {secondary && (
          <div className="mt-2 text-[20px] leading-[1.2] font-medium text-on-ember/85">
            {secondary}
          </div>
        )}
        {note &&
          (noteSummary ? (
            <>
              {/* Телефон: пояснение под раскрытием. Десктоп: тот же текст сразу */}
              <details className="group mt-1 lg:hidden">
                <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] text-on-ember-2 marker:content-none">
                  {noteSummary}
                  <span aria-hidden className="transition-fast group-open:rotate-180">
                    ⌄
                  </span>
                </summary>
                <div className="pb-1 text-[13px] leading-[1.45] text-on-ember-2">{note}</div>
              </details>
              <div className="mt-3 hidden max-w-[68ch] text-[13px] leading-[1.45] text-on-ember-2 lg:block">
                {note}
              </div>
            </>
          ) : (
            <div className="mt-3 max-w-[68ch] text-[13px] leading-[1.45] text-on-ember-2">
              {note}
            </div>
          ))}
      </div>
    </section>
  );
}
