import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Подпись поля 12px/500 --text-2 с отступом 8px, подсказка или ошибка под полем */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  /** Одно поле ввода: ему передаются id и aria-describedby */
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
  className?: string;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        ...(note ? { "aria-describedby": noteId } : {}),
        ...(error ? { "aria-invalid": true } : {}),
      })
    : children;

  return (
    <div className={cn("min-w-0", className)}>
      <label
        htmlFor={children.props.id ?? id}
        className="mb-2 block text-[12px] leading-[1.4] font-medium text-text-2"
      >
        {label}
      </label>
      {control}
      {note && (
        <p
          id={noteId}
          className={cn("mt-2 text-[12px] leading-[1.4]", error ? "text-danger" : "text-text-3")}
        >
          {note}
        </p>
      )}
    </div>
  );
}
