/**
 * Вопросы к согласованию (ADR-044, F7, п. 1): рабочий лист встречи. Десять вопросов в порядке
 * важности для расчёта, у каждого пример из данных, на что влияет, экран, ответ и статус.
 * Ответы живут только в этом браузере (localStorage в try/catch): это не данные системы.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { ScreenHint } from "@/components/gas-ops/page";
import {
  GAS_QUESTIONS,
  questionsText,
  readAnswers,
  writeAnswers,
  type QuestionAnswer,
  type QuestionStatus,
} from "@/lib/gas-ops/questions";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Нет разрешения на буфер: ниже запасной путь через выделение
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function QuestionsScreen() {
  const [answers, setAnswers] = useState<Record<number, QuestionAnswer>>({});
  const [loaded, setLoaded] = useState(false);

  // Ответы читаются после монтирования: сервер не знает, что записано в браузере
  useEffect(() => {
    setAnswers(readAnswers());
    setLoaded(true);
  }, []);

  // Якорь #q-<n> из меток «Требует согласования»: прокрутка после отрисовки
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const target = document.getElementById(hash);
    target?.scrollIntoView({ block: "start" });
  }, []);

  const update = (n: number, part: Partial<QuestionAnswer>) => {
    setAnswers((current) => {
      const prev = current[n] ?? { answer: "", status: "open" as QuestionStatus };
      const next = { ...current, [n]: { ...prev, ...part } };
      writeAnswers(next);
      return next;
    });
  };

  const answered = GAS_QUESTIONS.filter((q) => answers[q.n]?.status === "answered").length;

  const copy = async () => {
    const ok = await copyText(questionsText(answers));
    if (ok) toast.success("Список скопирован");
    else toast.error("Не удалось скопировать. Выделите текст вопросов вручную.");
  };

  return (
    <div className="flex flex-col gap-6">
      <ScreenHint screen="questions" className="mb-0" />

      <section className="hero-field flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <span aria-hidden className="orb -top-24 -left-16 size-[260px]" />
        <div>
          <p className="text-[13px] text-text-3">Ответ получен</p>
          <p className="text-hero-num mt-1" data-testid="questions-progress">
            {answered}
            <span className="tone-2"> из {GAS_QUESTIONS.length}</span>
          </p>
          <p className="mt-3 max-w-[520px] text-[14px] leading-5 text-text-2">
            Вопросы идут в порядке важности для расчёта. Ответы сохраняются только в этом браузере.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="pill-action press focus-ring w-full sm:w-auto"
        >
          <Copy className="size-4" aria-hidden />
          Скопировать список
        </button>
      </section>

      <ol className="flex flex-col gap-3">
        {GAS_QUESTIONS.map((q) => {
          const a = answers[q.n];
          const status: QuestionStatus = a?.status ?? "open";
          return (
            <li
              key={q.n}
              id={`q-${q.n}`}
              data-testid={`question-${q.n}`}
              className="card-v3 scroll-mt-24 p-5 target:ring-2 target:ring-orange-line sm:p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-8"
            >
              <div className="flex gap-4">
                <span className="tnum grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[14px] font-semibold text-text-2">
                  {q.n}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em] text-balance">
                    {q.question}
                  </h2>
                  <p className="mt-2 text-[14px] leading-5 text-text-2">
                    <span className="text-text-3">Пример из данных. </span>
                    {q.example}
                  </p>
                  <p className="mt-2 text-[14px] leading-5 text-text-2">
                    <span className="text-text-3">Влияет на. </span>
                    {q.impact}
                  </p>
                  <Link
                    to={q.screen.to}
                    className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-medium text-text focus-ring"
                  >
                    Где видно: {q.screen.label}
                    <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 self-start rounded-[var(--r-lg)] bg-surface-2 p-3 sm:p-4 lg:mt-0">
                <label className="flex flex-col gap-2">
                  <span className="text-[13px] font-medium text-text-2">Ответ заказчика</span>
                  <textarea
                    value={a?.answer ?? ""}
                    onChange={(event) => update(q.n, { answer: event.target.value })}
                    disabled={!loaded}
                    rows={2}
                    placeholder="Запишите ответ на встрече"
                    data-testid={`answer-${q.n}`}
                    className="min-h-[72px] w-full resize-y rounded-[var(--r-sm)] bg-surface px-3 py-2.5 text-[15px] leading-6 text-text placeholder:text-text-3 focus-ring"
                  />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div
                    role="radiogroup"
                    aria-label={`Статус вопроса ${q.n}`}
                    className="seg bg-surface!"
                  >
                    {(
                      [
                        { key: "open", label: "Открыт" },
                        { key: "answered", label: "Ответ получен" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        role="radio"
                        aria-checked={status === option.key}
                        data-active={status === option.key}
                        onClick={() => update(q.n, { status: option.key })}
                        disabled={!loaded}
                        data-testid={`status-${q.n}-${option.key}`}
                        className="seg-item focus-ring min-h-11"
                      >
                        {option.key === "answered" && status === "answered" ? (
                          <Check className="size-4" aria-hidden />
                        ) : null}
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <span className={cn("text-[12px] text-text-3")}>
                    Сохраняется только в этом браузере
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
