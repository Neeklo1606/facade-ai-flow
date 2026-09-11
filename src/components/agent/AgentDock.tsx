import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowUp, Check, Loader2, Sparkle, X } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { findNavItem } from "@/lib/navigation";
import { ALL_SITES } from "@/lib/app-context";
import { sites } from "@/mock/sites";
import { runAgent, suggestionsByRoute, defaultSuggestions, type AgentAnswer } from "@/lib/agent-engine";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Turn {
  id: number;
  q: string;
  a: AgentAnswer;
  stepIndex: number;
  done: boolean;
}

const toneClass: Record<string, string> = {
  danger: "bg-danger-bg text-danger",
  warn: "bg-warn-bg text-warn",
  ok: "bg-ok-bg text-ok",
  info: "bg-info-bg text-info",
};

export function AgentDock() {
  const { agentPanelOpen, setAgentPanelOpen, siteId } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navItem = findNavItem(pathname);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const suggestions = useMemo(
    () => suggestionsByRoute[pathname] ?? defaultSuggestions,
    [pathname],
  );
  const siteLabel = siteId === ALL_SITES ? "Все объекты" : (sites.find((s) => s.id === siteId)?.name ?? "Объект");

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    const answer = runAgent(text);
    const id = Date.now();
    setTurns((t) => [...t, { id, q: text, a: answer, stepIndex: 0, done: false }]);
    setInput("");
    answer.steps.forEach((_, i) => {
      timers.current.push(
        setTimeout(
          () => setTurns((t) => t.map((x) => (x.id === id ? { ...x, stepIndex: i + 1 } : x))),
          420 * (i + 1),
        ),
      );
    });
    timers.current.push(
      setTimeout(
        () => setTurns((t) => t.map((x) => (x.id === id ? { ...x, done: true } : x))),
        420 * answer.steps.length + 260,
      ),
    );
  };

  if (!agentPanelOpen) return null;

  return (
    <aside
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-surface",
        "lg:relative lg:inset-auto lg:z-20 lg:h-full lg:w-[420px] lg:shrink-0 lg:border-l lg:border-border lg:rounded-l-[var(--r-lg)]",
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-subtle text-accent">
          <Sparkle className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">Агент проекта</div>
          <div className="truncate text-[11px] text-text-muted">
            Контекст: {navItem?.label ?? "Раздел"} · {siteLabel}
          </div>
        </div>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => setTurns([])}
            className="focus-ring hidden h-9 items-center rounded-full px-3 text-[12px] text-text-secondary hover:bg-hover sm:flex"
          >
            Очистить
          </button>
        )}
        <button
          type="button"
          onClick={() => setAgentPanelOpen(false)}
          aria-label="Закрыть агента"
          className="focus-ring grid size-11 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-hover lg:size-9"
        >
          <X className="size-5 lg:size-4" />
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
        {turns.length === 0 && (
          <div className="rounded-[var(--r-md)] border border-border bg-raised p-4">
            <p className="text-[13px] font-medium">Поставьте задачу — выполню по данным системы</p>
            <p className="mt-1 text-caption text-text-secondary">
              Я вижу объекты, задачи, риски, склад, поставщиков, документы и входящие. Каждый ответ — со ссылкой на
              источник и переходом в нужный раздел.
            </p>
          </div>
        )}

        {turns.map((t) => (
          <div key={t.id} className="space-y-2">
            <div className="ml-auto w-fit max-w-[88%] rounded-[var(--r-md)] bg-accent-subtle px-3 py-2 text-[13px] text-accent">
              {t.q}
            </div>

            <ol className="space-y-1.5">
              {t.a.steps.map((s, i) => {
                const active = i === t.stepIndex && !t.done;
                const complete = i < t.stepIndex || t.done;
                return (
                  <li key={s} className="flex items-center gap-2 text-caption text-text-secondary">
                    {complete ? (
                      <Check className="size-3.5 shrink-0 text-ok" />
                    ) : active ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" />
                    ) : (
                      <span className="size-3.5 shrink-0 rounded-full border border-border" />
                    )}
                    <span className={cn("min-w-0 truncate", complete && "text-text-muted")}>{s}</span>
                  </li>
                );
              })}
            </ol>

            {t.done && (
              <div className="space-y-3 rounded-[var(--r-md)] border border-border bg-raised p-3">
                <p className="text-[13px] leading-relaxed">{t.a.text}</p>
                <ConfidenceIndicator value={t.a.confidence} />

                {t.a.entities.length > 0 && (
                  <ul className="space-y-1.5">
                    {t.a.entities.map((e) => (
                      <li key={`${e.kind}-${e.id}`}>
                        <Link
                          to={e.to}
                          className="focus-ring flex min-h-11 items-center gap-2 rounded-[var(--r-sm)] border border-border bg-surface px-2.5 py-2 transition-fast hover:bg-hover"
                        >
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              toneClass[e.tone ?? "info"],
                            )}
                          >
                            {e.kind}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium">{e.title}</span>
                            {e.subtitle && <span className="block truncate text-[11px] text-text-muted">{e.subtitle}</span>}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {t.a.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {t.a.actions.map((a) =>
                      a.to ? (
                        <Link
                          key={a.label}
                          to={a.to}
                          onClick={() => a.toast && toast.success(a.toast)}
                          className="focus-ring inline-flex min-h-9 items-center rounded-full bg-ink px-3 text-[12px] font-medium text-primary-foreground transition-fast hover:opacity-90"
                        >
                          {a.label}
                        </Link>
                      ) : (
                        <button
                          key={a.label}
                          type="button"
                          onClick={() => a.toast && toast.success(a.toast)}
                          className="focus-ring inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3 text-[12px] font-medium transition-fast hover:bg-hover"
                        >
                          {a.label}
                        </button>
                      ),
                    )}
                  </div>
                )}

                {t.a.sources.length > 0 && (
                  <p className="text-[11px] text-text-muted">Источники: {t.a.sources.join(" · ")}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] text-text-secondary transition-fast hover:bg-hover"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2 rounded-[var(--r-md)] border border-border bg-surface p-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={1}
            placeholder="Поставьте задачу агенту…"
            className="focus-ring max-h-32 min-h-11 w-full flex-1 resize-none bg-transparent px-1.5 py-2.5 text-[13px] outline-none placeholder:text-text-muted"
          />
          <button
            type="submit"
            aria-label="Отправить"
            disabled={!input.trim()}
            className="focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-ink text-primary-foreground transition-fast disabled:opacity-40 lg:size-10"
          >
            <ArrowUp className="size-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
