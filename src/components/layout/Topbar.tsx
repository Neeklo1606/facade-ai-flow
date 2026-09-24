import { useEffect } from "react";
import { useAccess } from "@/api/access";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Search } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { sectionLabels, type ProjectSection } from "@/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { screenStatesEnabled } from "@/lib/screen-state";
import { StatePicker } from "./StatePicker";
import { ScreenHelp } from "@/components/guide/ScreenHelp";
import { ThemeToggle } from "./ThemeToggle";
import { screenFor } from "@/lib/guide/screens";
import { useCurrentUser } from "@/lib/project-scope";
import { dataSource } from "@/api/config";
import { DEMO_MARK_NOTE } from "@/lib/demo-copy";

export function Topbar() {
  const { setMobileNavOpen, setCommandOpen, setProjectId } = useApp();
  // Аватар — выбранная персона демонстрации, а не всегда руководитель
  const user = useCurrentUser();
  const initials = user?.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Заголовок из раздела, закрытого роли, не запрашиваем: там экран «Нет доступа» (ADR-012)
  const { can, canProject } = useAccess();
  const detail = pathname.match(
    /^\/projects\/([^/]+)(?:\/(documents|materials|procurement|deliveries|field-reports|timeline)(?:\/([^/]+))?)?/,
  );
  const projectId = detail?.[1] ? decodeURIComponent(detail[1]) : null;
  const detailProject = useQuery({
    ...queries.project(projectId ?? ""),
    enabled: !!projectId && canProject("projects", projectId),
  }).data?.project;
  const sectionKey = detail?.[2] as ProjectSection | undefined;
  const section = sectionKey ? sectionLabels[sectionKey] : null;
  const child = detail?.[3] ? decodeURIComponent(detail[3]) : null;
  const documentTitle = useQuery({
    ...queries.document(child ?? ""),
    enabled: !!child && sectionKey === "documents" && can("documents"),
  }).data?.document.title;
  const requestNumber = useQuery({
    ...queries.request(child ?? ""),
    enabled: !!child && sectionKey === "procurement" && can("procurement"),
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

  // Заголовок шапки — последнее звено пути, подпись — звенья до него
  const crumbs: { label: string; to?: string }[] = detailProject
    ? [
        { label: "Объекты", to: "/projects" },
        ...(section
          ? [
              { label: detailProject.name, to: `/projects/${detailProject.id}` },
              ...(childTitle
                ? [{ label: section, to: `/projects/${detailProject.id}/${sectionKey}` }]
                : []),
            ]
          : []),
      ]
    : [];
  const title = detailProject
    ? (childTitle ?? section ?? detailProject.name)
    : pathname.startsWith("/projects")
      ? "Объекты"
      : pathname === "/"
        ? "Дашборд"
        : pathname === "/agent"
          ? "Ассистент"
          : // Остальные экраны — из общего словаря: статистика сессии, заглушки разделов, «не найдено»
            screenFor(pathname).name;

  return (
    <header className="content-header">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Открыть меню"
        className="icon-button focus-ring -ml-2 hidden md:grid lg:hidden"
      >
        <Menu strokeWidth={1.5} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <div
            className="truncate text-section-title lg:text-page-title"
            title={title}
            aria-hidden="true"
          >
            {title}
          </div>
          <ScreenHelp />
          {/* Пометка демонстрации на каждом экране — и на телефоне, где меню скрыто (ADR-015, п. 1) */}
          {dataSource === "demo" && (
            <span
              className="inline-flex h-5 shrink-0 items-center rounded-full border border-line px-2 text-[11px] leading-none font-medium text-text-2"
              title={DEMO_MARK_NOTE}
            >
              {/* Видимая метка — отдельным элементом: её ищет проверка честности */}
              <span>Демо</span>
              <span className="sr-only">. {DEMO_MARK_NOTE}</span>
            </span>
          )}
        </div>
        {/* Подпись экрана: страница может заменить путь своей строкой (код, статус объекта) */}
        <div
          id="page-caption"
          className="hidden min-w-0 items-center gap-2 text-[13px] leading-[1.45] text-text-2 lg:flex lg:empty:hidden"
        />
        <nav
          aria-label="Хлебные крошки"
          className="hidden min-w-0 items-center gap-1.5 text-[13px] leading-[1.45] text-text-2 lg:flex"
        >
          {crumbs.length ? (
            crumbs.map((crumb, index) => (
              <span key={crumb.label + index} className="flex min-w-0 items-center gap-1.5">
                {index > 0 && (
                  <span aria-hidden className="text-text-3">
                    /
                  </span>
                )}
                <Link
                  to={crumb.to as string}
                  className="max-w-[260px] truncate transition-fast hover:text-text"
                >
                  {crumb.label}
                </Link>
              </span>
            ))
          ) : (
            <span className="truncate">СК «Фасад-Проект»</span>
          )}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          aria-label="Поиск по объектам, документам и материалам"
          className="header-search focus-ring hidden xl:flex"
        >
          <Search strokeWidth={1.5} />
          <span className="min-w-0 flex-1 truncate text-left">Поиск по объектам</span>
          <kbd className="kbd">Ctrl K</kbd>
        </button>
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          aria-label="Поиск"
          className="icon-button focus-ring xl:hidden"
        >
          <Search strokeWidth={1.5} />
        </button>
        <ThemeToggle className="hidden sm:grid" />
        {screenStatesEnabled && <StatePicker />}
        {/* Действия экрана: страница отдаёт их сюда через PageActions. На телефоне главное действие
            закреплено снизу над панелью навигации */}
        <div id="page-actions" className="hidden items-center gap-2.5 md:flex" />
        {user && (
          <span className="avatar hidden sm:grid" title={`${user.name}, ${user.roleLabel}`}>
            {initials}
          </span>
        )}
      </div>
    </header>
  );
}
