/**
 * Вопросы к согласованию (ADR-044, F7, п. 1): рабочий лист встречи. Десять вопросов в порядке
 * важности для расчёта, у каждого пример из данных, на что влияет, экран, ответ и статус.
 * Ответы живут только в этом браузере (localStorage в try/catch): это не данные системы.
 * Вид ADR-045, 5.11: строки с номером, вопросом и статусом; нажатие открывает деталь с примером
 * из данных и полем ответа; «Скопировать список» внизу.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ScreenHint } from "@/components/gas-ops/page";
import { useIsDesktop } from "@/components/gas-ops/review/use-layout";
import { Button } from "@/components/ui/button";
import { Sheet, SidePanel } from "@/components/ui/kit/sheet";
import {
  questionsText,
  readAnswers,
  writeAnswers,
  type QuestionAnswer,
  type QuestionStatus,
} from "@/lib/gas-ops/questions";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useGasContour } from "@/lib/gas-ops/contour";

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
  // Вопросы приходят только в личном контуре заказчика (ADR-047)
  const GAS_QUESTIONS = useGasContour().questions;
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
  const desktop = useIsDesktop();
  const [open, setOpen] = useState<number | null>(null);
  const current = GAS_QUESTIONS.find((q) => q.n === open) ?? null;

  const copy = async () => {
    const ok = await copyText(questionsText(GAS_QUESTIONS, answers));
    if (ok) toast.success("Список скопирован");
    else toast.error("Не удалось скопировать. Выделите текст вопросов вручную.");
  };

  const detail = (q: (typeof GAS_QUESTIONS)[number]): ReactNode => {
    const a = answers[q.n];
    const status: QuestionStatus = a?.status ?? "open";
    return (
      <div className="flex flex-col gap-block">
        <h3 className="text-heading text-balance">{q.question}</h3>
        <p className="text-body text-text-2">
          <span className="text-text-3">Пример из данных. </span>
          {q.example}
        </p>
        <p className="text-body text-text-2">
          <span className="text-text-3">Влияет на. </span>
          {q.impact}
        </p>
        <Link
          to={q.screen.to}
          className="inline-flex min-h-11 items-center gap-1.5 text-body-strong text-orange focus-ring"
        >
          Где видно: {q.screen.label}
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
        <label className="flex flex-col gap-1">
          <span className="text-meta text-text-2">Ответ заказчика</span>
          <textarea
            value={a?.answer ?? ""}
            onChange={(event) => update(q.n, { answer: event.target.value })}
            disabled={!loaded}
            rows={3}
            placeholder="Запишите ответ на встрече"
            data-testid={`answer-${q.n}`}
            className="min-h-18 w-full resize-y rounded-control border border-line-2 bg-surface px-3 py-2.5 text-body text-text placeholder:text-text-3 focus-ring"
          />
        </label>
        <div role="radiogroup" aria-label={`Статус вопроса ${q.n}`} className="seg self-start">
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
              className="seg-item focus-ring"
            >
              {option.key === "answered" && status === "answered" ? (
                <Check className="size-4" aria-hidden />
              ) : null}
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-meta text-text-3">Сохраняется только в этом браузере</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-block">
      <ScreenHint screen="questions" className="mb-0" />
      <p className="text-body text-text-2 tnum">
        Ответ получен: <span data-testid="questions-progress">{answered}</span> из{" "}
        {GAS_QUESTIONS.length}
        <span className="block text-meta text-text-3">
          В порядке важности для расчёта. Ответы сохраняются только в этом браузере.
        </span>
      </p>

      <ol className="surface-1 overflow-hidden [&>li+li]:border-t [&>li+li]:border-line">
        {GAS_QUESTIONS.map((q) => {
          const done = answers[q.n]?.status === "answered";
          return (
            <li key={q.n} id={`q-${q.n}`} className="scroll-mt-28">
              <button
                type="button"
                data-testid={`question-${q.n}`}
                onClick={() => setOpen(q.n)}
                className="flex min-h-row w-full items-start gap-3 px-row py-row text-left focus-ring is-hover:bg-surface-2"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-meta-strong text-text-2 tnum">
                  {q.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-heading">{q.question}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-meta text-text-3">
                    <span
                      aria-hidden
                      className={cn("size-2 rounded-full", done ? "bg-ok" : "bg-warn")}
                    />
                    {done ? "Ответ получен" : "Открыт"} · {q.screen.label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <Button variant="outline" size="lg" onClick={() => void copy()} className="self-start">
        <Copy aria-hidden />
        Скопировать список
      </Button>

      {current ? (
        desktop ? (
          <SidePanel
            open
            onOpenChange={(next) => (next ? undefined : setOpen(null))}
            eyebrow={`Вопрос ${current.n} из ${GAS_QUESTIONS.length}`}
            title={current.question}
          >
            {detail(current)}
          </SidePanel>
        ) : (
          <Sheet
            open
            onOpenChange={(next) => (next ? undefined : setOpen(null))}
            id="question"
            size="full"
            eyebrow={`Вопрос ${current.n} из ${GAS_QUESTIONS.length}`}
            title={current.question}
          >
            {detail(current)}
          </Sheet>
        )
      ) : null}
    </div>
  );
}
