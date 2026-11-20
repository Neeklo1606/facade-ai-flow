/**
 * Компоненты дизайн-системы «Тепло» (docs/design/design-system-warm.md): точечная цифра,
 * карточка главного показателя, полоса из сегментов, плитка действия, аватар, приветствие.
 * Цвета и форма — классы `warm-*` из src/styles/gas-warm.css.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- DotNumber */

/** Знаки 5×7: строка — пять клеток, «1» — точка */
const GLYPHS: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ",": ["0", "0", "0", "0", "0", "1", "1"],
  ".": ["0", "0", "0", "0", "0", "0", "1"],
  "-": ["000", "000", "000", "111", "000", "000", "000"],
  " ": ["0", "0", "0", "0", "0", "0", "0"],
};

function Glyph({ char }: { char: string }) {
  const rows = GLYPHS[char] ?? GLYPHS[" "]!;
  const w = rows[0]!.length;
  return (
    <svg viewBox={`0 0 ${w * 10} 70`} aria-hidden focusable="false">
      {rows.flatMap((row, y) =>
        [...row].map((cell, x) => (
          <circle
            key={`${x}-${y}`}
            cx={x * 10 + 5}
            cy={y * 10 + 5}
            r={3.6}
            opacity={cell === "1" ? 1 : 0.14}
          />
        )),
      )}
    </svg>
  );
}

/**
 * Число точками, как табло. Только для одной главной цифры экрана: в строках и таблицах обычные
 * цифры. `label` — то, что читает экранный диктор («1 700 469 рублей»); `suffix` пишется обычным
 * шрифтом рядом («ч», «₽», «М»)
 */
export function DotNumber({
  value,
  suffix,
  label,
  className,
}: {
  value: string;
  suffix?: string;
  label: string;
  className?: string;
}) {
  return (
    <span role="img" aria-label={label} className={cn("warm-dot", className)}>
      {[...value].map((char, i) => (
        <Glyph key={i} char={char} />
      ))}
      {suffix ? <span className="warm-dot-text">{suffix}</span> : null}
    </span>
  );
}

/** «1 700 469» → «1,70» и «М»; до миллиона — тысячи с пробелом */
export function dotMoney(rub: number): { value: string; suffix: string } {
  if (Math.abs(rub) >= 1_000_000)
    return {
      value: (rub / 1_000_000).toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      suffix: "млн ₽",
    };
  return { value: Math.round(rub).toLocaleString("ru-RU").replace(/\s/g, " "), suffix: "₽" };
}

/* ---------------------------------------------------------------- SplitProgress */

export interface Segment {
  value: number;
  tone: "light" | "accent" | "dim" | "ink" | "track";
}

/** Полоса из сегментов: принято / ждёт / уточнить, доля раздела */
export function SplitProgress({ segments, label }: { segments: Segment[]; label: string }) {
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div className="warm-split" role="img" aria-label={label}>
      {visible.map((s, i) => (
        <span key={i} data-tone={s.tone} style={{ flex: s.value }} />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- KpiCard */

/** Карточка главной цифры: подпись, период, точечное число, полоса и легенда */
export function KpiCard({
  title,
  period,
  children,
  progress,
  legend,
  className,
}: {
  title: string;
  period?: string;
  children: ReactNode;
  progress?: ReactNode;
  legend?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn("warm-kpi flex flex-col gap-3 p-5", className)}>
      <div className="warm-kpi-meta flex justify-between gap-3 text-meta">
        <span>{title}</span>
        {period ? <span>{period}</span> : null}
      </div>
      <div className="warm-kpi-number">{children}</div>
      <div className="mt-auto flex flex-col gap-2">
        {progress}
        {legend ? <div className="flex flex-wrap gap-x-4 gap-y-1 text-meta">{legend}</div> : null}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- ActionTile */

/** Плитка быстрого действия: круг с иконкой и подпись. `inverse` — главная, чёрная */
export function ActionTile({
  icon,
  label,
  to,
  search,
  onClick,
  inverse,
  disabled,
  hint,
  dataTour,
  testId,
}: {
  icon: ReactNode;
  label: string;
  /** Подпись под названием мелким шрифтом: «ул. Демо, 102, 07:00–15:00» */
  hint?: string;
  dataTour?: string;
  testId?: string;
  to?: string;
  search?: Record<string, string>;
  onClick?: () => void;
  inverse?: boolean;
  disabled?: boolean;
}) {
  const body = (
    <>
      <span className="warm-tile-icon [&_svg]:size-5" aria-hidden>
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-body-strong">{label}</span>
        {hint ? <span className="text-meta opacity-80">{hint}</span> : null}
      </span>
    </>
  );
  if (to)
    return (
      <Link
        to={to}
        search={search as never}
        className="warm-tile focus-ring"
        data-variant={inverse ? "inverse" : undefined}
        data-tour={dataTour}
        data-testid={testId}
      >
        {body}
      </Link>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="warm-tile focus-ring disabled:opacity-45"
      data-variant={inverse ? "inverse" : undefined}
      data-tour={dataTour}
      data-testid={testId}
    >
      {body}
    </button>
  );
}

/* ---------------------------------------------------------------- Avatar */

/** Инициалы: «Бригада 2» → «Б2», «ул. Демо, 102» → «Д1» */
export function initialsOf(text: string): string {
  const clean = text.replace(/^(ул|ст|х|г|п|пр|пер|с|д)\.\s*/i, "").trim();
  const number = /\d+/.exec(clean)?.[0];
  const letter = /[A-Za-zА-Яа-яЁё]/.exec(clean)?.[0]?.toUpperCase() ?? "•";
  return number ? `${letter}${number.slice(0, 2)}` : clean.slice(0, 2).toUpperCase();
}

function toneOf(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 5;
}

/** Круг с инициалами, пастель по хешу ключа: бригада, объект, сотрудник */
export function Avatar({
  name,
  id,
  size = 44,
  className,
}: {
  name: string;
  id?: string;
  size?: 36 | 40 | 44 | 48;
  className?: string;
}) {
  const fontSize = size <= 36 ? 12 : size <= 40 ? 13 : 14;
  return (
    <span
      aria-hidden
      className={cn("warm-avatar", className)}
      data-tone={toneOf(id ?? name)}
      style={{ width: size, height: size, fontSize }}
    >
      {initialsOf(name)}
    </span>
  );
}

/* ---------------------------------------------------------------- ScreenHello */

/** Приветствие серым и итог экрана крупно, на одну-две строки */
export function ScreenHello({
  greeting,
  title,
  className,
}: {
  greeting: ReactNode;
  title: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-body text-text-2">{greeting}</p>
      <h1 className="warm-hello-title mt-1 text-title text-balance lg:text-display">{title}</h1>
    </div>
  );
}

/** Приветствие по времени суток: «Доброе утро» до 12, «Добрый день» до 18 */
export function greetingAt(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}
