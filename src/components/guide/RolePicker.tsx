import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  ClipboardCheck,
  HardHat,
  PackageSearch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { employeeRoleLabel, type EmployeeRole } from "@/contracts";
import { queries } from "@/api/queries";
import { DEMO_PERSONAS, dataSource } from "@/api/config";
import { useEnterAs } from "@/lib/persona";
import { homeRouteFor } from "@/lib/navigation";
import { useCurrentRole } from "@/lib/project-scope";
import { markRoleChosen, setEntering, startScenario, useRoleChosen } from "@/lib/guide/store";
import { CANON_PERSONA, scenarioById, scenarioFor } from "@/lib/guide/scenarios";
import { legacyModulesEnabled } from "@/lib/legacy-modules";
import { cn } from "@/lib/utils";
import { record } from "@/lib/guide/telemetry";

/** Что роль делает в показе: одна строка под названием (канон 18.10, ADR-038) */
const roleHint: Partial<Record<EmployeeRole, { icon: LucideIcon; text: string }>> = {
  foreman: { icon: HardHat, text: "Говорит с объекта: смена, объём, нехватка материала" },
  pto: { icon: ClipboardCheck, text: "Проверяет отчёты и выпускает сводку и ведомость" },
  supply: { icon: PackageSearch, text: "Решает по заявкам на материал" },
  manager: { icon: Building2, text: "Видит объём, проверку и пропущенные отчёты" },
};

/** Роли канона в выборе: директор остаётся в коде, но в показ не выходит (ADR-038) */
const CANON_ROLES: readonly EmployeeRole[] = ["foreman", "pto", "supply", "manager"];

/**
 * Плитки сценариев на экране входа: свечение сверху своим оттенком, как у ScenarioTile —
 * отчёт оранжевый, документ песочный, снабжение красный
 */
const tiles = [
  {
    id: "canon-shift",
    title: "Смена → учёт",
    hint: "Прораб говорит, гайка раскладывает",
    glow: "bg-[radial-gradient(110%_100%_at_20%_0%,color-mix(in_oklab,var(--color-ember)_34%,transparent),transparent_72%)]",
  },
  {
    id: "canon-document",
    title: "ПТО → документ",
    hint: "Проверка, сводка и черновик ведомости",
    glow: "bg-[radial-gradient(110%_100%_at_20%_0%,color-mix(in_oklab,var(--color-sand)_30%,transparent),transparent_72%)]",
  },
  {
    id: "canon-supply",
    title: "Объект → снабжение",
    hint: "Заявка на материал и решение",
    glow: "bg-[radial-gradient(110%_100%_at_20%_0%,color-mix(in_oklab,var(--color-risk)_24%,transparent),transparent_72%)]",
  },
] as const;

/**
 * Выбор роли при первом входе во вкладку (ADR-010). Роль задаёт персону, стартовый экран
 * и сценарий проводки. Пока вкладка в браузере не известна (SSR), экран не рисуется.
 */
export function RolePicker({ entry = false }: { entry?: boolean } = {}) {
  const chosen = useRoleChosen();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const enterAs = useEnterAs();
  // Роль до выбора: по умолчанию демонстрация открывается за руководителя
  const roleBefore = useCurrentRole();
  const employees = useQuery(queries.employees()).data ?? [];
  const [pickRole, setPickRole] = useState(false);
  // Смена экрана внутри окна начинается сверху: иначе выбор роли открывался с середины списка
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo?.({ top: 0 });
  }, [pickRole]);
  /*
   * Флаг `legacy_modules` живёт во вкладке: на сервере его нет. Читается после монтирования,
   * чтобы первый HTML и первый рендер вкладки совпадали (иначе React ругается в консоль).
   */
  const [legacy, setLegacy] = useState(false);
  useEffect(() => setLegacy(legacyModulesEnabled()), []);

  // Пока выбирается роль, приложение под экраном выбора недоступно ни мышью, ни клавиатурой
  useEffect(() => {
    // В рабочем контуре экрана выбора нет — и приложение под ним запирать не за чем.
    // Без этой проверки оболочка оставалась inert: кнопки видны, но не нажимаются
    if (dataSource === "server" || chosen !== false) return;
    const shell = document.querySelector(".app-window");
    shell?.setAttribute("inert", "");
    return () => shell?.removeAttribute("inert");
  }, [chosen]);

  /*
   * В рабочем контуре роли не выбирают: она приходит из учётной записи, за которую вошли
   * (ADR-021, п. 7). Раньше экран выбора появлялся и там — поверх рабочего места, сразу
   * после входа по телефону и коду.
   */
  if (dataSource === "server") return null;
  if (chosen === true) return null;
  /*
   * До гидратации выбор вкладки неизвестен. Корень `/` всё равно рисует экран входа уже
   * в первом HTML: клиент видит заголовок и плитки до загрузки скриптов (D5, Lighthouse).
   */
  if (chosen === null && !(entry || pathname === "/")) return null;

  const personas = DEMO_PERSONAS.map((id) => employees.find((item) => item.id === id))
    .filter((item): item is (typeof employees)[number] => !!item)
    // С флагом `legacy_modules` выбор прежний, из всех ролей демонстрации (ADR-034)
    .filter((item) => legacy || CANON_ROLES.includes(item.role))
    .sort((a, b) => CANON_ROLES.indexOf(a.role) - CANON_ROLES.indexOf(b.role));

  const choose = (personaId: string, role: EmployeeRole) => {
    setEntering(true);
    record({ t: "role", role, personaId });
    startScenario(scenarioFor(role, legacy).id);
    markRoleChosen();
    /*
     * Пришли по ссылке на конкретный экран — остаёмся на нём (закрытый роли покажет
     * «Нет доступа»); с главной — на рабочий экран выбранной роли.
     *
     * «Главная» — это не только «/»: корень успевает перенаправить на рабочий экран роли
     * по умолчанию ещё до выбора (ADR-028), и сравнение только с «/» оставляло ПТО и прораба
     * на чужом «Внимании».
     */
    const fromHome = entry || pathname === "/" || pathname === homeRouteFor(roleBefore);
    void enterAs(personaId, role)
      .then((to) => (fromHome ? navigate({ to }) : undefined))
      .finally(() => setEntering(false));
  };

  /** Плитка сценария: роль первого шага, сценарий канона и его стартовый экран */
  const startTile = (scenarioId: string) => {
    const scenario = scenarioById(scenarioId);
    const first = scenario?.steps[0];
    const role = first?.role ?? "foreman";
    const persona = CANON_PERSONA[role];
    if (!scenario || !persona) return;
    setEntering(true);
    record({ t: "role", role, personaId: persona });
    startScenario(scenario.id);
    markRoleChosen();
    const projectId = "p-korona";
    void enterAs(persona, role)
      .then((home) => navigate({ to: first?.to ? first.to(projectId) : home }))
      .finally(() => setEntering(false));
  };

  const fromHome = entry || pathname === "/" || pathname === homeRouteFor(roleBefore);
  // Экран входа канона — без флага; с флагом показ идёт прежними сценариями ролей
  const showEntry = fromHome && !pickRole && !legacy;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-picker-title"
      ref={scroller}
      className="fixed inset-0 z-[60] isolate overflow-x-hidden overflow-y-auto bg-void"
    >
      {/*
        Шар как у Catalist: тёплый свет за заголовком, единственный на экране. В светлой теме
        утилита сама делает его мягче, и молочный фон остаётся с тёплым пятном.
      */}
      <span
        aria-hidden
        className={cn(
          "orb",
          showEntry
            ? "-top-20 -right-24 size-[300px] sm:-top-24 sm:right-[-40px] sm:size-[440px] lg:top-[-120px] lg:right-[6%] lg:size-[560px]"
            : "-top-24 -right-28 size-[260px] sm:size-[360px] lg:right-[8%] lg:size-[440px]",
        )}
      />
      <div className="relative mx-auto flex min-h-full w-full max-w-[1200px] flex-col px-5 pt-5 pb-10 sm:px-10 sm:pt-8 lg:px-16 lg:pt-10 lg:pb-14">
        <div className="flex min-h-10 items-center justify-between gap-3">
          {/* Знак «гайка» строчными: фирменный знак ещё не утверждён, это рабочее начертание */}
          <span aria-hidden className="text-title text-text">
            гайка
          </span>
          <span className="text-meta-strong glass inline-flex min-h-9 items-center rounded-full px-3.5 font-medium text-text-2">
            Демо-показ
          </span>
        </div>
        {showEntry ? (
          <>
            <h1
              id="role-picker-title"
              className="text-hero mt-14 max-w-[980px] text-balance text-text sm:mt-20 lg:mt-24"
            >
              Говорите с объекта. <span className="tone-2 block">Гайка соберёт остальное.</span>
            </h1>
            <p className="text-heading mt-5 max-w-[560px] text-text-2 sm:mt-6">
              Голос с площадки становится отчётом, документом и заявкой. Человек только
              подтверждает.
            </p>
            <ul className="mt-10 grid gap-3 sm:mt-14 md:grid-cols-3 md:gap-4 lg:mt-auto lg:pt-16">
              {tiles.map((tile, index) => (
                <li key={tile.id} className="flex">
                  <button
                    type="button"
                    onClick={() => startTile(tile.id)}
                    className="focus-ring press card-v3 relative flex min-h-[148px] w-full flex-col overflow-hidden rounded-[var(--r-2xl)] p-5 text-left md:min-h-[232px] md:p-6"
                  >
                    {/* Свечение сверху своим оттенком сценария (ScenarioTile) */}
                    <span
                      aria-hidden
                      className={cn("absolute inset-x-0 top-0 h-28 md:h-36", tile.glow)}
                    />
                    <span className="relative flex items-center justify-between gap-3">
                      <span className="text-meta mono text-text-3">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-meta inline-flex min-h-7 items-center rounded-full bg-surface-2 px-3 text-text-2">
                        1 минута
                      </span>
                    </span>
                    <span className="relative mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 pt-6">
                      <span className="min-w-0">
                        <span className="text-title block text-text">{tile.title}</span>
                        <span className="text-body mt-1.5 block text-text-2">{tile.hint}</span>
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-12 shrink-0 place-items-center rounded-full",
                          index === 0 ? "bg-pill text-pill-text" : "bg-surface-2 text-text",
                        )}
                      >
                        <ArrowUpRight className="size-5" />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setPickRole(true)}
                className="text-body-strong focus-ring press glass inline-flex min-h-12 items-center gap-2 self-start rounded-full px-5 font-medium text-text ring-1 ring-line-2 ring-inset"
              >
                Выбрать роль самому
                <ArrowRight className="size-4 text-text-2" aria-hidden />
              </button>
              <p className="text-meta max-w-[520px] text-text-3 sm:text-right">
                Демонстрация на вымышленных данных: речь и разбор подготовлены заранее, ничего не
                заказывается и не отправляется.
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 id="role-picker-title" className="text-hero mt-14 text-text sm:mt-20 lg:mt-24">
              Выберите роль
            </h1>
            <p className="text-heading tone-2 mt-3 max-w-[620px]">
              Роль задаёт стартовый экран и сценарий подсказок. Сменить её можно в «Ещё».
            </p>
            <ul className="mt-10 grid gap-3 sm:mt-14 md:grid-cols-2 md:gap-4">
              {personas.map((person) => {
                const hint = roleHint[person.role];
                const Icon = hint?.icon ?? Building2;
                return (
                  <li key={person.id} className="flex">
                    <button
                      type="button"
                      onClick={() => choose(person.id, person.role)}
                      className="focus-ring press card-v3 flex min-h-[120px] w-full items-start gap-4 rounded-[var(--r-2xl)] p-5 text-left md:min-h-[132px] md:p-6"
                    >
                      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2 text-text">
                        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-title block text-text">
                          {employeeRoleLabel[person.role]}
                        </span>
                        <span className="text-body mt-1 block text-text-2">
                          {hint?.text ?? person.position}
                        </span>
                        <span className="text-meta mt-2 block text-text-3">{person.name}</span>
                      </span>
                      <ArrowUpRight className="mt-1 size-5 shrink-0 text-text-3" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
            {fromHome ? (
              <button
                type="button"
                onClick={() => setPickRole(false)}
                className="text-body-strong focus-ring press glass mt-6 inline-flex min-h-12 items-center gap-2 self-start rounded-full px-5 font-medium text-text ring-1 ring-line-2 ring-inset"
              >
                <ArrowLeft className="size-4 text-text-2" aria-hidden />К сценариям показа
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
