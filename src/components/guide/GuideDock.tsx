import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronUp, MessageCircleQuestion, Send, X } from "lucide-react";
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
  const [side, setSide] = useState<"right" | "left">("right");
  useHighlight(highlight ? step?.target : undefined, dockRef, setSide);

  // Работа с экраном сворачивает панель в строку: развёрнутая она закрывает правый нижний угол,
  // где на многих экранах стоят нужные элементы. Засчитанный шаг разворачивает её снова
  useEffect(() => {
    if (guide.collapsed || guide.closed || !step || stepDone) return;
    const onPointer = (event: PointerEvent) => {
      if (dockRef.current?.contains(event.target as Node)) return;
      if ((event.target as Element).closest?.("[role=dialog]")) return;
      setCollapsed(true);
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [guide.collapsed, guide.closed, step, stepDone]);
  // На широком экране засчитанный шаг разворачивает панель; на телефоне развёрнутая карточка
  // поднималась бы до середины экрана и закрывала следующий шаг — там «Дальше» есть в строке
  useEffect(() => {
    if (stepDone && !mobile) setCollapsed(false);
  }, [stepDone, mobile]);
  // На телефоне после «Дальше» и «Пропустить» панель сворачивается: следующий шаг делается на экране
  const lastIndex = useRef(guide.stepIndex);
  useEffect(() => {
    if (lastIndex.current === guide.stepIndex) return;
    lastIndex.current = guide.stepIndex;
    if (mobile) setCollapsed(true);
  }, [guide.stepIndex, mobile]);

  if (chosen !== true) return null;

  return (
    <div
      ref={dockRef}
      className={cn(
        // Контейнер не ловит клики: промежутки между карточками прозрачны для экрана под ними
        "pointer-events-none fixed z-40 flex w-[min(360px,calc(100vw-32px))] flex-col gap-2 [&>*]:pointer-events-auto",
        side === "right"
          ? "right-4 items-end"
          : "left-4 items-start lg:left-[calc(var(--sidebar-w)+32px)]",
        "bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+76px)] md:bottom-6",
      )}
    >
      {scenario && !guide.closed && !guide.collapsed && (
        <section
          aria-label="Подсказки по сценарию"
          className="w-full rounded-[var(--r-md)] border border-line bg-surface p-4 shadow-[var(--shadow-md)]"
        >
          <header className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] leading-[1.4] text-text-3">
                {finished
                  ? scenario.title
                  : `Шаг ${guide.stepIndex + 1} из ${scenario.steps.length} · ${scenario.title}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Свернуть подсказки"
              className="focus-ring -m-2 grid size-11 shrink-0 place-items-center text-text-3 hover:text-text lg:size-9"
            >
              <ChevronDown className="size-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={closeGuide}
              aria-label="Закрыть подсказки"
              className="focus-ring -m-2 grid size-11 shrink-0 place-items-center text-text-3 hover:text-text lg:size-9"
            >
              <X className="size-4" strokeWidth={1.5} />
            </button>
          </header>
          {finished ? <Finished /> : step && <StepBody step={step} done={stepDone} />}
          <Progress
            total={scenario.steps.length}
            index={guide.stepIndex}
            status={guide.status}
            ids={scenario.steps.map((s) => s.id)}
          />
        </section>
      )}

      {feedbackOpen ? (
        <FeedbackForm stepId={step?.id ?? null} onClose={() => setFeedbackOpen(false)} />
      ) : (
        // Нижняя строка: свёрнутая проводка, «Дальше» по засчитанному шагу и обратная связь.
        // На телефоне обратная связь — иконка в той же строке: две строки закрывали экран
        <div className="pointer-events-auto flex max-w-full items-center justify-end gap-2">
          {scenario && !guide.closed && guide.collapsed && (
            <>
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="focus-ring flex min-h-11 min-w-0 items-center gap-2 rounded-[var(--r-pill)] border border-line bg-surface px-4 text-[13px] text-text shadow-[var(--shadow-md)] transition-fast hover:border-line-2"
                aria-label="Развернуть подсказки по сценарию"
              >
                <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-text-3">
                  {stepDone && <Check className="size-4 text-ok" strokeWidth={2} aria-hidden />}
                  {finished ? (
                    "Сценарий пройден"
                  ) : stepDone ? (
                    "Сделано"
                  ) : (
                    <>
                      {/* На телефоне строка компактная: текст шага закрывал бы низ экрана */}
                      <span className="md:hidden">
                        {guide.stepIndex + 1}/{scenario.steps.length}
                      </span>
                      <span className="hidden md:inline">
                        Шаг {guide.stepIndex + 1} из {scenario.steps.length}
                      </span>
                    </>
                  )}
                </span>
                {step && !stepDone && (
                  <span className="hidden truncate md:inline">{step.text}</span>
                )}
                <ChevronUp className="size-4 shrink-0 text-text-3" strokeWidth={1.5} aria-hidden />
              </button>
              {stepDone && (
                <button
                  type="button"
                  onClick={nextStep}
                  className="focus-ring min-h-11 shrink-0 rounded-[var(--r-pill)] border border-line bg-surface-2 px-4 text-[13px] font-medium text-text shadow-[var(--shadow-md)] transition-fast hover:border-line-2"
                >
                  Дальше
                </button>
              )}
            </>
          )}
          {scenario && guide.closed && (
            <button
              type="button"
              onClick={reopenGuide}
              className="focus-ring min-h-11 shrink-0 rounded-[var(--r-pill)] border border-line bg-surface px-4 text-[13px] text-text-2 shadow-[var(--shadow-md)] transition-fast hover:text-text"
            >
              Подсказки
            </button>
          )}
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            aria-label="Непонятно на этом экране"
            title="Непонятно на этом экране"
            className="focus-ring flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-[var(--r-pill)] border border-line bg-surface px-3 text-[13px] text-text-2 shadow-[var(--shadow-md)] transition-fast hover:text-text md:px-4"
          >
            <MessageCircleQuestion className="size-4" strokeWidth={1.5} aria-hidden />
            <span
              className={cn(scenario && !guide.closed && guide.collapsed && "hidden md:inline")}
            >
              Непонятно на этом экране
            </span>
          </button>
        </div>
      )}
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
      {step.note && <p className="mt-1 text-[12px] leading-[1.45] text-text-3">{step.note}</p>}
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
            className="focus-ring mt-3 inline-flex min-h-11 items-center rounded-[var(--r-pill)] border border-line bg-surface-2 px-4 text-[13px] text-text transition-fast hover:border-line-2 lg:min-h-9"
          >
            Перейти: {screenFor(href.split("?")[0] ?? href, href.split("?")[1] ?? "").name}
          </Link>
        )
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={skipStep}
          className="focus-ring min-h-11 rounded-[var(--r-pill)] px-3 text-[13px] text-text-2 transition-fast hover:text-text lg:min-h-9"
        >
          Пропустить
        </button>
        <button
          type="button"
          onClick={nextStep}
          disabled={!done}
          title={done ? undefined : "Шаг засчитается, когда вы выполните действие"}
          className="focus-ring min-h-11 rounded-[var(--r-pill)] border border-line bg-surface-2 px-4 text-[13px] font-medium text-text transition-fast hover:border-line-2 disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-9"
        >
          Дальше
        </button>
      </div>
    </div>
  );
}

function Finished() {
  return (
    <div className="mt-2">
      <p className="text-[14px] leading-[1.45] text-text">
        Сценарий пройден. Можно сменить роль в карточке пользователя внизу меню и пройти другой.
      </p>
      <Link
        to="/demo-stats"
        className="focus-ring mt-3 inline-flex min-h-11 items-center rounded-[var(--r-pill)] border border-line bg-surface-2 px-4 text-[13px] text-text transition-fast hover:border-line-2 lg:min-h-9"
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
        className="focus-ring min-h-11 min-w-0 flex-1 rounded-[var(--r-sm)] bg-surface-2 px-3 text-[14px] text-text placeholder:text-text-3 lg:min-h-9"
      />
      <button
        type="submit"
        disabled={!text.trim() || sending}
        aria-label="Отправить"
        className="focus-ring grid size-11 shrink-0 place-items-center rounded-[var(--r-sm)] border border-line bg-surface-2 text-text transition-fast hover:border-line-2 disabled:opacity-45 lg:size-9"
      >
        <Send className="size-4" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Отменить"
        className="focus-ring grid size-11 shrink-0 place-items-center text-text-3 hover:text-text lg:size-9"
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
