import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUp,
  Check,
  CornerDownRight,
  FileSpreadsheet,
  ScrollText,
  Sparkles,
  Users,
} from "lucide-react";
import {
  ASK_SUGGESTIONS,
  fmtHours,
  fmtRate,
  fmtRub,
  useGasActor,
  useGasAsk,
  type AskAnswer,
  type AskMetric,
  type AskSource,
} from "@/api/gas-ops";
import { useGasBrand } from "@/lib/gas-ops/contour";
import { cn } from "@/lib/utils";

/**
 * «Спросить ГАЙКУ» (ADR-052): вопрос обычными словами и ответ карточкой с числами и сносками,
 * как у Perplexity. Пустой экран: поле по центру и подсказки. Дальше лента вопросов и ответов,
 * поле внизу. Ответ собирает правило domain по данным недели, модели нет, это сказано под ответом.
 */
interface Turn {
  id: number;
  question: string;
  answer: AskAnswer;
}

const STAGES = ["Ищу в записях недели", "Считаю по смете", "Собираю ответ"] as const;

function formatMetric(metric: AskMetric): string {
  if (metric.value === null) return "нет данных";
  switch (metric.kind) {
    case "rub":
      return fmtRub(metric.value);
    case "hours":
      return fmtHours(metric.value);
    case "rate":
      return fmtRate(metric.value);
    default:
      return String(metric.value);
  }
}

function sourceLink(
  source: AskSource,
  canReview: boolean,
): { to: string; search?: Record<string, string> } {
  switch (source.kind) {
    case "entry":
      return { to: "/gas/entries", search: { q: source.label } };
    case "object":
      return { to: "/gas/entries", search: { q: source.label } };
    case "brigade":
      return { to: "/gas/brigades" };
    case "review":
      return canReview ? { to: "/gas/moderation" } : { to: "/gas/entries" };
    default:
      return { to: "/gas/reports" };
  }
}

const SOURCE_ICON = {
  report: FileSpreadsheet,
  brigade: Users,
  object: ScrollText,
  entry: ScrollText,
  review: Check,
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);
  return reduced;
}

export function AskScreen() {
  const ask = useGasAsk();
  const actor = useGasActor();
  const brand = useGasBrand();
  const canReview = actor.role === "manager" || actor.role === "admin";
  const reduced = useReducedMotion();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const send = (question: string) => {
    const q = question.trim();
    if (!q || pending) return;
    setText("");
    if (reduced) {
      setTurns((list) => [...list, { id: Date.now(), question: q, answer: ask(q) }]);
      return;
    }
    // Этапы текстом, как у сервисов с поиском: видно, что ответ собирается из данных
    setPending(q);
    setStage(0);
  };

  useEffect(() => {
    if (!pending) return;
    if (stage < STAGES.length - 1) {
      const timer = window.setTimeout(() => setStage((s) => s + 1), 280);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setTurns((list) => [...list, { id: Date.now(), question: pending, answer: ask(pending) }]);
      setPending(null);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [pending, stage, ask]);

  useEffect(() => {
    if (turns.length || pending)
      endRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [turns.length, pending, reduced]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send(text);
  };

  const empty = turns.length === 0 && !pending;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col" data-testid="ask-screen">
      {empty ? (
        <section className="flex flex-col items-center pt-6 text-center lg:pt-16">
          <span
            className="grid size-12 place-items-center rounded-full bg-surface-2 text-text"
            aria-hidden
          >
            <Sparkles className="size-6" strokeWidth={1.75} />
          </span>
          <h1 className="mt-5 text-page-title text-text">Спросите о неделе</h1>
          <p className="mt-2 max-w-md text-body text-text-2">
            Обычными словами, как спросили бы менеджера. У каждого числа в ответе будет источник.
          </p>
          <p className="mt-1 text-meta text-text-3 tnum">
            {brand.clientShort} · {brand.periodLabel}
          </p>
          <div className="mt-6 w-full">
            <Composer
              text={text}
              setText={setText}
              onSubmit={submit}
              inputRef={inputRef}
              autoFocus
              busy={false}
            />
          </div>
          <ul className="mt-4 grid w-full gap-2 sm:grid-cols-2" aria-label="Подсказки">
            {ASK_SUGGESTIONS.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => send(suggestion)}
                  className="flex min-h-12 w-full items-center gap-2 rounded-card border border-line bg-surface px-4 py-2 text-left text-body text-text transition-colors duration-100 focus-ring is-hover:bg-surface-2"
                >
                  <CornerDownRight className="size-4 shrink-0 text-text-3" aria-hidden />
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <ol className="flex flex-col gap-8 pt-2 pb-4" aria-label="Вопросы и ответы">
            {turns.map((turn) => (
              <li key={turn.id} className="flex flex-col gap-3">
                <p className="max-w-[85%] self-end rounded-bubble bg-surface-2 px-4 py-2.5 text-body text-text">
                  {turn.question}
                </p>
                <AnswerCard answer={turn.answer} canReview={canReview} onFollowUp={send} />
              </li>
            ))}
            {pending ? (
              <li className="flex flex-col gap-3" aria-live="polite">
                <p className="max-w-[85%] self-end rounded-bubble bg-surface-2 px-4 py-2.5 text-body text-text">
                  {pending}
                </p>
                <ol
                  className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4"
                  aria-label="Собираю ответ"
                >
                  {STAGES.map((label, index) => (
                    <li
                      key={label}
                      className={cn(
                        "flex items-center gap-2 text-body",
                        index < stage
                          ? "text-text-2"
                          : index === stage
                            ? "text-text"
                            : "text-text-3",
                      )}
                    >
                      {index < stage ? (
                        <Check className="size-4 text-ok" strokeWidth={2.5} aria-hidden />
                      ) : (
                        <span
                          aria-hidden
                          className={cn(
                            "size-2 rounded-full",
                            index === stage ? "bg-text motion-safe:animate-pulse" : "bg-line-2",
                          )}
                        />
                      )}
                      {label}
                    </li>
                  ))}
                </ol>
              </li>
            ) : null}
          </ol>
          <div ref={endRef} />
          <div className="sticky bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+8px)] z-10 bg-void pt-2 pb-2 lg:bottom-4">
            <Composer
              text={text}
              setText={setText}
              onSubmit={submit}
              inputRef={inputRef}
              busy={!!pending}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Composer({
  text,
  setText,
  onSubmit,
  inputRef,
  autoFocus = false,
  busy,
}: {
  text: string;
  setText: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  autoFocus?: boolean;
  busy: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex items-end gap-2 rounded-card border border-line-2 bg-surface p-2 shadow-sm focus-within:border-text-3"
    >
      <label className="sr-only" htmlFor="ask-input">
        Вопрос
      </label>
      <textarea
        id="ask-input"
        ref={inputRef}
        rows={1}
        value={text}
        autoFocus={autoFocus}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            (event.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
          }
        }}
        placeholder="Спросите о неделе"
        maxLength={200}
        className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-body text-text outline-none placeholder:text-text-3"
      />
      <button
        type="submit"
        disabled={!text.trim() || busy}
        aria-label="Спросить"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-text text-void transition-opacity duration-100 focus-ring disabled:opacity-30"
      >
        <ArrowUp className="size-5" strokeWidth={2.25} aria-hidden />
      </button>
    </form>
  );
}

function AnswerCard({
  answer,
  canReview,
  onFollowUp,
}: {
  answer: AskAnswer;
  canReview: boolean;
  onFollowUp: (question: string) => void;
}) {
  return (
    <article
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-5"
      data-testid="ask-answer"
      data-intent={answer.intent}
    >
      <header className="flex items-center gap-2 text-meta text-text-3">
        <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
        ГАЙКА · по данным недели
      </header>
      <div>
        <h2 className="text-heading text-text">{answer.title}</h2>
        <p className="mt-1 text-body text-text-2">{answer.lead}</p>
      </div>

      {answer.metrics.length ? (
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-control border border-line bg-line">
          {answer.metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 bg-surface px-3 py-2.5">
              <dt className="text-meta text-text-3">{metric.label}</dt>
              <dd className="mt-0.5 text-body-strong text-text tnum">{formatMetric(metric)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {answer.rows.length ? (
        <ul className="flex flex-col [&>li+li]:border-t [&>li+li]:border-line">
          {answer.rows.map((row, index) => {
            const source = row.source ? answer.sources[row.source - 1] : null;
            const link = source ? sourceLink(source, canReview) : null;
            return (
              <li key={`${row.label}-${index}`} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-text">{row.label}</span>
                  {row.sub ? (
                    <span className="block truncate text-meta text-text-3">{row.sub}</span>
                  ) : null}
                </span>
                {row.metric ? (
                  <span className="shrink-0 text-body-strong text-text tnum">
                    {formatMetric(row.metric)}
                  </span>
                ) : null}
                {link && row.source ? (
                  <Link
                    to={link.to}
                    {...(link.search ? { search: link.search } : {})}
                    aria-label={`Источник ${row.source}: ${source!.label}`}
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-meta-strong text-text-2 tnum focus-ring is-hover:text-text"
                  >
                    {row.source}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {answer.sources.length ? (
        <div>
          <p className="text-meta text-text-3">Источники</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {answer.sources.slice(0, 5).map((source, index) => {
              const link = sourceLink(source, canReview);
              const Icon = SOURCE_ICON[source.kind];
              return (
                <li key={`${source.kind}-${source.id ?? index}`}>
                  <Link
                    to={link.to}
                    {...(link.search ? { search: link.search } : {})}
                    className="inline-flex min-h-9 max-w-64 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-meta text-text-2 focus-ring is-hover:bg-surface-2 is-hover:text-text"
                  >
                    <span className="text-meta-strong text-text tnum">{index + 1}</span>
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{source.label}</span>
                  </Link>
                </li>
              );
            })}
            {answer.sources.length > 5 ? (
              <li className="inline-flex min-h-9 items-center px-2 text-meta text-text-3">
                ещё {answer.sources.length - 5}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {answer.followUps.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-meta text-text-3">Спросить дальше</p>
          <div className="flex flex-wrap gap-2">
            {answer.followUps.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => onFollowUp(question)}
                className="inline-flex min-h-11 items-center rounded-full border border-line-2 px-4 text-body text-text focus-ring is-hover:bg-surface-2"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="border-t border-line pt-3 text-meta text-text-3">
        Демо: ответ собрало правило по данным недели, без модели. Числа те же, что в отчёте.
      </p>
    </article>
  );
}
