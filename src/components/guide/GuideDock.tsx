import { Suspense, lazy, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, X } from "lucide-react";
import { notify } from "@/components/ui/kit";
import { queries } from "@/api/queries";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { CANON_PERSONA, nextCanon, scenarioById, type GuideStep } from "@/lib/guide/scenarios";
import { useNavigate } from "@tanstack/react-router";
import { employeeRoleLabel, type EmployeeRole } from "@/contracts";
import { useEnterAs } from "@/lib/persona";
import { useCurrentRole, useProjectId } from "@/lib/project-scope";

// Шторка шага грузится по касанию полосы: в оболочке ей место не нужно (бюджет бандла)
const GuideSheet = lazy(() =>
  import("./GuideSheet").then((module) => ({ default: module.GuideSheet })),
);
import {
  closeGuide,
  completeStep,
  completeThrough,
  getGuideState,
  finishScenario,
  startScenario,
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
 * Полоса показа ГАЙКИ (ADR-010; вид ADR-045 «Финальный интерфейс», 4.4): живёт под шапкой,
 * одной строкой 44: «2/5», текст шага в одну строку, кнопка со стрелкой и «Скрыть».
 * Касание «2/5» сворачивает полосу в таблетку в шапке (видимая 32, касание 44).
 * Пройденный сценарий сообщается тостом на 4 секунды, а не висит плашкой: в полосе остаётся
 * одна строка со следующим действием («Дальше: ПТО → документ», «Итоги показа»).
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
  const mobile = useMediaQuery("(max-width: 767px)", false);

  const role = useCurrentRole();
  const roleRef = useRef(role);
  roleRef.current = role;

  /*
   * Шаг засчитывается по факту: открыт нужный экран или выполнено действие. В каноне показа
   * (ADR-038) засчитывается ближайший подходящий шаг глазами своей роли, и показ идёт сам;
   * в прежних сценариях — только текущий, с «Дальше».
   */
  useEffect(
    () =>
      onTelemetry((event) => {
        const now = getGuideState();
        const active = scenarioById(now.scenarioId);
        if (!active) return;
        const matches = (item: GuideStep) =>
          (event.t === "screen" && !!item.doneOn.screen?.includes(event.screen)) ||
          (event.t === "action" && !!item.doneOn.action?.includes(event.action));
        if (active.id.startsWith("canon-")) {
          for (let i = now.stepIndex; i < active.steps.length; i++) {
            const item = active.steps[i]!;
            if (now.status[item.id]) continue;
            if (matches(item) && (!item.role || item.role === roleRef.current)) {
              completeThrough(i);
              return;
            }
          }
          return;
        }
        const current = currentStep();
        if (current && matches(current)) completeStep(current.id);
      }),
    [],
  );
  // Шаг «откройте экран» стал текущим, а посетитель уже там — засчитываем сразу
  useEffect(() => {
    const active = currentStep();
    if (!active?.doneOn.screen?.includes(currentScreenKey())) return;
    if (scenario?.id.startsWith("canon-")) {
      if (!active.role || active.role === role) completeThrough(guide.stepIndex);
    } else completeStep(active.id);
  }, [guide.scenarioId, guide.stepIndex, role, scenario]);

  void mobile;
  // Сценарий пройден: короткий тост вместо плашки над экраном (4.4)
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!finished || !scenario || announced.current === scenario.id) return;
    announced.current = scenario.id;
    notify(
      skipped > 0
        ? `${scenario.title} · пропущено шагов: ${skipped}`
        : `${scenario.title} · пройден`,
    );
  }, [finished, scenario, skipped]);
  // Таблетка свёрнутой полосы встаёт в шапку
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("show-slot")), []);

  const stepDone = !!step && guide.status[step.id] === "done";
  const highlight = !!step && !guide.closed && !stepDone;
  const dockRef = useRef<HTMLDivElement>(null);
  const [, setSide] = useState<"right" | "left">("right");
  useHighlight(highlight ? step?.target : undefined, dockRef, setSide);
  const [sheetOpen, setSheetOpen] = useState(false);

  const projectId = useProjectId();
  const enterAs = useEnterAs();
  const navigate = useNavigate();
  const projects = useQuery(queries.projects()).data ?? [];
  const target = projectId ?? projects[0]?.project.id ?? "";
  const canon = !!scenario && scenario.id.startsWith("canon-");
  const next = canon && scenario ? nextCanon(scenario.id) : null;

  // Пройденный сценарий канона запоминается: финал показа знает, что пройдено (ADR-038)
  useEffect(() => {
    if (finished && canon && scenario) finishScenario(scenario.id);
  }, [finished, canon, scenario]);

  if (chosen !== true || !scenario || guide.closed) return null;

  /** Переключить роль вкладки и открыть экран шага: одно касание, данные вкладки остаются */
  const switchTo = async (stepRole: EmployeeRole, to: string | null) => {
    const persona = CANON_PERSONA[stepRole];
    if (persona && stepRole !== role) await enterAs(persona, stepRole);
    if (to) void navigate({ to });
  };
  const here = currentScreenKey();
  const needsRole = !!step && !finished && !!step.role && step.role !== role;
  const elsewhere =
    !!step && !finished && !stepDone && !!step.to && !!step.on && !step.on.includes(here);
  const stepHref = step?.to ? step.to(target) : null;

  /* Одна кнопка действия в полосе: что сейчас важнее всего сделать */
  let action: { label: string; run: () => void } | null = null;
  if (finished) {
    action = next
      ? {
          label: `Дальше: ${next.title}`,
          run: () => {
            startScenario(next.id);
            const first = next.steps[0];
            void switchTo(first?.role ?? role, first?.to ? first.to(target) : null);
          },
        }
      : canon
        ? { label: "Итоги показа", run: () => void navigate({ to: "/finish" }) }
        : null;
  } else if (needsRole && step?.role) {
    action = {
      label: `Глазами: ${employeeRoleLabel[step.role].toLowerCase()}`,
      run: () => void switchTo(step.role!, stepHref),
    };
  } else if (stepDone) {
    action = { label: "Далее", run: nextStep };
  } else if (elsewhere && stepHref) {
    action = { label: "Перейти", run: () => void navigate({ to: stepHref }) };
  }

  const total = scenario.steps.length;
  const position = finished ? `${total}/${total}` : `${guide.stepIndex + 1}/${total}`;
  const text = finished
    ? next
      ? `Следующий сценарий: ${next.title}`
      : `${scenario.title} · пройден`
    : (step?.text ?? "");

  if (guide.collapsed && slot) {
    return createPortal(
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label={`Показ: шаг ${position}. Развернуть подсказки`}
        className="touch-target inline-flex h-8 shrink-0 items-center rounded-full bg-orange-dim px-3 text-meta-strong text-orange tnum focus-ring"
      >
        {position}
      </button>,
      slot,
    );
  }

  return (
    <div
      ref={dockRef}
      data-show-strip
      className="line-bottom flex h-show shrink-0 items-center gap-2 bg-surface px-gutter"
    >
      <section
        aria-label="Подсказки по сценарию"
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label={`Шаг ${position}. Свернуть подсказки`}
          className="touch-target inline-flex h-chip shrink-0 items-center gap-1 rounded-full bg-orange-dim px-2 text-meta-strong text-orange tnum focus-ring"
        >
          {stepDone || finished ? (
            <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
          ) : null}
          {position}
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`Открыть шаг сценария: ${scenario.title}`}
          className="flex h-control min-w-0 flex-1 items-center text-left text-meta text-text focus-ring"
        >
          <span className="sr-only">{`${scenario.title} · `}</span>
          <span className="truncate">{text}</span>
        </button>
        {action ? (
          <button
            type="button"
            onClick={action.run}
            className="touch-target inline-flex h-8 max-w-[45%] shrink-0 items-center gap-1 rounded-full bg-pill px-3 text-meta-strong text-pill-text focus-ring press-98"
          >
            <span className="truncate">{action.label}</span>
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={closeGuide}
          aria-label="Скрыть подсказки"
          className="touch-target grid size-8 shrink-0 place-items-center rounded-full text-text-3 focus-ring is-hover:bg-surface-2"
        >
          <X className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
      </section>

      {sheetOpen ? (
        <Suspense fallback={null}>
          <GuideSheet
            open
            onOpenChange={setSheetOpen}
            scenario={scenario}
            step={step}
            stepDone={stepDone}
            finished={finished}
            skipped={skipped}
            guide={guide}
          />
        </Suspense>
      ) : null}
    </div>
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
