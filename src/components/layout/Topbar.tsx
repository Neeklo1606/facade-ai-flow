import { useEffect, useState } from "react";
import { useCollapsingTitle } from "@/lib/ui/collapsing-title";
import { useAccess } from "@/api/access";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, Search } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { bottomNavFor, homeRouteFor, sectionLabels, type ProjectSection } from "@/lib/navigation";
import { useBack } from "@/lib/ui/tab-stack";
import { RoleSheet } from "./RoleSheet";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { screenStatesEnabled } from "@/lib/screen-state";
import { StatePicker } from "./StatePicker";
import { ScreenHelp } from "@/components/guide/ScreenHelp";
import { ThemeToggle } from "./ThemeToggle";
import { ProjectChip } from "./ProjectChip";
import { screenFor } from "@/lib/guide/screens";
import { useCurrentRole, useCurrentUser, useProjectId } from "@/lib/project-scope";
import { dataSource } from "@/api/config";
import { DEMO_ONLY_NOTES } from "@/lib/contour-copy";
import { Button } from "@/components/ui/button";

export function Topbar() {
  const { setCommandOpen, setProjectId } = useApp();
  const [roles, setRoles] = useState(false);
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

  /*
   * Шапка телефона (ADR-045, 4.2): заголовок экрана живёт в контенте (24/30), а когда уходит
   * под шапку при прокрутке, его текст встаёт сюда вместо выбора объекта. Тогда же шапка
   * получает сплошной фон и границу снизу.
   */
  const { ref: titleRef, collapsed } = useCollapsingTitle(pathname);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const heading = document.querySelector("main h1");
      const rect = heading?.getBoundingClientRect();
      titleRef(heading instanceof HTMLElement && rect && rect.height > 12 ? heading : null);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [pathname, titleRef]);

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
      : pathname === "/agent"
        ? "Ассистент"
        : // Остальные экраны — из общего словаря: рабочие экраны ролей, статистика сессии,
          // заглушки разделов, «не найдено»
          screenFor(pathname).name;

  /*
   * Вложенный экран телефона (ADR-048, 4): не корень вкладки. Слева «‹ Назад», бургера нет.
   * «Назад» идёт по истории, если пришли изнутри приложения, иначе к корню вкладки
   */
  const role = useCurrentRole();
  const scopeProject = useProjectId();
  const roots = new Set([
    ...bottomNavFor(role, scopeProject).map((item) => item.to),
    homeRouteFor(role),
    "/more",
    "/capture",
  ]);
  const nested = !roots.has(pathname);
  const back = useBack(pathname.startsWith("/projects") ? "/projects" : "/more");

  return (
    <header className="content-header" data-collapsed={collapsed ? "true" : undefined}>
      {nested ? (
        <Button
          variant="ghost"
          type="button"
          onClick={back}
          aria-label="Назад"
          className="focus-ring -ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-full pr-2 pl-1 text-body text-text md:hidden [touch-action:manipulation]"
        >
          <ChevronLeft className="size-6" strokeWidth={1.75} aria-hidden />
          Назад
        </Button>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          {/*
            min-w-0 обязателен: без него заголовок не ужимается рядом с пометкой «Демо»
            и обрезается на 375 px посреди слова («Сегод»). Нашлось на снимке панели в G2.
          */}
          {/*
            Заголовок экрана на телефоне живёт в контенте (32/36), шапка остаётся строкой
            «меню, объект, пометка, аватар» (правило 5 этапа D, ADR-041). С 1024 px заголовок
            снова в шапке рядом с крошками.
          */}
          <div
            className="hidden min-w-0 lg:block lg:truncate lg:text-title"
            title={title}
            aria-hidden="true"
          >
            {title}
          </div>
          {collapsed ? (
            <span className="min-w-0 truncate text-body-strong lg:hidden" aria-hidden>
              {title}
            </span>
          ) : null}
          {/* На вложенном экране телефона слева «Назад», чип объекта остаётся на корнях вкладок */}
          <div className={collapsed || nested ? "hidden lg:contents" : "contents"}>
            <ProjectChip />
          </div>
          {/* Пометка демонстрации на каждом экране — и на телефоне, где меню скрыто (ADR-015, п. 1) */}
          {dataSource === "demo" && (
            <span
              className="inline-flex h-5 shrink-0 items-center rounded-full border border-line px-2 text-meta-strong text-text-2"
              title={DEMO_ONLY_NOTES.mark.text}
            >
              {/* Видимая метка — отдельным элементом: её ищет проверка честности */}
              <span>Демо</span>
              <span className="sr-only">. {DEMO_ONLY_NOTES.mark.text}</span>
            </span>
          )}
        </div>
        {/* Подпись экрана: страница может заменить путь своей строкой (код, статус объекта) */}
        <div
          id="page-caption"
          className="hidden min-w-0 items-center gap-2 text-meta text-text-2 lg:flex lg:empty:hidden"
        />
        <nav
          aria-label="Хлебные крошки"
          className="hidden min-w-0 items-center gap-1.5 text-meta text-text-2 lg:flex"
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

      <div className="flex shrink-0 items-center gap-1 xl:gap-2.5">
        {/* Свёрнутая полоса показа встаёт сюда таблеткой «2/5» (4.4) */}
        <div id="show-slot" className="contents" />
        <Button
          variant="ghost"
          type="button"
          onClick={() => setCommandOpen(true)}
          aria-label="Поиск по объектам, документам и материалам"
          className="header-search focus-ring hidden xl:flex"
        >
          <Search strokeWidth={1.5} />
          {/* Поле ГАЙКИ в шапке — пока только поиск: микрофон приходит в G4 (ADR-034, п. 2) */}
          <span className="min-w-0 flex-1 truncate text-left">Найти в системе</span>
          <kbd className="kbd">Ctrl K</kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={() => setCommandOpen(true)}
          aria-label="Поиск"
          className="icon-button focus-ring grid size-[var(--touch)] xl:hidden"
        >
          <Search strokeWidth={1.5} />
        </Button>
        {/*
          На телефоне в шапке остаётся один значок — поиск. Подсказка по экрану живёт
          в плавающей кнопке проводки, тема — в шторке «Ещё» (раздел 6 продукта): четыре
          значка по 48 px съедали строку заголовка, и «Входящие» обрезались на 375 px.
        */}
        <div className="hidden lg:block">
          <ScreenHelp />
        </div>
        <div className="hidden lg:block">
          <ThemeToggle />
        </div>
        {/* Переключатель состояний экрана — инструмент показа с ноутбука (ADR-030, п. 1) */}
        {screenStatesEnabled && (
          <div className="hidden 2xl:block">
            <StatePicker />
          </div>
        )}
        {/*
          Действия экрана показываются с 1024 px — ровно там, где исчезает закреплённая полоса
          над панелью. На 768–1023 px они рисовались оба сразу (находка независимой проверки)
        */}
        <div id="page-actions" className="hidden items-center gap-2.5 lg:flex" />
        {user && (
          <>
            {/* Аватар открывает шторку «Вы смотрите как» (ADR-048, 5); в рабочем контуре роль из учётной записи */}
            <button
              type="button"
              onClick={dataSource === "demo" ? () => setRoles(true) : undefined}
              aria-label={`Вы смотрите как ${user.roleLabel}. Сменить роль`}
              title={`${user.name}, ${user.roleLabel}`}
              className="-mr-1.5 grid min-h-11 min-w-11 place-items-center rounded-full focus-ring [touch-action:manipulation]"
            >
              <span className="avatar grid" aria-hidden>
                {initials}
              </span>
            </button>
            <RoleSheet open={roles} onOpenChange={setRoles} />
          </>
        )}
      </div>
    </header>
  );
}

/**
 * Метка «Демо» для других поверхностей (кабинет компании, ADR-039): решение «показывать ли»
 * живёт здесь, рядом с меткой шапки, — экраны о контуре не знают.
 */
export function DemoMark() {
  if (dataSource !== "demo") return null;
  return (
    <span
      className="inline-flex h-6 items-center rounded-full border border-line px-2 text-meta text-text-2"
      title={DEMO_ONLY_NOTES.mark.text}
    >
      <span>Демо</span>
      <span className="sr-only">. {DEMO_ONLY_NOTES.mark.text}</span>
    </span>
  );
}
