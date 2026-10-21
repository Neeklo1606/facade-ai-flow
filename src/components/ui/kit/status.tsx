/**
 * Статусы и метки ADR-045, разделы 3.5 и 4.10: статус точкой 8 и словом в строке пояснения,
 * метки 24 в одну строку, не больше двух и «+N».
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { STATUS_WORD, splitChips, type EntryStatus } from "@/lib/ui/kit-logic";
import { cn } from "@/lib/utils";

export type { EntryStatus };

const STATUS_COLOR: Record<EntryStatus, string> = {
  pending: "var(--status-pending)",
  ok: "var(--status-ok)",
  clarify: "var(--status-clarify)",
  rejected: "var(--status-rejected)",
  draft: "var(--status-draft)",
};

/** Точка 8 цветом статуса. Со словом, если `label` не выключен */
export function StatusDot({
  status,
  label = true,
  className,
}: {
  status: EntryStatus;
  label?: boolean | string;
  className?: string;
}) {
  const word = typeof label === "string" ? label : STATUS_WORD[status];
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: STATUS_COLOR[status] }}
      />
      {label ? <span className="truncate">{word}</span> : <span className="sr-only">{word}</span>}
    </span>
  );
}

/**
 * Тон метки: блокирующие (пересечение, дубль) красным текстом на светлом фоне, требующие
 * решения (нет суммы, вчера, вручную) янтарным, информационные серым.
 */
export type ChipTone = "block" | "decide" | "info" | "neutral";

const CHIP_TONE: Record<ChipTone, string> = {
  block: "bg-danger-bg text-danger",
  decide: "bg-warn-bg text-warn",
  info: "bg-surface-2 text-text-2",
  neutral: "bg-surface-2 text-text-2",
};

export function Chip({
  children,
  tone = "info",
  onRemove,
  onClick,
  className,
}: {
  children: ReactNode;
  tone?: ChipTone;
  /** Крестик снимает фильтр: область касания 44 за счёт отступа */
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Убрать: ${typeof children === "string" ? children : "метку"}`}
          className="touch-target -me-1 grid size-5 place-items-center rounded-full focus-ring"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </>
  );
  const cls = cn(
    "inline-flex h-chip max-w-full shrink-0 items-center gap-1 rounded-full px-2 text-meta-strong whitespace-nowrap",
    CHIP_TONE[tone],
    className,
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(cls, "touch-target focus-ring")}>
        {body}
      </button>
    );
  }
  return <span className={cls}>{body}</span>;
}

/** Метки одной строкой: две видны, остальные «+N». Полный список в детали */
export function ChipRow({
  chips,
  max = 2,
  onMore,
  className,
}: {
  chips: { label: string; tone?: ChipTone }[];
  max?: number;
  /** «+N» открывает полный список */
  onMore?: () => void;
  className?: string;
}) {
  /*
   * Метки не сжимаются и не переносятся: если вторая не влезает в ширину строки, она уходит
   * в «+N». Ширина меряется после отрисовки и при изменении размера.
   */
  const ref = useRef<HTMLUListElement>(null);
  const width = useRef(0);
  const [fit, setFit] = useState(max);
  useLayoutEffect(() => setFit(max), [max, chips.length]);
  // Не влезает: на одну метку меньше, остальное в «+N»
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.scrollWidth > el.clientWidth + 1 && fit > 1) setFit(fit - 1);
  }, [fit]);
  // Ширина строки изменилась: пересчитать с полного числа
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    width.current = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - width.current) < 1) return;
      width.current = el.clientWidth;
      setFit(max);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [max]);
  const { shown, rest } = splitChips(chips, Math.min(max, fit));
  if (!chips.length) return null;
  return (
    <ul
      ref={ref}
      className={cn("flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden", className)}
    >
      {shown.map((chip, i) => (
        // Метки целиком; многоточием сокращается только одна оставшаяся
        <li
          key={chip.label}
          className={shown.length === 1 && i === 0 ? "min-w-0 shrink" : "shrink-0"}
        >
          <Chip tone={chip.tone ?? "info"}>{chip.label}</Chip>
        </li>
      ))}
      {rest ? (
        <li className="shrink-0">
          {onMore ? (
            <Chip tone="neutral" onClick={onMore}>
              +{rest}
            </Chip>
          ) : (
            <Chip tone="neutral">+{rest}</Chip>
          )}
        </li>
      ) : null}
    </ul>
  );
}

/** «Факт» и «Демо»: тихое слово рядом со значением, без заливки (правило честности ADR-043) */
export function SourceWord({ source }: { source: "fact" | "demo" }) {
  return <span className="text-meta text-text-3">{source === "fact" ? "Факт" : "Демо"}</span>;
}
