import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Plus } from "lucide-react";
import type { AgentIntent } from "@/api/types";
import { cn } from "@/lib/utils";

/**
 * Поле вопроса, прижатое к низу: стеклянная капсула, как у Catalist, «+ · текст · отправить».
 * «+» открывает готовые вопросы (вложений нет, и кнопки для них нет — ADR-015). Шар под
 * капсулой — единственный свет экрана: до диалога ярче, в диалоге тише.
 */
export function AgentComposer({
  dimmed,
  busy,
  onSend,
  examples,
  onExample,
}: {
  dimmed: boolean;
  busy: boolean;
  onSend: (prompt: string) => void;
  /** Готовые вопросы под «+» */
  examples: { intent: AgentIntent; prompt: string }[];
  onExample: (prompt: string, intent: AgentIntent) => void;
}) {
  const [value, setValue] = useState("");
  const [menu, setMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const ready = value.trim().length > 0 && !busy;

  // Меню готовых вопросов закрывается касанием вне капсулы и клавишей Escape
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (event instanceof window.KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof PointerEvent && boxRef.current?.contains(event.target as Node)) return;
      setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  const send = () => {
    if (!ready) return;
    onSend(value.trim());
    setValue("");
    inputRef.current?.focus();
  };

  // Enter отправляет, Shift+Enter — новая строка
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-4 sm:bottom-8">
      <div
        ref={boxRef}
        className="pointer-events-auto relative isolate w-full sm:w-[90%] lg:w-[720px]"
      >
        <span
          aria-hidden
          className={cn(
            "orb top-1/2 left-1/2 h-[180px] w-[300px] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200 sm:h-[240px] sm:w-[560px]",
            dimmed ? "opacity-20" : "",
          )}
        />

        {menu ? (
          <div
            id="agent-examples"
            role="group"
            aria-label="Готовые вопросы"
            className="glass absolute inset-x-0 bottom-full mb-3 flex flex-col gap-1 rounded-[var(--r-xl)] p-2 shadow-[var(--lift-2)]"
          >
            {examples.map((example) => (
              <button
                key={example.prompt}
                type="button"
                disabled={busy}
                onClick={() => {
                  setMenu(false);
                  onExample(example.prompt, example.intent);
                }}
                className="focus-ring flex min-h-12 items-center rounded-[var(--r-md)] px-4 text-left text-[15px] text-text transition-fast is-hover:bg-surface-2 disabled:opacity-50"
              >
                {example.prompt}
              </button>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
          className="glass flex min-h-16 items-end gap-2 rounded-[32px] p-2 shadow-[var(--lift-2)] ring-1 ring-line ring-inset transition-fast focus-within:ring-line-2"
        >
          <button
            type="button"
            aria-label="Готовые вопросы"
            aria-expanded={menu}
            aria-controls={menu ? "agent-examples" : undefined}
            onClick={() => setMenu((open) => !open)}
            className="focus-ring grid size-12 shrink-0 place-items-center rounded-full text-text-2 transition-fast is-hover:bg-surface-2 is-hover:text-text"
          >
            <Plus className={cn("size-5 transition-transform", menu && "rotate-45")} aria-hidden />
          </button>
          <label htmlFor="agent-prompt" className="sr-only">
            Вопрос системе
          </label>
          <textarea
            id="agent-prompt"
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Спросите систему"
            rows={1}
            maxLength={2000}
            className="max-h-40 min-h-12 flex-1 resize-none self-center bg-transparent py-3 text-[16px] leading-6 text-text outline-none [field-sizing:content] placeholder:text-text-3"
          />
          <button
            type="submit"
            disabled={!ready}
            aria-label="Отправить вопрос"
            className="focus-ring grid size-12 shrink-0 place-items-center rounded-full bg-pill text-pill-text transition-fast disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-text-3"
          >
            <ArrowUp className="size-5" strokeWidth={2} />
          </button>
        </form>
      </div>
    </div>
  );
}
