import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Поле вопроса, прижатое к низу. Свечение под ним — единственный градиент экрана:
 * до диалога 0.55, в диалоге 0.3. Зерно рисуется поверх пятна, поэтому blur его не размывает.
 */
export function AgentComposer({
  dimmed,
  busy,
  onSend,
}: {
  dimmed: boolean;
  busy: boolean;
  onSend: (prompt: string) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ready = value.trim().length > 0 && !busy;

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
    <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center px-4">
      <div className="pointer-events-auto relative isolate w-full sm:w-[90%] lg:w-[680px]">
        <div
          aria-hidden
          className={cn(
            "grain pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[200px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] transition-opacity duration-200 sm:h-[280px] sm:w-[720px]",
            dimmed ? "opacity-30" : "opacity-55",
          )}
        >
          {/* На телефоне blur отключён: то же пятно рисуется радиальным градиентом */}
          <div className="size-full rounded-[50%] bg-[radial-gradient(closest-side,rgba(241,96,1,0.2),rgba(193,8,1,0.1),transparent)] sm:bg-[image:var(--ember-soft)] sm:blur-[120px]" />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
          className="flex min-h-[112px] flex-col rounded-[var(--r-lg)] border border-line bg-surface-2 px-4 pt-3 pb-2.5 transition-fast focus-within:border-orange-line focus-within:ring-3 focus-within:ring-[rgba(232,80,2,0.14)] sm:pt-4 sm:pb-3"
        >
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
            className="min-h-11 flex-1 resize-none bg-transparent text-[15px] leading-[1.45] text-text outline-none placeholder:text-text-3"
          />
          {/* Вложений нет — и кнопки для них нет: отключённая кнопка «появится позже» была
              кнопкой без действия (ADR-015) */}
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={!ready}
              aria-label="Отправить вопрос"
              className="focus-ring grid size-11 place-items-center rounded-full bg-orange-strong text-white shadow-[var(--glow-orange)] transition-fast is-hover:bg-orange-strong-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none lg:size-9"
            >
              <ArrowUp className="size-[18px]" strokeWidth={2} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
