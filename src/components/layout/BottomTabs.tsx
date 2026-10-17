import { Suspense, lazy, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Menu, Plus } from "lucide-react";
import { DEMO_PERSONAS, dataSource } from "@/api/config";
import { signOutFn } from "@/api/auth-functions";
import { queries } from "@/api/queries";
import { employeeRoleLabel, type EmployeeRole } from "@/contracts";
import { useApp } from "@/lib/app-context";
import { useCurrentRole, useCurrentUser, useProjectId } from "@/lib/project-scope";
import { CRITICAL_BADGES, badgeCounts, badgeText } from "@/lib/badges";
import { useKeyboardOpen } from "@/lib/keyboard-open";
import { bottomNavFor, plusActionsFor, type BottomNavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const PlusSheet = lazy(() => import("./sheets").then((module) => ({ default: module.PlusSheet })));
const MoreSheet = lazy(() => import("./sheets").then((module) => ({ default: module.MoreSheet })));

/**
 * Нижняя панель телефона (ADR-026, карта ГАЙКИ — ADR-034, п. 1): пять позиций — рабочий экран
 * роли и объект слева, кнопка записи в центре, «Входящие» справа, «Ещё» последней.
 * Набор одинаков для всех ролей, меняется только первая позиция.
 *
 * Центральная кнопка называется «Записать», а не «Говорить»: записи голоса нет ни в одном
 * контуре, и обещать её кнопкой нельзя (правило 4, ADR-034, п. 2). Имя «Говорить»
 * и удержание для записи приходят вместе с микрофоном в G4.
 *
 * Активная позиция без оранжевого: тёмная иконка, подпись и индикатор над иконкой. Оранжевый
 * в панели один — у центральной кнопки, потому что он означает действие, а не «ты здесь».
 */
export function BottomTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const view = useRouterState({
    select: (s) => String((s.location.search as Record<string, unknown>)["view"] ?? ""),
  });
  const pickSection = useRouterState({
    select: (s) => String((s.location.search as Record<string, unknown>)["section"] ?? ""),
  });
  const projectId = useProjectId();
  const role = useCurrentRole();
  const keyboardOpen = useKeyboardOpen();
  const [moreOpen, setMoreOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);

  const items = bottomNavFor(role, projectId);
  const actions = plusActionsFor(role, projectId);
  const overviews = (useQuery(queries.projects()).data ?? []).map((item) => item.overview);
  const counts = badgeCounts(projectId, overviews);

  // Две слева, одна справа: «+» стоит по центру панели, «Ещё» замыкает
  const left = items.slice(0, 2);
  const right = items.slice(2, 3);
  const columns = actions.length ? left.length + right.length + 2 : left.length + right.length + 1;

  return (
    <>
      <nav
        aria-label="Основная навигация"
        data-keyboard={keyboardOpen ? "open" : undefined}
        className={cn(
          "glass-bar fixed inset-x-0 bottom-0 z-40 grid h-[calc(64px+env(safe-area-inset-bottom))] items-center pb-[env(safe-area-inset-bottom)] transition-fast lg:hidden",
          // Пока фокус в поле ввода, панель уходит: место под неё остаётся, чтобы не прыгало
          keyboardOpen && "pointer-events-none translate-y-full opacity-0",
          // Колонок ровно по числу позиций: классы записаны целиком, иначе сборщик их не соберёт
          columns === 5 ? "grid-cols-5" : columns === 4 ? "grid-cols-4" : "grid-cols-3",
        )}
      >
        {left.map((item) => (
          <Tab
            key={item.key}
            item={item}
            active={item.active(pathname, view, pickSection)}
            count={item.badge ? counts[item.badge] : 0}
          />
        ))}

        {actions.length > 0 && (
          <div className="grid place-items-center">
            {/* Единственное оранжевое пятно панели: круг 56 px, слегка выступает над ней */}
            <button
              type="button"
              onClick={() => setPlusOpen(true)}
              aria-label="Записать факт"
              data-tour="nav-plus"
              className="focus-ring press bg-orange-strong text-on-orange transition-fast -mt-5 grid size-14 place-items-center rounded-full shadow-[var(--glow-ember)]"
            >
              <Plus className="size-6" strokeWidth={2} aria-hidden />
            </button>
          </div>
        )}

        {right.map((item) => (
          <Tab
            key={item.key}
            item={item}
            active={item.active(pathname, view, pickSection)}
            count={item.badge ? counts[item.badge] : 0}
          />
        ))}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="Ещё: разделы, тема, справка"
          className="focus-ring text-text-3 transition-fast flex h-full min-h-12 flex-col items-center justify-center gap-1 text-[13px] leading-none"
        >
          <Menu className="size-6" strokeWidth={1.75} aria-hidden />
          Ещё
        </button>
      </nav>

      {/* Шторки грузятся по требованию: их разметка и перетаскивание не нужны до нажатия */}
      {plusOpen && (
        <Suspense fallback={null}>
          <PlusSheet open onOpenChange={setPlusOpen} role={role} projectId={projectId} />
        </Suspense>
      )}
      {moreOpen && (
        <Suspense fallback={null}>
          <MoreSheet open onOpenChange={setMoreOpen} role={role} projectId={projectId} />
        </Suspense>
      )}
    </>
  );
}

/** Позиция панели: иконка 24 px, подпись 13 px, цель нажатия во всю высоту панели */
function Tab({ item, active, count }: { item: BottomNavItem; active: boolean; count: number }) {
  return (
    <Link
      to={item.to}
      search={item.search as never}
      data-tour={`nav-${item.key}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring transition-fast relative flex h-full min-h-12 flex-col items-center justify-center gap-1 text-[13px] leading-none",
        active ? "font-medium text-text" : "text-text-3",
      )}
    >
      {/* Индикатор 3 px над иконкой: «где я» читается без акцентного цвета */}
      <span
        aria-hidden
        className={cn(
          "absolute top-0 h-[3px] w-8 rounded-b-[2px]",
          active ? "bg-text" : "bg-transparent",
        )}
      />
      <span className="relative">
        <item.icon className="size-6" strokeWidth={active ? 2 : 1.75} aria-hidden />
        {count > 0 && (
          <span
            className={cn(
              "absolute -top-2 -right-3 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[13px] leading-none font-medium",
              item.badge && CRITICAL_BADGES.includes(item.badge)
                ? "bg-danger text-on-orange"
                : "bg-surface-3 text-text-2",
            )}
          >
            {badgeText(count)}
          </span>
        )}
      </span>
      {item.label}
    </Link>
  );
}
