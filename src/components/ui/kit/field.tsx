/**
 * Поле ввода ADR-045, раздел 4.7: высота 48, подпись над полем text-meta, значение text-body,
 * радиус 10, граница 1 px. Подсказка формата внутри поля, единица справа тише, очистка справа,
 * когда есть значение. Ошибка под полем красным с сутью и только после выхода из поля
 * или отправки формы (`showError`).
 */
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Тихая подсказка под полем */
  hint?: ReactNode;
  /** Текст ошибки: «Окончание раньше начала» */
  error?: string | null;
  /** Показать ошибку сразу (после отправки формы), иначе после выхода из поля */
  showError?: boolean;
  /** Единица справа внутри поля: «₽», «ч», «м²» */
  unit?: string;
  clearable?: boolean;
}

export function Field({
  label,
  value,
  onChange,
  hint,
  error,
  showError = false,
  unit,
  clearable = true,
  className,
  onBlur,
  disabled,
  ...input
}: FieldProps) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const visibleError = error && (touched || showError) ? error : null;
  const describedBy = [hint ? `${id}-hint` : null, visibleError ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-meta text-text-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => {
            setTouched(true);
            onBlur?.(event);
          }}
          aria-invalid={visibleError ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            "h-field w-full rounded-control border bg-surface px-3 text-body text-text outline-none transition-fast placeholder:text-text-3 focus:border-orange-line disabled:cursor-not-allowed disabled:opacity-45",
            visibleError ? "border-danger" : "border-line-2",
            (unit || (clearable && value)) && "pe-16",
          )}
          {...input}
        />
        <span className="absolute inset-y-0 end-1 flex items-center gap-1">
          {unit ? <span className="pe-2 text-body text-text-3">{unit}</span> : null}
          {clearable && value && !disabled ? (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label={`Очистить: ${label}`}
              className="touch-target grid size-8 place-items-center rounded-full text-text-3 focus-ring is-hover:bg-surface-2"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </span>
      </div>
      {visibleError ? (
        <p id={`${id}-error`} role="alert" className="text-meta text-danger">
          {visibleError}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-meta text-text-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
