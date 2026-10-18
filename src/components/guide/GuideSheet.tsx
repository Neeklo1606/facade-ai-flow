import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, MessageCircleQuestion, Send, X } from "lucide-react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { queries } from "@/api/queries";
import { useApp } from "@/lib/app-context";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { GuideStep, Scenario } from "@/lib/guide/scenarios";
import { screenFor } from "@/lib/guide/screens";
import { nextStep, skipStep, type GuideState } from "@/lib/guide/store";
import { currentScreenKey, record } from "@/lib/guide/telemetry";
import { useProjectId } from "@/lib/project-scope";

/**
 * Шторка шага показа (ADR-041): текст шага, переход, прогресс и «Непонятно на этом экране».
 * Отдельным куском: полоса шагов в оболочке грузится сразу, шторка — по касанию.
 */
export function GuideSheet({
  open,
  onOpenChange,
  scenario,
  step,
  stepDone,
  finished,
  skipped,
  guide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenario: Scenario;
  step: GuideStep | null;
  stepDone: boolean;
  finished: boolean;
  skipped: number;
  guide: GuideState;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={scenario.title}
      description={
        finished ? "Сценарий пройден" : `Шаг ${guide.stepIndex + 1} из ${scenario.steps.length}`
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {finished ? (
          <Finished skipped={skipped} />
        ) : (
          step && <StepBody step={step} done={stepDone} />
        )}
        <Progress
          total={scenario.steps.length}
          index={guide.stepIndex}
          status={guide.status}
          ids={scenario.steps.map((s) => s.id)}
        />
        {feedbackOpen ? (
          <FeedbackForm stepId={step?.id ?? null} onClose={() => setFeedbackOpen(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="focus-ring flex min-h-12 items-center gap-2 self-start rounded-full px-3 text-[13px] text-text-2 hover:text-text"
          >
            <MessageCircleQuestion className="size-4" strokeWidth={1.5} aria-hidden />
            Непонятно на этом экране
          </button>
        )}
      </div>
    </BottomSheet>
  );
}

function StepBody({ step, done }: { step: GuideStep; done: boolean }) {
  const projectId = useProjectId();
  const projects = useQuery(queries.projects()).data ?? [];
  const here = currentScreenKey();
  const target = projectId ?? projects[0]?.project.id ?? null;
  // Шаг выполняется на другом экране — предлагаем перейти туда, а не искать самому
  // Шаг «откройте экран» (без `on`) — ссылка видна, пока шаг не засчитан: меню на телефоне скрыто
  const elsewhere = !done && !!step.to && (step.on ? !step.on.includes(here) : true);
  const href = step.to && target ? step.to(target) : null;

  return (
    <div className="mt-2">
      <p className="text-[14px] leading-[1.45] text-text">{step.text}</p>
      {step.note && <p className="mt-1 text-[13px] leading-[1.45] text-text-3">{step.note}</p>}
      {done ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-text-2">
          <Check className="size-4 text-ok" strokeWidth={2} aria-hidden />
          Сделано
        </p>
      ) : (
        elsewhere &&
        href && (
          <Link
            to={href}
            className="focus-ring mt-3 inline-flex min-h-12 items-center rounded-[var(--r-pill)] border border-line bg-surface-2 px-4 text-[13px] text-text transition-fast hover:border-line-2 lg:min-h-9"
          >
            Перейти: {screenFor(href.split("?")[0] ?? href, href.split("?")[1] ?? "").name}
          </Link>
        )
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={skipStep}
          className="focus-ring min-h-12 rounded-[var(--r-pill)] px-3 text-[13px] text-text-2 transition-fast hover:text-text lg:min-h-9"
        >
          Пропустить
        </button>
        <button
          type="button"
          onClick={nextStep}
          disabled={!done}
          title={done ? undefined : "Шаг засчитается, когда вы выполните действие"}
          className="focus-ring min-h-12 rounded-[var(--r-pill)] border border-line bg-surface-2 px-4 text-[13px] font-medium text-text transition-fast hover:border-line-2 disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-9"
        >
          Дальше
        </button>
      </div>
    </div>
  );
}

function Finished({ skipped }: { skipped: number }) {
  return (
    <div className="mt-2">
      <p className="text-[14px] leading-[1.45] text-text">
        {skipped > 0
          ? `Сценарий закончен. Пропущено шагов: ${skipped} — они не выполнены. Сценарий можно открыть заново и пройти их.`
          : "Сценарий пройден. Можно сменить роль в карточке пользователя внизу меню и пройти другой."}
      </p>
      <Link
        to="/demo-stats"
        className="focus-ring mt-3 inline-flex min-h-12 items-center rounded-[var(--r-pill)] border border-line bg-surface-2 px-4 text-[13px] text-text transition-fast hover:border-line-2 lg:min-h-9"
      >
        Статистика сессии
      </Link>
    </div>
  );
}

function Progress({
  total,
  index,
  status,
  ids,
}: {
  total: number;
  index: number;
  status: Record<string, "done" | "skipped">;
  ids: string[];
}) {
  return (
    <ol
      className="mt-3 flex gap-1"
      aria-label={`Пройдено шагов: ${Object.values(status).filter((s) => s === "done").length} из ${total}`}
    >
      {ids.map((id, i) => (
        <li
          key={id}
          className={cn(
            "h-1 flex-1 rounded-full",
            status[id] === "done"
              ? "bg-text-2"
              : status[id] === "skipped"
                ? "bg-line-2"
                : i === index
                  ? "bg-text-3"
                  : "bg-line",
          )}
        />
      ))}
    </ol>
  );
}

function FeedbackForm({ stepId, onClose }: { stepId: string | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const { personaId } = useApp();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    const screen = screenFor(window.location.pathname, window.location.search);
    record({ t: "feedback", screen: screen.key, step: stepId, text: value.slice(0, 300) });
    setSending(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          screen: screen.key,
          screenName: screen.name,
          path: window.location.pathname,
          step: stepId,
          persona: personaId,
          text: value.slice(0, 300),
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      toast.success("Спасибо, записали", {
        description: `Экран «${screen.name}»${stepId ? ", текущий шаг сценария" : ""}.`,
      });
      onClose();
    } catch {
      toast.error("Не удалось отправить", {
        description: "Отзыв сохранён в статистике этой вкладки.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex w-full items-center gap-2 rounded-[var(--r-md)] border border-line bg-surface p-2 shadow-[var(--shadow-md)]"
      aria-label="Что непонятно на этом экране"
    >
      <input
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={300}
        placeholder="Что непонятно на этом экране?"
        aria-label="Что непонятно на этом экране"
        className="focus-ring min-h-12 min-w-0 flex-1 rounded-[var(--r-sm)] bg-surface-2 px-3 text-[14px] text-text placeholder:text-text-3 lg:min-h-9"
      />
      <button
        type="submit"
        disabled={!text.trim() || sending}
        aria-label="Отправить"
        className="focus-ring grid size-12 shrink-0 place-items-center rounded-[var(--r-sm)] border border-line bg-surface-2 text-text transition-fast hover:border-line-2 disabled:opacity-45 lg:size-9"
      >
        <Send className="size-4" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Отменить"
        className="focus-ring grid size-12 shrink-0 place-items-center text-text-3 hover:text-text lg:size-9"
      >
        <X className="size-4" strokeWidth={1.5} />
      </button>
    </form>
  );
}
