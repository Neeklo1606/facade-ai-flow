/**
 * Управление «Монохрома» (ADR-055, S3): кнопки, сегменты-таблетки, переключатель, метки
 * статуса и изменения, поле формы, выбор шторкой и шаг количества (состав бригады).
 */
import { ArrowDownRight, ArrowUpRight, ChevronDown, Minus, Plus } from "lucide-react";
import {
  forwardRef,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { PickerSheet, type PickOption } from "@/components/ui/kit/sheet";
import type { Delta } from "@/lib/ui/mono-logic";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- Button */

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Полевое действие прораба и решение: 52 на любой ширине */
  field?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "mono-btn-primary",
  secondary: "mono-btn-secondary",
  quiet: "mono-btn-quiet",
  danger: "mono-btn-danger",
  icon: "mono-btn-icon",
};

/**
 * Кнопка: главная — чёрная таблетка, вторичная — обводка, тихая, опасная, круглая иконка.
 * Высота 48 на телефоне, 44 на компьютере, 52 у полевых. У иконки обязательна подпись.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", field = false, className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("mono-btn focus-ring", VARIANT[variant], field && "mono-btn-field", className)}
      {...props}
    />
  );
});

/* ---------------------------------------------------------------- SegmentedPills */

export interface PillOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Сегменты-таблетки (2.1): дорожка panel-2, выбранный — белая таблетка с тенью, переезжает
 * за 220 мс. Стрелки влево и вправо переключают, как у радиогруппы
 */
export function SegmentedPills<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly PillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    setBox(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [value, options]);
  const move = (step: number) => {
    const index = options.findIndex((o) => o.value === value);
    const next = options[(index + step + options.length) % options.length];
    if (next) onChange(next.value);
  };
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={cn("mono-seg", className)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") move(1);
        else if (event.key === "ArrowLeft") move(-1);
        else return;
        event.preventDefault();
      }}
    >
      {box ? (
        <span
          aria-hidden
          className="mono-seg-indicator slide-indicator"
          style={{ transform: `translateX(${box.left}px)`, width: box.width }}
        />
      ) : null}
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            className="mono-seg-item focus-ring"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Toggle */

/** Переключатель с пружиной 200 мс: «Сравнить с прошлым периодом» */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 type-label">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="mono-toggle focus-ring disabled:opacity-45"
      >
        <span aria-hidden />
      </button>
      {label}
    </label>
  );
}

/* ---------------------------------------------------------------- Метки */

export type StatusTone = "up" | "down" | "caution" | "note" | "neutral";

const TONE: Record<StatusTone, string> = {
  up: "bg-up-bg text-up",
  down: "bg-down-bg text-down",
  caution: "bg-caution-bg text-caution",
  note: "bg-note-bg text-note",
  neutral: "bg-panel-2 text-ink-2",
};

/** Метка статуса: точка и слово на мягкой плашке. Цвет дублирует слово, не заменяет */
export function StatusChip({
  tone,
  children,
  dot = true,
}: {
  tone: StatusTone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={cn("mono-chip", TONE[tone])}>
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Метка изменения по смыслу: зелёная — к лучшему, красная — к худшему, стрелка и процент */
export function DeltaChip({ delta }: { delta: Delta }) {
  const tone: StatusTone = delta.tone === "good" ? "up" : delta.tone === "bad" ? "down" : "neutral";
  const Icon =
    delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus;
  const meaning = delta.tone === "good" ? "лучше" : delta.tone === "bad" ? "хуже" : "без изменений";
  return (
    <span className={cn("mono-chip", TONE[tone])} aria-label={`${delta.label}, ${meaning}`}>
      <Icon aria-hidden />
      {delta.label}
    </span>
  );
}

/* ---------------------------------------------------------------- FormField */

/**
 * Поле формы: подпись над полем, поле 52, подсказка или ошибка под ним. Ошибка связана
 * с полем через aria-describedby и aria-invalid
 */
export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Поле получает id и aria-атрибуты через функцию */
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-label text-ink-2">
        {label}
      </label>
      {children({
        id,
        "aria-invalid": !!error,
        "aria-describedby": error || hint ? noteId : undefined,
      })}
      {error ? (
        <p id={noteId} className="type-small text-down">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="type-small text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Выбор из списка шторкой: поле-кнопка 52, по касанию шторка с поиском (PickerSheet) */
export function SelectSheet({
  label,
  options,
  value,
  onChange,
  placeholder = "Выберите",
}: {
  label: string;
  options: readonly PickOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <FormField label={label}>
      {(props) => (
        <>
          <button
            {...props}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className="mono-input justify-between text-left focus-ring"
          >
            <span className={cn("truncate", !current && "text-ink-3")}>
              {current?.label ?? placeholder}
            </span>
            <ChevronDown className="size-5 shrink-0 text-ink-3" aria-hidden />
          </button>
          <PickerSheet
            open={open}
            onOpenChange={setOpen}
            title={label}
            options={options}
            value={value}
            onPick={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        </>
      )}
    </FormField>
  );
}

/** Шаг количества 52: «−», число, «+» — состав бригады на смене */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  unit,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  unit?: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-2">
      <Button
        variant="secondary"
        field
        aria-label={`Меньше: ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus aria-hidden />
      </Button>
      <output aria-live="polite" className="min-w-16 text-center type-kpi">
        {value}
        {unit ? <span className="ms-1 type-text text-ink-3">{unit}</span> : null}
      </output>
      <Button
        variant="secondary"
        field
        aria-label={`Больше: ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
