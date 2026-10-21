/**
 * Статусы и метки ADR-045, разделы 3.5 и 4.10: статус точкой 8 и словом в строке пояснения,
 * метки 24 в одну строку, не больше двух и «+N».
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { STATUS_WORD, type EntryStatus } from "@/lib/ui/kit-logic";
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
   * Метки не сжимаются и не переносятся: сколько их влезает в ширину строки, столько видно
   * (не больше `max`), остальные в «+N». Ширина каждой метки меряется заранее: не влезающие
   * лежат в разметке невидимыми, поэтому при расширении строки они возвращаются.
   */
  const ref = useRef<HTMLUListElement>(null);
  const items = chips.slice(0, max);
  const [fit, setFit] = useState(items.length);
  const [tick, setTick] = useState(0);
  // Естественная ширина метки: сжатая единственная метка меряется по прошлому замеру
  const natural = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const width = el.clientWidth;
    const nodes = [...el.querySelectorAll<HTMLElement>("[data-chip]")];
    const widths = nodes.map((node) => {
      const label = node.dataset["chip"] ?? "";
      const shrunk = node.dataset["shrunk"] === "true";
      if (!shrunk) natural.current.set(label, node.offsetWidth);
      return natural.current.get(label) ?? node.offsetWidth;
    });
    const plus = el.querySelector<HTMLElement>("[data-chip-more]")?.offsetWidth ?? 36;
    const gap = 4;
    let next = 1;
    for (let k = nodes.length; k >= 1; k--) {
      const used = widths.slice(0, k).reduce((sum, w) => sum + w, 0) + gap * (k - 1);
      const more = chips.length > k ? gap + plus : 0;
      if (used + more <= width + 0.5) {
        next = k;
        break;
      }
    }
    setFit(next);
  }, [chips, max, tick]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - last) < 1) return;
      last = el.clientWidth;
      setTick((t) => t + 1);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!chips.length) return null;
  const visible = Math.min(fit, items.length);
  const rest = chips.length - visible;
  return (
    <ul
      ref={ref}
      className={cn(
        "relative flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden",
        className,
      )}
    >
      {items.map((chip, i) => (
        <li
          key={chip.label}
          data-chip={chip.label}
          data-shrunk={i < visible && visible === 1 ? "true" : undefined}
          aria-hidden={i >= visible || undefined}
          className={cn(
            i >= visible ? "invisible absolute" : visible === 1 ? "min-w-0 shrink" : "shrink-0",
          )}
        >
          <Chip tone={chip.tone ?? "info"}>{chip.label}</Chip>
        </li>
      ))}
      {rest > 0 ? (
        <li className="shrink-0" data-chip-more>
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
