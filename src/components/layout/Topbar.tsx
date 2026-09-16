import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, ChevronRight, Menu, MessageSquare, Moon, Sparkle, Sun } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { findNavItem } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { events } from "@/mock/events";
import { fmtAgo } from "@/lib/format";
import { projectById } from "@/mock/repository";
import { useSpecStore } from "@/lib/spec-store";
import { StatePicker } from "./StatePicker";
import { siteIdOf } from "@/lib/project-scope";

/** Что агенты обрабатывают прямо сейчас. */
function activeJobs() {
  return events.filter((e) => e.status === "received" || e.status === "recognizing");
}

export function Topbar() {
  const { setMobileNavOpen, setAgentPanelOpen, agentPanelOpen, theme, toggleTheme, setSiteId } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const item = findNavItem(pathname);
  const detail = pathname.match(
    /^\/projects\/([^/]+)(?:\/(documents|materials|procurement|field-reports|timeline)(?:\/([^/]+))?)?/,
  );
  const detailProject = detail?.[1] ? projectById(decodeURIComponent(detail[1])) : null;
  const sectionLabels: Record<string, string> = {
    documents: "Документация",
    materials: "Материалы",
    procurement: "Поставщики и запросы",
    "field-reports": "Отчёты с площадки",
    timeline: "История и решения",
  };
  const section = detail?.[2] ? sectionLabels[detail[2]] : null;
  const docTitle = useSpecStore((s) => {
    const child = detail?.[3] ? decodeURIComponent(detail[3]) : null;
    if (!child) return null;
    if (detail?.[2] === "documents") return s.documents.find((doc) => doc.id === child)?.title ?? null;
    if (detail?.[2] === "procurement") {
      const number = s.requests.find((r) => r.id === child)?.number;
      return number ? `Сравнение ${number}` : null;
    }
    return null;
  });

  // Открыт экран объекта — селектор в сайдбаре показывает этот объект
  useEffect(() => {
    if (detailProject) setSiteId(siteIdOf(detailProject.id));
  }, [detailProject, setSiteId]);
  const jobs = activeJobs();

  return (
    <header className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-[color:color-mix(in_oklab,var(--bg-shell)_92%,transparent)] px-3 backdrop-blur-xl lg:px-5">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Открыть меню"
        className="grid size-11 place-items-center rounded-full text-text-secondary hover:bg-hover lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <nav aria-label="Хлебные крошки" className="hidden min-w-0 items-center gap-1.5 text-[13px] text-text-muted md:flex">
        {!section && (
          <>
            <Link to="/" className="shrink-0 transition-fast hover:text-text-primary">
              neeklo FieldOps
            </Link>
            <ChevronRight className="size-3.5 shrink-0" />
          </>
        )}
        {detailProject ? (
          <>
            <Link to="/projects" className="transition-fast hover:text-text-primary">
              Объекты
            </Link>
            <ChevronRight className="size-3.5" />
            {section ? (
              <>
                <Link
                  to="/projects/$id"
                  params={{ id: detailProject.id }}
                  className="max-w-[220px] truncate transition-fast hover:text-text-primary"
                >
                  {detailProject.name}
                </Link>
                <ChevronRight className="size-3.5" />
                {docTitle ? (
                  <>
                    <Link
                      to={`/projects/${detailProject.id}/${detail?.[2]}` as string}
                      className="transition-fast hover:text-text-primary"
                    >
                      {section}
                    </Link>
                    <ChevronRight className="size-3.5" />
                    <span className="truncate font-medium text-text-primary">{docTitle}</span>
                  </>
                ) : (
                  <span className="truncate font-medium text-text-primary">{section}</span>
                )}
              </>
            ) : (
              <span className="truncate font-medium text-text-primary">{detailProject.name}</span>
            )}
          </>
        ) : (
          <span className="truncate font-medium text-text-primary">{item?.label ?? "Раздел"}</span>
        )}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <StatePicker />
        {jobs.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="focus-ring hidden h-[38px] items-center gap-2 rounded-full border border-border bg-surface px-3 text-[13px] text-text-secondary transition-fast hover:bg-hover sm:flex"
                aria-label="Агенты в работе"
              >
                <span className="pulse-dot size-2 rounded-full bg-accent" aria-hidden />
                <span className="tnum font-medium text-text-primary">{jobs.length}</span>
                <span className="hidden lg:inline">в работе</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[340px] p-0">
              <p className="border-b border-border px-4 py-2.5 text-caption text-text-secondary">
                Обрабатывается прямо сейчас
              </p>
              <ul className="divide-y divide-border">
                {jobs.map((j) => (
                  <li key={j.id} className="relative px-4 py-3">
                    <p className="truncate text-[13px]">{j.preview}</p>
                    <p className="mt-0.5 text-caption text-text-muted">
                      {j.authorName} · {fmtAgo(j.at)}
                    </p>
                    <span className="live-bar" aria-hidden>
                      <span className="live-bar-fill" />
                    </span>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
        <Button
          size="sm"
          variant="default"
          className="h-11 lg:h-8"
          onClick={() => setAgentPanelOpen(!agentPanelOpen)}
        >
          <Sparkle className="size-4" />
          <span className="hidden sm:inline">Агент</span>
        </Button>
        <button
          type="button"
          aria-label="Сообщения"
          className="hidden size-[38px] place-items-center rounded-full border border-border bg-surface text-text-secondary hover:bg-hover sm:grid"
        >
          <MessageSquare className="size-[18px]" />
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          className="hidden size-[38px] place-items-center rounded-full border border-border bg-surface text-text-secondary hover:bg-hover lg:grid"
        >
          {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>
        <button
          type="button"
          aria-label="Уведомления"
          className="relative grid size-11 place-items-center rounded-full border border-border bg-surface text-text-secondary hover:bg-hover lg:size-[38px]"
        >
          <Bell className="size-4.5" />
          <span className="absolute top-0.5 right-0.5 size-[7px] rounded-full border-2 border-surface bg-accent" />
        </button>
        <span className="hidden size-[34px] place-items-center rounded-full bg-pastel-violet text-[11px] font-medium text-pastel-violet-fg sm:grid">СИ</span>
      </div>
    </header>
  );
}
