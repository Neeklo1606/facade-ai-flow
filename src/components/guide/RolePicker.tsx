import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, ClipboardCheck, HardHat, LineChart, PackageSearch } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { employeeRoleLabel, type EmployeeRole } from "@/contracts";
import { queries } from "@/api/queries";
import { DEMO_PERSONAS } from "@/api/config";
import { useApp } from "@/lib/app-context";
import { markStartScreenApplied, startRouteFor } from "@/lib/navigation";
import { markRoleChosen, startScenario, useRoleChosen } from "@/lib/guide/store";
import { scenarioFor } from "@/lib/guide/scenarios";
import { record } from "@/lib/guide/telemetry";

/** Что роль увидит в демонстрации: одна строка под названием */
const roleHint: Partial<Record<EmployeeRole, { icon: LucideIcon; text: string }>> = {
  manager: { icon: Building2, text: "Что требует решения по всем объектам и почему" },
  supply: { icon: PackageSearch, text: "От спецификации до запроса поставщикам и выбора" },
  pto: { icon: ClipboardCheck, text: "Проверка позиций, извлечённых из документации" },
  foreman: { icon: HardHat, text: "Отчёт с площадки и подтверждение объёма" },
  director: { icon: LineChart, text: "Состояние компании, реестр объектов, решения" },
};

/**
 * Выбор роли при первом входе во вкладку (ADR-010). Роль задаёт персону, стартовый экран
 * и сценарий проводки. Пока вкладка в браузере не известна (SSR), экран не рисуется.
 */
export function RolePicker() {
  const chosen = useRoleChosen();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setPersonaId, projectId } = useApp();
  const employees = useQuery(queries.employees()).data ?? [];
  const projects = useQuery(queries.projects()).data ?? [];

  // Пока выбирается роль, приложение под экраном выбора недоступно ни мышью, ни клавиатурой
  useEffect(() => {
    if (chosen !== false) return;
    const shell = document.querySelector(".app-window");
    shell?.setAttribute("inert", "");
    return () => shell?.removeAttribute("inert");
  }, [chosen]);

  if (chosen !== false) return null;

  const personas = DEMO_PERSONAS.map((id) => employees.find((item) => item.id === id)).filter(
    (item): item is (typeof employees)[number] => !!item,
  );

  const choose = (personaId: string, role: EmployeeRole) => {
    setPersonaId(personaId);
    record({ t: "role", role, personaId });
    startScenario(scenarioFor(role).id);
    markRoleChosen();
    markStartScreenApplied();
    // Пришли по ссылке на конкретный экран — остаёмся на нём; с главной — на стартовый экран роли
    if (pathname === "/") {
      const selected = projectId && projects.some((p) => p.project.id === projectId);
      navigate({
        to: startRouteFor(role, selected ? projectId : (projects[0]?.project.id ?? null)),
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-picker-title"
      className="fixed inset-0 z-[60] overflow-y-auto bg-void px-4 py-10"
    >
      <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col justify-center">
        <span
          aria-hidden
          className="grid size-9 place-items-center rounded-[10px] bg-orange-strong text-[15px] font-semibold text-on-orange"
        >
          F
        </span>
        <h1 id="role-picker-title" className="mt-5 text-page-title">
          С какой роли начать?
        </h1>
        <p className="mt-2 text-[14px] leading-[1.5] text-text-2">
          neeklo FieldOps связывает проектную документацию, снабжение и площадку: от спецификации до
          решения по поставщику и отчёта о сделанном объёме.
        </p>
        <p className="mt-1 text-[14px] leading-[1.5] text-text-2">
          Это демонстрация на вымышленных данных: письма поставщикам не уходят, их ответы
          имитируются.
        </p>

        <ul className="mt-6 flex flex-col gap-2">
          {personas.map((person) => {
            const hint = roleHint[person.role];
            const Icon = hint?.icon ?? Building2;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => choose(person.id, person.role)}
                  className="focus-ring flex min-h-[64px] w-full items-center gap-3 rounded-[var(--r-md)] border border-line bg-surface px-4 py-3 text-left transition-fast hover:border-line-2 hover:bg-surface-2"
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
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-[12px] leading-[1.45] text-text-3">
          Роль задаёт стартовый экран и сценарий подсказок. Сменить её можно в карточке пользователя
          внизу меню.
        </p>
      </div>
    </div>
  );
}
