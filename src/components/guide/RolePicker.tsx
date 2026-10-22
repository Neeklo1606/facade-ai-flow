import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
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
import { scenarioFor } from "@/lib/guide/scenarios";
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
 * Выбор роли при первом входе во вкладку (ADR-010). Роль задаёт персону, стартовый экран
 * и сценарий проводки. Пока вкладка в браузере не известна (SSR), экран не рисуется.
 *
 * Экран входа показа с плитками сценариев переехал на `/demo` (ADR-047, `DemoScenarios`).
 * Здесь остался выбор роли поверх экранов ГАЙКИ и ссылка «К демо»: раньше с него нельзя
 * было вернуться к сайту (аудит L0, пункт «ж»).
 */
export function RolePicker() {
  const chosen = useRoleChosen();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const enterAs = useEnterAs();
  // Роль до выбора: по умолчанию демонстрация открывается за руководителя
  const roleBefore = useCurrentRole();
  const employees = useQuery(queries.employees()).data ?? [];
  const scroller = useRef<HTMLDivElement>(null);
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
  // До гидратации выбор вкладки неизвестен: экран рисуется только в браузере
  if (chosen === null) return null;

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
    const fromHome = pathname === "/" || pathname === homeRouteFor(roleBefore);
    void enterAs(personaId, role)
      .then((to) => (fromHome ? navigate({ to }) : undefined))
      .finally(() => setEntering(false));
  };

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
        className="orb-brand -top-24 -right-28 size-[260px] sm:size-[360px] lg:right-[8%] lg:size-[440px]"
      />
      <div className="relative mx-auto flex min-h-full w-full max-w-[1200px] flex-col px-5 pt-5 pb-10 sm:px-10 sm:pt-8 lg:px-16 lg:pt-10 lg:pb-14">
        <div className="flex min-h-10 items-center justify-between gap-3">
          {/* Знак «гайка» строчными: фирменный знак ещё не утверждён, это рабочее начертание */}
          <span aria-hidden className="text-title text-text">
            гайка
          </span>
          <Link
            to="/demo"
            className="text-meta-strong glass inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 font-medium text-text-2 focus-ring"
          >
            <ArrowLeft className="size-4" aria-hidden />К демо
          </Link>
        </div>
        <>
          <h1 id="role-picker-title" className="mt-section text-display text-text lg:mt-24">
            Выберите роль
          </h1>
          <p className="mt-2 max-w-[620px] text-body text-text-2">
            Роль задаёт стартовый экран и сценарий подсказок. Сменить её можно в «Ещё».
          </p>
          <ul className="surface-1 mt-section overflow-hidden [&>li+li]:border-t [&>li+li]:border-line">
            {personas.map((person) => {
              const hint = roleHint[person.role];
              const Icon = hint?.icon ?? Building2;
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => choose(person.id, person.role)}
                    className="flex min-h-row w-full items-center gap-3 px-row py-row text-left focus-ring is-hover:bg-surface-2"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-text">
                      <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-heading text-text">
                        {employeeRoleLabel[person.role]}
                      </span>
                      <span className="mt-0.5 block text-meta text-text-2">
                        {hint?.text ?? person.position}
                      </span>
                      <span className="block text-meta text-text-3">{person.name}</span>
                    </span>
                    <ArrowUpRight className="size-5 shrink-0 text-text-3" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      </div>
    </div>
  );
}
