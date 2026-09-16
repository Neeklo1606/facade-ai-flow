import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Menu, Moon, Search, Sun } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { sectionLabels, type ProjectSection } from "@/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { screenStatesEnabled } from "@/lib/screen-state";
import { StatePicker } from "./StatePicker";

export function Topbar() {
  const { setMobileNavOpen, setCommandOpen, theme, toggleTheme, setProjectId } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const detail = pathname.match(
    /^\/projects\/([^/]+)(?:\/(documents|materials|procurement|field-reports|timeline)(?:\/([^/]+))?)?/,
  );
  const projectId = detail?.[1] ? decodeURIComponent(detail[1]) : null;
  const detailProject = useQuery({ ...queries.project(projectId ?? ""), enabled: !!projectId }).data
    ?.project;
  const sectionKey = detail?.[2] as ProjectSection | undefined;
  const section = sectionKey ? sectionLabels[sectionKey] : null;
  const child = detail?.[3] ? decodeURIComponent(detail[3]) : null;
  const documentTitle = useQuery({
    ...queries.document(child ?? ""),
    enabled: !!child && sectionKey === "documents",
  }).data?.document.title;
  const requestNumber = useQuery({
    ...queries.request(child ?? ""),
    enabled: !!child && sectionKey === "procurement",
  }).data?.summary.request.number;
  const childTitle =
    sectionKey === "documents"
      ? (documentTitle ?? null)
      : requestNumber
        ? `Сравнение ${requestNumber}`
        : null;

  // Открыт экран объекта — селектор в сайдбаре показывает этот объект
  useEffect(() => {
    if (detailProject) setProjectId(detailProject.id);
  }, [detailProject, setProjectId]);

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

      <nav
        aria-label="Хлебные крошки"
        className="hidden min-w-0 items-center gap-1.5 text-[13px] text-text-muted md:flex"
      >
        {detailProject ? (
          <>
            <Link to="/projects" className="shrink-0 transition-fast hover:text-text-primary">
              Объекты
            </Link>
            <ChevronRight className="size-3.5 shrink-0" />
            {section ? (
              <>
                <Link
                  to="/projects/$id"
                  params={{ id: detailProject.id }}
                  className="max-w-[220px] truncate transition-fast hover:text-text-primary"
                >
                  {detailProject.name}
                </Link>
                <ChevronRight className="size-3.5 shrink-0" />
                {childTitle ? (
                  <>
                    <Link
                      to={`/projects/${detailProject.id}/${sectionKey}` as string}
                      className="shrink-0 transition-fast hover:text-text-primary"
                    >
                      {section}
                    </Link>
                    <ChevronRight className="size-3.5 shrink-0" />
                    <span className="truncate font-medium text-text-primary">{childTitle}</span>
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
          <span className="truncate font-medium text-text-primary">
            {pathname.startsWith("/projects") ? "Объекты" : "neeklo FieldOps"}
          </span>
        )}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {screenStatesEnabled && <StatePicker />}
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          aria-label="Поиск"
          className="grid size-11 place-items-center rounded-full border border-border bg-surface text-text-secondary hover:bg-hover lg:hidden"
        >
          <Search className="size-[18px]" />
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
        <span
          className="hidden size-[34px] place-items-center rounded-full bg-pastel-violet text-[11px] font-medium text-pastel-violet-fg sm:grid"
          title="Соколов И. П., руководитель проектов"
        >
          СИ
        </span>
      </div>
    </header>
  );
}
