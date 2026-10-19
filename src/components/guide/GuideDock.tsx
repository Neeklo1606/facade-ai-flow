import { Suspense, lazy, useEffect, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { queries } from "@/api/queries";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { CANON_PERSONA, nextCanon, scenarioById, type GuideStep } from "@/lib/guide/scenarios";
import { useNavigate } from "@tanstack/react-router";
import { employeeRoleLabel, type EmployeeRole } from "@/contracts";
import { useEnterAs } from "@/lib/persona";
import { useCurrentRole, useProjectId } from "@/lib/project-scope";
import { Button } from "@/components/ui/button";

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

  return (
    <div
      ref={dockRef}
      /*
       * Полоса шагов под шапкой (правило 7 этапа D, ADR-041): не плавает поверх, не закрывает
       * кнопки. Живёт между шапкой и содержимым, поэтому контент под ней не уходит.
       */
      className="mb-4 flex min-h-12 shrink-0 items-center gap-2 border-b border-line bg-base px-[var(--content-pad)]"
    >
      <section
        aria-label="Подсказки по сценарию"
        className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex"
      >
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Открыть шаг сценария"
          className="focus-ring col-start-1 flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 text-left text-[13px] leading-[1.45]"
        >
          {stepDone || finished ? (
            <Check className="size-4 shrink-0 text-ok" strokeWidth={2} aria-hidden />
          ) : null}
          <span className="min-w-0">
            <span className="block text-text-2">
              {finished
                ? skipped > 0
                  ? `${scenario.title} · пропущено ${skipped}`
                  : `${scenario.title} · пройден`
                : `${scenario.title} · шаг ${guide.stepIndex + 1} из ${scenario.steps.length}`}
            </span>
            {step && !finished ? (
              <span className="block text-text">{step.text}</span>
            ) : null}
          </span>
        </button>
        {action ? (
          <Button
            variant="outline"
            type="button"
            onClick={action.run}
            className="focus-ring col-start-1 row-start-2 mb-2 min-h-12 justify-self-start px-4 text-[13px] sm:mb-0 sm:min-h-10"
          >
            {action.label}
          </Button>
        ) : null}
        <button
          type="button"
          onClick={closeGuide}
          aria-label="Скрыть подсказки"
          className="focus-ring col-start-2 row-start-1 grid size-12 shrink-0 place-items-center text-text-3 hover:text-text"
        >
          <X className="size-4" strokeWidth={1.5} />
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
