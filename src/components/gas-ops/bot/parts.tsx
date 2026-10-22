/**
 * Детали мессенджера для бота бригадира (ADR-044, F4): пузыри, inline-кнопки, поле ответа.
 * Только то, что умеет бот MAX: сообщение бота, кнопки под ним и ответ сообщением.
 */
import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useGasBrand } from "@/lib/gas-ops/contour";
import { cn } from "@/lib/utils";

/** Появление сообщения: снизу и из прозрачности. prefers-reduced-motion выключает сдвиг */
const APPEAR =
  "animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none";

export function ChatHeader() {
  const brand = useGasBrand();
  return (
    <div className="line-bottom z-10 flex h-sheet-head shrink-0 items-center gap-3 bg-surface px-4">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-orange-strong text-body-strong text-on-orange"
      >
        г
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-heading">Учёт времени</p>
        <p className="text-meta truncate text-text-3">бот · {brand.clientShort}</p>
      </div>
    </div>
  );
}

/** Служебная строка посреди ленты: дата, пометка о канале */
export function SystemNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-meta mx-auto max-w-[300px] rounded-full bg-surface/70 px-3 py-1 text-center text-text-2">
      {children}
    </p>
  );
}

export function BotBubble({
  children,
  keys,
  animate = false,
}: {
  children: ReactNode;
  keys?: ReactNode;
  animate?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex max-w-[92%] flex-col gap-2 self-start",
        // Кнопки под сообщением во всю ширину колонки бота, как inline-клавиатура
        keys ? "w-full" : null,
        animate && APPEAR,
      )}
    >
      <div className="self-start rounded-bubble rounded-bl-[var(--r-xs)] border border-line bg-surface px-3 py-3 text-body text-text">
        {children}
      </div>
      {keys}
    </div>
  );
}

export function MyBubble({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "max-w-[80%] self-end rounded-bubble rounded-br-[var(--r-xs)] bg-orange-dim px-3 py-2.5 text-body text-text",
        APPEAR,
      )}
    >
      {children}
    </div>
  );
}

/** Inline-клавиатура под сообщением бота: колонки как у кнопок мессенджера */
export function Keys({ children, cols = 1 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <div
      role="group"
      aria-label="Ответы"
      className={cn(
        "grid gap-2",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-2",
        cols === 3 && "grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}

export function Key({
  children,
  sub,
  onClick,
  disabled = false,
  recommended = false,
  previous = false,
  tone = "default",
  tour,
  align = "center",
  label,
}: {
  children: ReactNode;
  sub?: ReactNode | undefined;
  onClick?: (() => void) | undefined;
  disabled?: boolean | undefined;
  /** Подсказка показа: мягкая оранжевая обводка и подпись «рекомендуем» */
  recommended?: boolean | undefined;
  /** Значение до исправления: подпись «было» */
  previous?: boolean | undefined;
  tone?: "default" | "primary" | undefined;
  tour?: string | undefined;
  align?: "center" | "start" | undefined;
  label?: string | undefined;
}) {
  const note = disabled ? sub : recommended ? "рекомендуем" : previous ? "было" : sub;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-tour={tour}
      data-recommended={recommended ? "true" : undefined}
      aria-label={label}
      className={cn(
        "flex min-h-field min-w-0 flex-col justify-center rounded-control px-4 py-1.5 text-body-strong transition-[background-color,box-shadow,transform] duration-150 focus-ring press",
        align === "center" ? "items-center text-center" : "items-start text-start",
        tone === "primary"
          ? "bg-orange-strong text-on-orange is-hover:bg-orange-strong-hover"
          : "bg-surface/85 text-text shadow-[var(--lift-1)] is-hover:bg-surface",
        disabled &&
          "cursor-not-allowed border border-dashed border-line-2 bg-transparent text-text-3 shadow-none is-hover:bg-transparent",
        recommended && !disabled && "ring-2 ring-orange-line",
        previous && !recommended && !disabled && "ring-1 ring-line-2",
      )}
    >
      <span className={cn("min-w-0 tnum", align === "start" && "w-full")}>{children}</span>
      {note ? (
        <span
          className={cn(
            "text-meta font-normal",
            recommended && !disabled ? "text-orange" : "text-text-3",
            align === "start" && "w-full",
          )}
        >
          {note}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Поле ответа сообщением, как строка ввода мессенджера. Кнопка отправки 48 px.
 * `mask` приводит набранное к допустимым символам (время: цифры и разделитель).
 */
export function Composer({
  placeholder,
  label,
  onSend,
  mask,
  numeric = false,
}: {
  placeholder: string;
  label: string;
  onSend: (text: string) => void;
  mask?: (text: string) => string;
  numeric?: boolean;
}) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  return (
    <form
      className="glass flex shrink-0 items-center gap-2 px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] lg:pb-3"
      onSubmit={(event) => {
        event.preventDefault();
        const value = text.trim();
        if (!value) return;
        onSend(value);
        setText("");
      }}
    >
      <input
        ref={input}
        value={text}
        onChange={(event) => setText(mask ? mask(event.target.value) : event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        inputMode={numeric ? "decimal" : "text"}
        autoComplete="off"
        enterKeyHint="send"
        className="text-body h-field min-w-0 flex-1 rounded-control border border-line-2 bg-surface px-4 text-text outline-none placeholder:text-text-3 focus-ring tnum"
      />
      <button
        type="submit"
        aria-label="Отправить сообщение"
        disabled={!text.trim()}
        className="grid size-12 shrink-0 place-items-center rounded-full bg-pill text-pill-text transition-opacity focus-ring press disabled:opacity-40"
      >
        <SendHorizontal className="size-5" aria-hidden />
      </button>
    </form>
  );
}
