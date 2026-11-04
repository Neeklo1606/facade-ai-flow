/**
 * Тур (ADR-061, 13; раздел 4.8): затемнение с окном вокруг элемента `data-tour`, подсказка
 * «Шаг N из M», «Назад», «Далее», ×. Действия зрителя не обязательны: «Далее» сам меняет
 * роль и экран. Без нажатия тур никуда не ведёт (F1): человек ушёл со страницы шага или
 * сменил роль, и тур встаёт на паузу с плашкой «Продолжить тур». Элемент ищется кадрами анимации не дольше 2 секунд после перехода, затем
 * положение следит ResizeObserver элемента и прокрутка: наблюдения за всем документом нет.
 * Затемнение не перехватывает нажатия: экран под туром остаётся рабочим.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Signpost, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ROLE_LABEL, useGasActor } from "@/api/gas-ops";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  TOURS,
  closeTour,
  goToStep,
  resumeTour,
  useTourState,
  type TourStep,
} from "@/lib/gas-ops/tour";
import { useRoleSwitch } from "../shell/use-role-switch";

const FIND_MS = 2000;
const PAD = 6;
const CARD_W = 360;

/** Первый видимый элемент шага: экспорт есть и в шапке компьютера, и в списке телефона */
function findTarget(target: string): HTMLElement | null {
  const list = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`);
  for (const element of list) if (element.getClientRects().length > 0) return element;
  return null;
}

type Place = "here" | "moving" | "away";

/**
 * Роль и экран шага. Переход только по новому нажатию человека (`request`): прямая ссылка,
 * пункт меню и смена роли не возвращают на шаг, тур встаёт на паузу («away»)
 */
function useStepPlace(step: TourStep | null, request: number): Place {
  const actor = useGasActor();
  const switchRole = useRoleSwitch();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const roleOk = !step || actor.role === step.role;
  const here = !step || pathname === step.path;
  const handled = useRef(0);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    if (!step || request === handled.current) return;
    handled.current = request;
    if (roleOk && here) return;
    setMoving(true);
    void (async () => {
      try {
        if (!roleOk && !(await switchRole(step.role, { stay: true, quiet: true }))) return;
        if (!here) await navigate({ to: step.path });
      } finally {
        setMoving(false);
      }
    })();
  }, [step, request, roleOk, here, switchRole, navigate]);
  if (roleOk && here) return "here";
  return moving ? "moving" : "away";
}

/** Прямоугольник элемента шага; null — элемента нет, подсказка по центру */
function useTargetRect(step: TourStep | null, ready: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    setRect(null);
    if (!step?.target || !ready) return;
    const target = step.target;
    let frame = 0;
    let element: HTMLElement | null = null;
    let observer: ResizeObserver | null = null;
    const started = performance.now();
    const measure = () => {
      if (element?.isConnected) setRect(element.getBoundingClientRect());
    };
    const look = () => {
      element = findTarget(target);
      if (!element) {
        if (performance.now() - started < FIND_MS) frame = requestAnimationFrame(look);
        return;
      }
      element.scrollIntoView({ block: "center", inline: "nearest" });
      measure();
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(measure);
        observer.observe(element);
      }
    };
    frame = requestAnimationFrame(look);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [step, ready]);
  return rect;
}

/** Место подсказки: под элементом, если помещается, иначе над ним; по центру без элемента */
function cardStyle(rect: DOMRect | null, phone: boolean): CSSProperties {
  if (phone) {
    // Телефон: подсказка во всю ширину с той стороны, где у элемента больше места
    const above = rect ? rect.top : 0;
    const below = rect ? window.innerHeight - rect.bottom : 1;
    return above > below
      ? { left: 16, right: 16, top: "calc(16px + env(safe-area-inset-top))" }
      : { left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom))" };
  }
  if (!rect) return { left: "50%", top: "50%", width: CARD_W, transform: "translate(-50%, -50%)" };
  const left = Math.min(Math.max(16, rect.left), window.innerWidth - CARD_W - 16);
  const below = rect.bottom + PAD + 12;
  if (below + 220 < window.innerHeight) return { left, top: below, width: CARD_W };
  return { left, bottom: window.innerHeight - rect.top + PAD + 12, width: CARD_W };
}

export function Tour() {
  const { tourId, index, request } = useTourState();
  const tour = tourId ? TOURS[tourId] : null;
  const step = tour?.steps[index] ?? null;
  const place = useStepPlace(step, request);
  const ready = place === "here";
  const rect = useTargetRect(step, ready);
  const phone = useMediaQuery("(max-width: 767px)", false);
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => setMounted(true), []);

  // Клавиши: Esc закрывает, стрелки листают. Поля ввода не перехватываются, на паузе тоже
  useEffect(() => {
    if (!tour || !ready) return;
    const onKey = (event: KeyboardEvent) => {
      const field = (event.target as HTMLElement | null)?.closest("input, textarea, select");
      if (field || event.defaultPrevented) return;
      if (event.key === "Escape") closeTour();
      else if (event.key === "ArrowRight") goToStep(index + 1);
      else if (event.key === "ArrowLeft") goToStep(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, index, ready]);

  if (!mounted || !tour || !step || place === "moving") return null;
  if (place === "away") return createPortal(<TourPaused title={tour.title} />, document.body);
  const last = index === tour.steps.length - 1;
  /*
   * Элемент во весь экран телефона (бот): компактная строка внизу, над отступом ленты.
   * Полная подсказка закрыла бы кнопки ответа, а действия зрителя в туре допустимы
   */
  const compact = phone && !!rect && rect.height > window.innerHeight * 0.6;
  // Чьими глазами шаг: роль меняет сам тур, поэтому она названа рядом с номером
  const counter = (
    <p className="text-meta text-text-3 tnum">
      <span data-testid="tour-step">
        Шаг {index + 1} из {tour.steps.length}
      </span>
      {compact ? null : ` · ${ROLE_LABEL[step.role].toLowerCase()}`}
    </p>
  );
  const close = (
    <button
      type="button"
      aria-label="Закрыть тур"
      onClick={closeTour}
      className="grid size-11 shrink-0 place-items-center rounded-full text-text-3 focus-ring is-hover:bg-surface-2"
    >
      <X className="size-5" aria-hidden />
    </button>
  );
  const back = (
    <Button
      variant="quiet"
      aria-label="Назад"
      disabled={index === 0}
      onClick={() => goToStep(index - 1)}
    >
      <ArrowLeft aria-hidden />
      {compact ? null : "Назад"}
    </Button>
  );
  const forward = (
    <Button
      aria-label={last ? "Готово" : "Далее"}
      onClick={() => (last ? closeTour() : goToStep(index + 1))}
    >
      {compact && !last ? null : last ? "Готово" : "Далее"}
      {last ? null : <ArrowRight aria-hidden />}
    </Button>
  );

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70]" data-gas-tour={tour.id}>
      {rect ? (
        <div
          aria-hidden
          className="absolute rounded-control transition-all duration-200"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px var(--overlay)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[var(--overlay)]" />
      )}
      {compact ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-label={tour.title}
          data-testid="tour-card"
          className="pointer-events-auto absolute inset-x-2 bottom-[calc(8px+env(safe-area-inset-bottom))] flex flex-col gap-1 rounded-card bg-surface px-3 py-2 shadow-floating ring-1 ring-line"
        >
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              {counter}
              <h2 className="truncate text-body-strong">{step.title}</h2>
            </div>
            {back}
            {forward}
            {close}
          </div>
          <p className="line-clamp-1 text-meta text-text-2" title={step.text}>
            {step.text}
          </p>
        </section>
      ) : (
        <section
          role="dialog"
          aria-modal="false"
          aria-label={tour.title}
          data-testid="tour-card"
          className="pointer-events-auto absolute flex flex-col gap-3 rounded-card bg-surface p-card shadow-floating ring-1 ring-line"
          style={cardStyle(rect, phone)}
        >
          <div className="flex items-start justify-between gap-3">
            {counter}
            <span className="-mt-2 -mr-2">{close}</span>
          </div>
          <h2 className="text-heading">{step.title}</h2>
          <p className="text-body text-text-2">{step.text}</p>
          <div className="flex items-center justify-between gap-2">
            {back}
            {forward}
          </div>
        </section>
      )}
    </div>,
    document.body,
  );
}

/**
 * Пауза (F1): человек ушёл со страницы шага. Экран не закрыт, внизу плашка: вернуться
 * на шаг или закрыть тур. Слева, чтобы не закрывать кнопку помощника справа
 */
function TourPaused({ title }: { title: string }) {
  return (
    <section
      role="region"
      aria-label={`${title}: пауза`}
      data-testid="tour-paused"
      className="fixed left-4 z-[70] flex max-w-[calc(100vw-96px)] items-center gap-1 rounded-full bg-surface py-1 ps-1 pe-1 shadow-floating ring-1 ring-line max-lg:bottom-[calc(var(--bottom-inset,0px)+16px)] lg:bottom-6 lg:left-6"
    >
      <Button variant="quiet" onClick={resumeTour}>
        <Signpost aria-hidden />
        Продолжить тур
      </Button>
      <button
        type="button"
        aria-label="Закрыть тур"
        onClick={closeTour}
        className="grid size-11 shrink-0 place-items-center rounded-full text-text-3 focus-ring is-hover:bg-surface-2"
      >
        <X className="size-5" aria-hidden />
      </button>
    </section>
  );
}
