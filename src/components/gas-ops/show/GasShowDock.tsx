/**
 * Полоса шагов показа «gas-week» (ADR-044, F3). Плавающая капсула над нижней панелью:
 * шаг, что сделать и одна кнопка. Если шаг другой роли или на другом экране, кнопка
 * переключает роль и ведёт на экран в одно касание. Кнопки экрана она не перекрывает:
 * на телефоне стоит над нижней панелью, на десктопе в правом нижнем углу.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowRight, Check, X } from "lucide-react";
import { useEffect } from "react";
import { ROLE_LABEL, useGasActor } from "@/api/gas-ops";
import { gasStepPath, resetGasShow, useGasShow } from "@/lib/gas-ops/show";
import { cn } from "@/lib/utils";
import { useRoleSwitch } from "../shell/use-role-switch";

export function GasShowDock({ lifted }: { lifted: boolean }) {
  const { active, state, step, index, total } = useGasShow();
  const actor = useGasActor();
  const switchRole = useRoleSwitch();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const target = step?.target;

  // Подсветка нужного элемента экрана, пока шаг открыт
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
  }, [target, location.pathname]);

  if (!active || !step) return null;
  // Последний шаг — экран «Готово»: на нём полоса не нужна, по дороге к нему ведёт туда
  if (step.id === "gas-finish" && location.pathname === "/gas/finish") return null;

  const path = gasStepPath(step, state.chain);
  const base = path.split("?")[0]!;
  const roleOk = !step.gasRole || step.gasRole === actor.role;
  const here = location.pathname === base;
  const done = state.status[step.id] === "done";

  const go = async () => {
    if (!roleOk && step.gasRole) await switchRole(step.gasRole, { stay: true });
    await navigate({ href: path });
  };

  return (
    <div
      role="region"
      aria-label="Показ: шаги"
      data-gas-show-dock
      className={cn(
        "fixed inset-x-0 z-40 px-3 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[400px] lg:px-0",
        lifted
          ? "bottom-[calc(88px+max(10px,env(safe-area-inset-bottom)))]"
          : "bottom-[max(10px,env(safe-area-inset-bottom))]",
      )}
    >
      <div className="glass mx-auto flex max-w-[520px] items-center gap-3 rounded-[24px] p-2 ps-4 shadow-[0_16px_48px_rgba(0,0,0,0.3)] ring-1 ring-orange-line">
        <span className="shrink-0 text-[12px] leading-4 font-medium text-orange tnum">
          {index + 1}/{total}
        </span>
        <p className="min-w-0 flex-1 text-[14px] leading-5">
          <span className="line-clamp-2">{step.text}</span>
          {step.note && here && roleOk ? (
            <span className="mt-0.5 line-clamp-2 block text-[12px] leading-4 text-text-3">
              {step.note}
            </span>
          ) : null}
        </p>
        {!roleOk || !here ? (
          <button
            type="button"
            onClick={() => void go()}
            className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full bg-pill px-4 text-[13px] font-medium text-pill-text focus-ring press"
          >
            {!roleOk && step.gasRole
              ? `Как ${ROLE_LABEL[step.gasRole].toLowerCase()}`
              : step.id === "gas-finish"
                ? "Итог показа"
                : "Открыть"}
            <ArrowRight className="size-4" aria-hidden />
          </button>
        ) : done ? (
          <Check className="size-5 shrink-0 text-ok" aria-label="Шаг выполнен" />
        ) : null}
        <button
          type="button"
          aria-label="Закончить показ"
          onClick={resetGasShow}
          className="grid size-12 shrink-0 place-items-center rounded-full text-text-3 focus-ring is-hover:bg-surface-2"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
