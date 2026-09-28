import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { DEMO_PERSONAS, dataSource } from "@/api/config";
import { signOutFn } from "@/api/auth-functions";
import { queries } from "@/api/queries";
import { employeeRoleLabel, type EmployeeRole } from "@/contracts";
import { ALL_PROJECTS, useApp } from "@/lib/app-context";
import { useEnterAs } from "@/lib/persona";
import { useCurrentUser, useProjectId } from "@/lib/project-scope";
import { bottomNavFor, navItemsFor, plusActionsFor, sectionHref } from "@/lib/navigation";
import { themeChoices, themeLabels, type ThemeChoice } from "@/lib/theme";
import { BottomSheet, SheetRow } from "@/components/common/BottomSheet";
import { cn } from "@/lib/utils";

/**
 * Шторки оболочки одним модулем (ADR-026): «+», «Ещё» и выбор объекта. Один отложенный чанк
 * вместо трёх — у них общие зависимости, и раздельные чанки платили за них трижды.
 */

/** Шторка «+»: только работающие каналы ввода роли (ADR-026, п. 4) */
export function PlusSheet({
  open,
  onOpenChange,
  role,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: EmployeeRole;
  projectId: string | null;
}) {
  const navigate = useNavigate();
  const actions = plusActionsFor(role, projectId);
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Создать"
      description={
        projectId
          ? "Форма откроется на своём экране — там, где у неё контекст"
          : "Объект не выбран: часть форм попросит выбрать его первым шагом"
      }
    >
      <div className="grid gap-1 pb-2">
        {actions.map((action) => (
          <SheetRow
            key={action.key}
            icon={<action.icon className="size-5" strokeWidth={1.75} aria-hidden />}
            label={action.label}
            hint={action.hint}
            onSelect={() => {
              onOpenChange(false);
              void navigate({ to: action.to, search: (action.search ?? {}) as never });
            }}
          />
        ))}
      </div>
    </BottomSheet>
  );
}

/** Шторка «Ещё»: кто вошёл, остальные разделы роли, тема, смена роли в демо, выход */
export function MoreSheet({
  open,
  onOpenChange,
  role,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: EmployeeRole;
  projectId: string | null;
}) {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const enterAs = useEnterAs();
  const { personaId, themeChoice, setThemeChoice } = useApp();
  const employees = useQuery(queries.employees()).data ?? [];
  const inPanel = new Set(bottomNavFor(role, projectId).map((item) => item.key));
  const rest = navItemsFor(role).filter((item) => !inPanel.has(item.key));
  const personas = DEMO_PERSONAS.map((id) => employees.find((item) => item.id === id)).filter(
    (item): item is (typeof employees)[number] => !!item,
  );

  const go = (to: string, search: Record<string, string>) => {
    onOpenChange(false);
    void navigate({ to, search: search as never });
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={user ? `${user.name}, ${user.roleLabel}` : "Ещё"}
      description="Разделы, которых нет в панели, тема и выход"
    >
      <div className="grid gap-1 pb-2">
        {rest.map((item) => {
          const href = sectionHref(projectId, item.section, item.to);
          return (
            <SheetRow
              key={item.key}
              icon={<item.icon className="size-5" strokeWidth={1.75} aria-hidden />}
              label={item.label}
              onSelect={() => go(href.to, href.search as Record<string, string>)}
            />
          );
        })}

        <div className="mt-2 border-t border-line pt-2">
          <p className="px-3 pb-1 text-[12px] leading-[1.4] text-text-3">Тема оформления</p>
          <div className="grid grid-cols-3 gap-1 px-1">
            {themeChoices.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setThemeChoice(choice as ThemeChoice)}
                aria-pressed={themeChoice === choice}
                className={cn(
                  "focus-ring min-h-12 rounded-[var(--r-md)] border px-2 text-[13px] transition-fast",
                  themeChoice === choice
                    ? "border-line-2 bg-surface-2 text-text"
                    : "border-line text-text-2",
                )}
              >
                {themeLabels[choice as ThemeChoice]}
              </button>
            ))}
          </div>
        </div>

        {/* Роль в демонстрации меняют здесь же: в рабочем контуре её даёт учётная запись */}
        {dataSource === "demo" && personas.length > 0 && (
          <div className="mt-2 border-t border-line pt-2">
            <p className="px-3 pb-1 text-[12px] leading-[1.4] text-text-3">Роль в демонстрации</p>
            {personas.map((person) => (
              <SheetRow
                key={person.id}
                label={person.name}
                hint={
                  person.id === personaId
                    ? `${employeeRoleLabel[person.role]} — выбрана`
                    : employeeRoleLabel[person.role]
                }
                onSelect={() => {
                  onOpenChange(false);
                  void enterAs(person.id, person.role).then((to: string) => navigate({ to }));
                }}
              />
            ))}
          </div>
        )}

        {dataSource === "server" && (
          <div className="mt-2 border-t border-line pt-2">
            <SheetRow
              icon={<LogOut className="size-5" strokeWidth={1.75} aria-hidden />}
              label="Выйти"
              hint="Сессия завершится на сервере"
              tone="danger"
              onSelect={() => {
                onOpenChange(false);
                void signOutFn().then(() => window.location.assign("/login"));
              }}
            />
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/** Выбор объекта шторкой (ADR-026, п. 8): на телефоне селектора сайдбара нет */
export function ProjectSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setProjectId } = useApp();
  const projectId = useProjectId();
  const projects = useQuery(queries.projects()).data ?? [];
  const setOpen = onOpenChange;
  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      title="Объект"
      description="Разделы и счётчики считаются по выбранному объекту"
    >
      <div className="grid gap-1 pb-2">
        <SheetRow
          label="Все объекты"
          {...(projectId ? {} : { hint: "выбрано" })}
          onSelect={() => {
            setProjectId(ALL_PROJECTS);
            setOpen(false);
          }}
        />
        {projects.map((item) => (
          <SheetRow
            key={item.project.id}
            label={item.project.name}
            hint={
              item.project.id === projectId
                ? `${item.project.code} — выбрано`
                : `${item.project.code} · ${item.project.region}`
            }
            onSelect={() => {
              setProjectId(item.project.id);
              setOpen(false);
            }}
          />
        ))}
      </div>
    </BottomSheet>
  );
}
