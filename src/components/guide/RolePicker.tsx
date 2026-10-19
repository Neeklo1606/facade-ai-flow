import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Building2, ClipboardCheck, HardHat, PackageSearch } from "lucide-react";
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
import { Button } from "@/components/ui/button";

/** Что роль делает в показе: одна строка под названием (канон 18.10, ADR-038) */
const roleHint: Partial<Record<EmployeeRole, { icon: LucideIcon; text: string }>> = {
  foreman: { icon: HardHat, text: "Говорит с объекта: смена, объём, нехватка материала" },
  pto: { icon: ClipboardCheck, text: "Проверяет отчёты и выпускает сводку и ведомость" },
  supply: { icon: PackageSearch, text: "Решает по заявкам на материал" },
  manager: { icon: Building2, text: "Видит объём, проверку и пропущенные отчёты" },
};

/** Роли канона в выборе: директор остаётся в коде, но в показ не выходит (ADR-038) */
const CANON_ROLES: readonly EmployeeRole[] = ["foreman", "pto", "supply", "manager"];

/** Плитки сценариев на экране входа: оттенок свечения у каждой свой */
const tiles = [
  {
    id: "canon-shift",
    title: "Смена → учёт",
    hint: "Прораб говорит, гайка раскладывает",
    glow: "from-ember/25",
  },
  {
    id: "canon-document",
    title: "ПТО → документ",
    hint: "Проверка, сводка и черновик ведомости",
    glow: "from-sand/25",
  },
  {
    id: "canon-supply",
    title: "Объект → снабжение",
    hint: "Заявка на материал и решение",
    glow: "from-info/25",
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
      className="fixed inset-0 z-[60] overflow-y-auto bg-void px-5 py-10"
    >
      <div className="relative mx-auto flex min-h-full w-full max-w-[560px] flex-col justify-center">
        {/* Знак «гайка» строчными: фирменный знак ещё не утверждён, это рабочее начертание */}
        <span aria-hidden className="text-[22px] leading-none font-semibold text-text">
          гайка
        </span>
        {showEntry ? (
          <>
            <h1 id="role-picker-title" className="mt-6 text-greeting">
              Говорите с объекта. Гайка соберёт остальное.
            </h1>
            <p className="mt-3 text-body text-text-2">
              Голос с площадки становится отчётом, документом и заявкой. Человек только
              подтверждает.
            </p>
            <ul className="mt-8 flex flex-col gap-3">
              {tiles.map((tile, index) => (
                <li key={tile.id}>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => startTile(tile.id)}
                    className="focus-ring press relative flex h-auto min-h-[104px] w-full flex-col items-stretch justify-center gap-0 whitespace-normal rounded-[var(--r-lg)] bg-surface px-5 py-5 text-left"
                  >
                    <span className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <span className="text-card-title">
                        <span className="tnum text-text-3">{index + 1}</span> {tile.title}
                      </span>
                      <ArrowUpRight className="size-5 shrink-0 text-text-3" aria-hidden />
                    </span>
                    <span className="relative mt-1 text-caption text-text-2">{tile.hint}</span>
                    <span className="mt-2 text-[13px] font-normal text-text-3">1 минута</span>
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setPickRole(true)}
              className="focus-ring mt-4 min-h-12 self-start rounded-[var(--r-xs)] text-caption text-text-2 underline-offset-4 hover:underline"
            >
              Выбрать роль самому
            </Button>
            <p className="mt-6 text-caption text-text-3">
              Демонстрация на вымышленных данных: речь и разбор подготовлены заранее, ничего не
              заказывается и не отправляется.
            </p>
          </>
        ) : (
          <>
            <h1 id="role-picker-title" className="mt-6 text-page-title">
              Выберите роль
            </h1>
            <p className="mt-2 text-body text-text-2">
              Роль задаёт стартовый экран и сценарий подсказок. Сменить её можно в «Ещё».
            </p>
            <ul className="mt-6 flex flex-col gap-2">
              {personas.map((person) => {
                const hint = roleHint[person.role];
                const Icon = hint?.icon ?? Building2;
                return (
                  <li key={person.id}>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => choose(person.id, person.role)}
                      className="focus-ring press flex h-auto min-h-[80px] w-full items-center gap-3 whitespace-normal rounded-[var(--r-lg)] bg-surface px-4 py-4 text-left transition-fast hover:bg-surface-2"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-[var(--r-sm)] bg-surface-2 text-text-2">
                        <Icon className="size-5" strokeWidth={1.5} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] leading-[1.35] font-medium text-text">
                          {employeeRoleLabel[person.role]}
                        </span>
                        <span className="block text-[13px] leading-[1.4] text-text-3">
                          {hint?.text ?? person.position} · {person.name}
                        </span>
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
            {fromHome ? (
              <Button
                variant="ghost"
                type="button"
                onClick={() => setPickRole(false)}
                className="focus-ring mt-4 min-h-12 self-start rounded-[var(--r-xs)] text-caption text-text-2 underline-offset-4 hover:underline"
              >
                К сценариям показа
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
