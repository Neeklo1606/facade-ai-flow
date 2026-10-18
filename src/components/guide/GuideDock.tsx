import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, MessageCircleQuestion, Send, X } from "lucide-react";
import { BottomSheet } from "@/components/common/BottomSheet";
import { queries } from "@/api/queries";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useProjectId } from "@/lib/project-scope";
import { useApp } from "@/lib/app-context";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { scenarioById, type GuideStep } from "@/lib/guide/scenarios";
import { screenFor } from "@/lib/guide/screens";
import {
  closeGuide,
  completeStep,
  currentStep,
  nextStep,
  reopenGuide,
  setCollapsed,
  skipStep,
  useGuide,
  useRoleChosen,
} from "@/lib/guide/store";
import { currentScreenKey, onTelemetry, record } from "@/lib/guide/telemetry";

/**
 * Проводка по сценарию роли и кнопка «Непонятно на этом экране» (ADR-010).
 * Правый нижний угол; на телефоне — над закреплённым действием экрана и свёрнута по умолчанию.
 */
export function GuideDock() {
  const chosen = useRoleChosen();
  const guide = useGuide();
  const scenario = scenarioById(guide.scenarioId);
  const step = scenario?.steps[guide.stepIndex] ?? null;
  const finished = !!scenario && guide.stepIndex >= scenario.steps.length;
  // Пропущенный шаг не пройден: итог говорит об этом прямо (ADR-008, честность)
  const skipped = scenario
    ? scenario.steps.filter((item) => guide.status[item.id] === "skipped").length
    : 0;
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const mobile = useMediaQuery("(max-width: 767px)", false);

  // Шаг засчитывается по факту: открыт нужный экран или выполнено действие
  useEffect(
    () =>
      onTelemetry((event) => {
        const active = currentStep();
        if (!active) return;
        if (event.t === "screen" && active.doneOn.screen?.includes(event.screen))
          completeStep(active.id);
        if (event.t === "action" && active.doneOn.action?.includes(event.action))
          completeStep(active.id);
      }),
    [],
  );
  // Шаг «откройте экран» стал текущим, а посетитель уже там — засчитываем сразу
  useEffect(() => {
    const active = currentStep();
    if (active?.doneOn.screen?.includes(currentScreenKey())) completeStep(active.id);
  }, [guide.scenarioId, guide.stepIndex]);

  // На телефоне панель начинает свёрнутой: она не должна закрывать экран
  const collapsedDefaultApplied = useRef(false);
  useEffect(() => {
    if (collapsedDefaultApplied.current || !mobile || !scenario) return;
    collapsedDefaultApplied.current = true;
    if (guide.stepIndex === 0 && !guide.collapsed) setCollapsed(true);
  }, [mobile, scenario, guide.stepIndex, guide.collapsed]);

  const stepDone = !!step && guide.status[step.id] === "done";
  const highlight = !!step && !guide.closed && !stepDone;
  const dockRef = useRef<HTMLDivElement>(null);
  const [, setSide] = useState<"right" | "left">("right");
  useHighlight(highlight ? step?.target : undefined, dockRef, setSide);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (chosen !== true || !scenario || guide.closed) return null;

  return (
    <div
      ref={dockRef}
      /*
       * Полоса шагов под шапкой (правило 7 этапа D, ADR-041): не плавает поверх, не закрывает
       * кнопки. Живёт между шапкой и содержимым, поэтому контент под ней не уходит.
       */
      className="flex min-h-12 shrink-0 items-center gap-2 border-b border-line bg-base px-[var(--content-pad)]"
    >
      <section
        aria-label="Подсказки по сценарию"
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Открыть шаг сценария"
          className="focus-ring flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left text-[13px] leading-[1.35]"
        >
          {stepDone || finished ? (
            <Check className="size-4 shrink-0 text-ok" strokeWidth={2} aria-hidden />
          ) : null}
          <span className="min-w-0">
            <span className="block truncate text-text-2">
              {finished
                ? skipped > 0
                  ? `${scenario.title} · пропущено ${skipped}`
                  : `${scenario.title} · пройден`
                : `${scenario.title} · шаг ${guide.stepIndex + 1} из ${scenario.steps.length}`}
            </span>
            {step && !finished ? (
              <span className="block truncate text-text">{step.text}</span>
            ) : null}
          </span>
        </button>
        {!finished && step ? (
          <button
            type="button"
            onClick={stepDone ? nextStep : skipStep}
            className="focus-ring min-h-12 shrink-0 rounded-full bg-surface-2 px-4 text-[13px] font-medium text-text"
          >
            {stepDone ? "Далее" : "Пропустить"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={closeGuide}
          aria-label="Скрыть подсказки"
          className="focus-ring grid size-12 shrink-0 place-items-center text-text-3 hover:text-text"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </section>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
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
    </div>
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

/**
 * Подсветка элемента шага: класс с тонким контуром на первом видимом `[data-tour]`.
 * Элементы экрана появляются после загрузки данных, поэтому ищем их и при изменениях DOM.
 * Если цель шага оказалась под панелью, панель уходит на другую сторону экрана.
 */
function useHighlight(
  target: string | undefined,
  dockRef: RefObject<HTMLDivElement | null>,
  setSide: (side: "right" | "left") => void,
) {
  useEffect(() => {
    if (!target) {
      setSide("right");
      return;
    }
    let marked: Element | null = null;
    let scrolled = false;
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const place = () => {
      const dock = dockRef.current?.getBoundingClientRect();
      if (!marked || !dock) return;
      const rect = marked.getBoundingClientRect();
      // Проверяем место справа: панель на время проверки мысленно стоит в правом углу
      const right = new DOMRect(
        window.innerWidth - 16 - dock.width,
        dock.top,
        dock.width,
        dock.height,
      );
      setSide(overlaps(rect, right) ? "left" : "right");
    };
    const apply = () => {
      const candidates = [...document.querySelectorAll(`[data-tour="${target}"]`)];
      const visible = candidates.find((el) => (el as HTMLElement).offsetParent !== null) ?? null;
      if (visible === marked) return;
      marked?.classList.remove("guide-target");
      marked = visible;
      if (!visible) return;
      visible.classList.add("guide-target");
      if (!scrolled) {
        scrolled = true;
        const rect = visible.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight)
          visible.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      requestAnimationFrame(place);
    };
    apply();
    const observer = new MutationObserver(() => apply());
    observer.observe(document.body, { childList: true, subtree: true });
    const onMove = () => requestAnimationFrame(place);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      marked?.classList.remove("guide-target");
    };
  }, [target, dockRef, setSide]);
}
