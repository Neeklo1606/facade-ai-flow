import { useEffect, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, LayoutGrid, PlugZap } from "lucide-react";
import { applyTheme, readChoice, resolveTheme } from "@/lib/theme";
import { DemoMark } from "./Topbar";
import { useAccess } from "@/api/access";
import { screenFor } from "@/lib/guide/screens";
import { cn } from "@/lib/utils";

/**
 * Макет кабинета компании (ADR-039; дизайн-система, раздел 8б): десктоп первым, светлая
 * тема по умолчанию, воздушный сайдбар групп. На телефоне — шапка с возвратом и список
 * разделов на обзоре. Полевая оболочка (панель, полоса шагов, голосовая капсула) здесь
 * не рисуется: это другая поверхность.
 */
const items = [
  { to: "/office", label: "Обзор", icon: LayoutGrid, exact: true, section: "office" },
  {
    to: "/office/catalogs",
    label: "Справочники",
    icon: BookOpen,
    exact: false,
    section: "catalogs",
  },
  {
    to: "/office/connections",
    label: "Подключения",
    icon: PlugZap,
    exact: false,
    section: "office",
  },
] as const;

export function OfficeLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Раздел виден тому, у кого есть его право: ПТО и снабжению — только справочники
  const { can } = useAccess();
  const visible = items.filter((item) => can(item.section));

  /*
   * Светлая тема — умолчание кабинета. Выбор человека в полевом приложении важнее: если он
   * сам выбрал тёмную, кабинет её не перекрашивает. На выходе возвращается тема вкладки.
   */
  useEffect(() => {
    const choice = readChoice();
    let explicit = false;
    try {
      explicit = window.localStorage.getItem("neeklo-fieldops-theme") !== null;
    } catch {
      explicit = false;
    }
    if (!explicit) applyTheme("light");
    return () => applyTheme(resolveTheme(choice));
  }, []);

  const active = (item: (typeof items)[number]) =>
    item.exact ? pathname.replace(/\/$/u, "") === item.to : pathname.startsWith(item.to);

  return (
    <div className="flex min-h-dvh bg-base text-text">
      <aside className="hidden w-[256px] shrink-0 flex-col gap-1 bg-elevated px-4 py-8 lg:flex">
        <span className="px-3 text-[20px] leading-none font-semibold tracking-[-0.02em]">
          гайка <span className="text-text-3 font-normal">· кабинет</span>
        </span>
        <nav aria-label="Разделы кабинета" className="mt-8 flex flex-col gap-1">
          {visible.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active(item) ? "page" : undefined}
              className={cn(
                "focus-ring flex min-h-11 items-center gap-3 rounded-[var(--r-sm)] px-3 text-[15px] transition-fast",
                active(item) ? "bg-surface text-text font-medium" : "text-text-2 hover:bg-surface",
              )}
            >
              <item.icon className="size-[18px]" strokeWidth={1.5} aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          to="/"
          className="focus-ring mt-auto flex min-h-11 items-center gap-2 rounded-[var(--r-sm)] px-3 text-[14px] text-text-2 hover:bg-surface"
        >
          <ArrowLeft className="size-4" aria-hidden /> В полевое приложение
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-line px-5 lg:hidden">
          <Link
            to={pathname.replace(/\/$/u, "") === "/office" ? "/" : "/office"}
            aria-label={
              pathname.replace(/\/$/u, "") === "/office"
                ? "В полевое приложение"
                : "К разделам кабинета"
            }
            className="focus-ring -ml-2 grid size-12 place-items-center rounded-[var(--r-sm)]"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <span className="text-[17px] font-semibold">Кабинет компании</span>
          <span className="ml-auto">
            <DemoMark />
          </span>
        </header>
        {/*
          Шапка кабинета с 1024 px: заголовок раздела, его действия и подпись — те же места,
          что у полевой шапки, поэтому экраны пользуются обычным PageHeader (ADR-039).
        */}
        <header className="hidden min-h-[80px] items-center gap-4 border-b border-line px-12 lg:flex">
          <div className="min-w-0 flex-1">
            <div className="truncate text-page-title" aria-hidden="true">
              {screenFor(pathname).name}
            </div>
            <div
              id="page-caption"
              className="flex min-w-0 items-center gap-2 text-[13px] text-text-2 empty:hidden"
            />
          </div>
          <div id="page-actions" className="flex items-center gap-2.5" />
          <DemoMark />
        </header>
        <main className="min-w-0 flex-1 px-5 py-8 lg:px-12 lg:py-10">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
