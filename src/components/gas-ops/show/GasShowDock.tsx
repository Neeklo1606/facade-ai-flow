/**
 * Полоса шагов показа «gas-week» (ADR-044, F3; вид ADR-045 «Финальный интерфейс», 4.4).
 *
 * Живёт вверху, под шапкой, а не над нижней панелью: одна строка 44 «4/6 Найдите запись
 * в отчёте» и кнопка со стрелкой, липкая вместе с шапкой. Если шаг другой роли или на другом
 * экране, кнопка переключает роль и ведёт на экран в одно касание. Касание «4/6» сворачивает
 * полосу в таблетку «4/6» в шапке (видимая 32, касание 44). Когда открыта шторка или
 * карточка, полоса уходит строкой под шапку шторки (`GasShowInline`): над нижней кромкой
 * остаётся один слой, панель действий шторки.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowRight, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ROLE_LABEL, useGasActor } from "@/api/gas-ops";
import { gasStepPath, resetGasShow, useGasShow } from "@/lib/gas-ops/show";
import { useSheetOpen } from "@/lib/ui/bottom-layers";
import { cn } from "@/lib/utils";
import { useRoleSwitch } from "../shell/use-role-switch";

/** Что показать в полосе сейчас: шаг, подпись кнопки и куда она ведёт */
function useShowModel() {
  const { active, state, step, index, total } = useGasShow();
  const actor = useGasActor();
  const switchRole = useRoleSwitch();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!active || !step) return null;
  // Последний шаг — экран «Готово»: на нём полоса не нужна, по дороге к нему ведёт туда
  if (step.id === "gas-finish" && pathname === "/gas/finish") return null;

  const path = gasStepPath(step, state.chain);
  const base = path.split("?")[0]!;
  const roleOk = !step.gasRole || step.gasRole === actor.role;
  const here = pathname === base;
  const done = state.status[step.id] === "done";
  const action =
    !roleOk && step.gasRole
      ? `Как ${ROLE_LABEL[step.gasRole].toLowerCase()}`
      : step.id === "gas-finish"
        ? "Итог показа"
        : !here
          ? "Открыть"
          : null;
  const go = async () => {
    if (!roleOk && step.gasRole) await switchRole(step.gasRole, { stay: true });
    await navigate({ href: path });
  };
  return { step, index, total, done, action, go };
}

/** Подсветка нужного элемента экрана, пока шаг открыт */
function useStepHighlight() {
  const { step } = useGasShow();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const target = step?.target;
  useEffect(() => {
    if (!target) return;
    let current: Element | null = null;
    const mark = () => {
      const next = document.querySelector(`[data-tour="${target}"]`);
      if (next === current) return;
      current?.classList.remove("guide-target");
      next?.classList.add("guide-target");
      current = next;
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      current?.classList.remove("guide-target");
    };
  }, [target, pathname]);
}

type Model = NonNullable<ReturnType<typeof useShowModel>>;

/** Строка шага: номер, текст в одну строку, кнопка со стрелкой и закрытие */
function ShowRow({ model, onFold }: { model: Model; onFold?: () => void }) {
  const { step, index, total, done, action, go } = model;
  const navigate = useNavigate();
  return (
    <div className="flex min-h-show min-w-0 items-center gap-2 py-1">
      <button
        type="button"
        onClick={onFold}
        disabled={!onFold}
        aria-label={onFold ? `Шаг ${index + 1} из ${total}. Свернуть полосу показа` : undefined}
        className="touch-target inline-flex h-chip shrink-0 items-center gap-1 rounded-full bg-orange-dim px-2 text-meta-strong text-orange tnum focus-ring disabled:cursor-default"
      >
        {done ? <Check className="size-3.5" strokeWidth={2.5} aria-label="Шаг выполнен" /> : null}
        {index + 1}/{total}
      </button>
      {/* Текст шага в две строки, без многоточия посреди фразы (аудит J1) */}
      <p className="line-clamp-2 min-w-0 flex-1 text-meta text-text" title={step.text}>
        {step.text}
      </p>
      {action ? (
        <button
          type="button"
          onClick={() => void go()}
          className="touch-target inline-flex h-8 max-w-[55%] shrink-0 items-center gap-1 rounded-full bg-pill px-3 text-meta-strong text-pill-text focus-ring press-98"
        >
          <span className="truncate">{action}</span>
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Выйти из показа"
        title="Выйти из показа"
        onClick={() => {
          // Выход из показа ведёт на вход в демо: оттуда второй сценарий и сайт (L3, 01_SPEC 7.2)
          resetGasShow();
          void navigate({ to: "/demo" });
        }}
        className="touch-target grid size-8 shrink-0 place-items-center rounded-full text-text-3 focus-ring is-hover:bg-surface-2"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Полоса под шапкой. Свёрнутая — таблетка в шапке (`#gas-show-slot`) */
export function GasShowDock() {
  const model = useShowModel();
  useStepHighlight();
  const sheetOpen = useSheetOpen();
  const [folded, setFolded] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("gas-show-slot")), []);

  if (!model || sheetOpen) return null;

  if (folded && slot) {
    return createPortal(
      <button
        type="button"
        onClick={() => setFolded(false)}
        aria-label={`Показ: шаг ${model.index + 1} из ${model.total}. Развернуть`}
        className="touch-target inline-flex h-8 shrink-0 items-center rounded-full bg-orange-dim px-3 text-meta-strong text-orange tnum focus-ring"
      >
        {model.index + 1}/{model.total}
      </button>,
      slot,
    );
  }

  return (
    <div
      role="region"
      aria-label="Показ: шаги"
      data-gas-show-dock
      className="line-bottom bg-surface px-gutter lg:px-8"
    >
      <ShowRow model={model} onFold={() => setFolded(true)} />
    </div>
  );
}

/** Та же строка шага под шапкой шторки или карточки: отдельного слоя нет */
export function GasShowInline({ className }: { className?: string }) {
  const model = useShowModel();
  if (!model) return null;
  return (
    <div data-gas-show-inline className={cn("rounded-control bg-orange-dim px-3", className)}>
      <ShowRow model={model} />
    </div>
  );
}
