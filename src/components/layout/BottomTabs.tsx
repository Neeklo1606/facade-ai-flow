import { Suspense, lazy, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Menu, Mic } from "lucide-react";
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
import { useBottomLayer } from "@/lib/ui/bottom-layers";
import { Button } from "@/components/ui/button";

const PlusSheet = lazy(() => import("./sheets").then((module) => ({ default: module.PlusSheet })));
const MoreSheet = lazy(() => import("./sheets").then((module) => ({ default: module.MoreSheet })));

/**
 * Нижняя панель телефона (ADR-026, карта ГАЙКИ — ADR-034, п. 1): пять позиций — рабочий экран
 * роли и объект слева, кнопка записи в центре, «Входящие» справа, «Ещё» последней.
 * Набор одинаков для всех ролей, меняется только первая позиция.
 *
 * Центральная кнопка — «Говорить» (ADR-036): касание открывает экран записи, удержание
 * начинает запись сразу. Запись в браузере работает с G4; чего нет без ключа — расшифровки,
 * и об этом говорит сам экран записи, а не кнопка.
 *
 * ADR-045 «Финальный интерфейс», раздел 4.3: панель плоская, на всю ширину, 56 + safe-area,
 * фон surface и граница сверху. Активный пункт: иконка и подпись акцентом и точка 4 под
 * подписью, без таблетки. Голосовая кнопка 56 строго по центру экрана, приподнята на 8:
 * сетка всегда из пяти колонок, 2 + микрофон + 2; когда справа один пункт («Ещё»),
 * пятая колонка пустая (refs/16, у директора микрофон уезжал вправо).
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

  const navigate = useNavigate();
  const items = bottomNavFor(role, projectId);
  const actions = plusActionsFor(role, projectId);
  /*
   * Кнопка «Говорить» есть у того, кто ведёт площадку: ей нужно право на запись фактов.
   * Директору, который ничего не меняет, кнопка действия не рисуется (ADR-026, п. 4).
   */
  const canCapture = actions.length > 0;
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  /** Удержание дольше 400 мс — сразу запись; короткое касание открывает экран записи */
  const holdStart = () => {
    held.current = false;
    hold.current = setTimeout(() => {
      held.current = true;
      void navigate({ to: "/capture", search: { record: true } });
    }, 400);
  };
  const holdEnd = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
    if (!held.current) void navigate({ to: "/capture" });
  };
  const holdCancel = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };
  const overviews = (useQuery(queries.projects()).data ?? []).map((item) => item.overview);
  const counts = badgeCounts(projectId, overviews);

  // Две слева, справа один раздел и «Ещё»: микрофон в средней из пяти колонок
  const left = items.slice(0, 2);
  const right = items.slice(2, 3);
  const navRef = useRef<HTMLElement>(null);
  useBottomLayer("tabbar", navRef, !keyboardOpen);
  const tab = (item: BottomNavItem) => (
    <Tab
      key={item.key}
      item={item}
      active={item.active(pathname, view, pickSection)}
      count={item.badge ? counts[item.badge] : 0}
    />
  );
  const more = (
    <Button
      key="more"
      variant="ghost"
      type="button"
      onClick={() => setMoreOpen(true)}
      aria-label="Ещё: разделы, тема, справка"
      className="focus-ring flex h-tabbar flex-col items-center justify-center gap-1 rounded-none px-0 text-tab text-text-2 is-hover:bg-transparent [&_svg]:size-6"
    >
      <Menu strokeWidth={1.75} aria-hidden />
      Ещё
    </Button>
  );
  const empty = (key: string) => <span key={key} aria-hidden />;
  const slots = canCapture
    ? [
        ...Array.from({ length: 2 - left.length }, (_, i) => empty(`l${i}`)),
        ...left.map(tab),
        "mic" as const,
        ...right.map(tab),
        more,
        ...Array.from({ length: 1 - right.length }, (_, i) => empty(`r${i}`)),
      ]
    : [...left.map(tab), ...right.map(tab), more];
  const columns = slots.length;

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Основная навигация"
        data-keyboard={keyboardOpen ? "open" : undefined}
        className={cn(
          "line-top fixed inset-x-0 bottom-0 z-40 grid bg-surface pb-[env(safe-area-inset-bottom)] transition-fast lg:hidden",
          // Пока фокус в поле ввода, панель уходит: место под неё остаётся, чтобы не прыгало
          keyboardOpen && "pointer-events-none translate-y-full opacity-0",
          // Колонок ровно по числу позиций: классы записаны целиком, иначе сборщик их не соберёт
          columns === 5 ? "grid-cols-5" : columns === 4 ? "grid-cols-4" : "grid-cols-3",
        )}
      >
        {slots.map((slot) =>
          slot === "mic" ? (
            <div key="mic" className="grid place-items-center">
              {/* Голосовая кнопка 56, единственный выступающий элемент панели (4.3) */}
              <button
                type="button"
                onPointerDown={holdStart}
                onPointerUp={holdEnd}
                onPointerCancel={holdCancel}
                onPointerLeave={holdCancel}
                onKeyDown={(event) => {
                  // Клавиатура: Enter открывает экран, Shift+Enter начинает запись сразу
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  void navigate({
                    to: "/capture",
                    ...(event.shiftKey ? { search: { record: true } } : {}),
                  });
                }}
                aria-label="Говорить: касание открывает запись, удержание начинает её сразу"
                data-tour="nav-plus"
                className="focus-ring press-98 -translate-y-2 grid size-14 place-items-center rounded-full bg-pill text-pill-text ring-4 ring-surface [&_svg]:size-6"
              >
                <Mic strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : (
            slot
          ),
        )}
      </nav>

      {/* Шторки грузятся по требованию: их разметка и перетаскивание не нужны до нажатия */}
      {plusOpen && (
        <Suspense fallback={null}>
          <PlusSheet
            open
            onOpenChange={setPlusOpen}
            role={role}
            projectId={projectId}
            initialChannel="report"
          />
        </Suspense>
      )}
      {moreOpen && (
        <Suspense fallback={null}>
          <MoreSheet
            open
            onOpenChange={setMoreOpen}
            role={role}
            projectId={projectId}
            onQuickReport={() => {
              setMoreOpen(false);
              setPlusOpen(true);
            }}
          />
        </Suspense>
      )}
    </>
  );
}

/** Позиция панели: иконка 24, подпись 11, активная акцентом и точкой 4 под подписью */
function Tab({ item, active, count }: { item: BottomNavItem; active: boolean; count: number }) {
  return (
    <Link
      to={item.to}
      search={item.search as never}
      // «Где я» решает item.active: роутер не должен отмечать пункт на вложенных экранах
      activeOptions={{ exact: true, includeSearch: false }}
      data-tour={`nav-${item.key}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring transition-fast relative flex h-tabbar flex-col items-center justify-center gap-1 pt-1 text-tab",
        active ? "text-orange" : "text-text-2",
      )}
    >
      <span className="relative">
        <item.icon className="size-6" strokeWidth={active ? 2 : 1.75} aria-hidden />
        {count > 0 && (
          <span
            className={cn(
              "absolute -top-1.5 -right-3 grid h-4 min-w-4 place-items-center rounded-full px-1 text-tab tnum",
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
      <span
        aria-hidden
        className={cn("-mt-0.5 size-1 rounded-full", active ? "bg-orange" : "bg-transparent")}
      />
    </Link>
  );
}
