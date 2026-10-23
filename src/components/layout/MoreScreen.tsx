import { Suspense, lazy, useState } from "react";
import {
  ArrowUpRight,
  Clock,
  Info,
  LogOut,
  MessageCircleQuestion,
  Palette,
  RotateCcw,
} from "lucide-react";
import { dataSource } from "@/api/config";
import { signOutFn } from "@/api/auth-functions";
import { useApp } from "@/lib/app-context";
import { useCurrentRole, useCurrentUser, useProjectId } from "@/lib/project-scope";
import { bottomNavFor, navItemsFor, plusActionsFor, sectionHref } from "@/lib/navigation";
import { themeChoices, themeLabels, type ThemeChoice } from "@/lib/theme";
import { reopenGuide, useGuide } from "@/lib/guide/store";
import {
  RoleCard,
  SettingsButton,
  SettingsGroup,
  ThemeSetting,
  SettingsLink,
} from "@/components/ui/kit/settings-list";
import { DemoReset } from "./DemoReset";
import { RoleSheet } from "./RoleSheet";

const PlusSheet = lazy(() => import("./sheets").then((module) => ({ default: module.PlusSheet })));

/**
 * Экран «Ещё» ГАЙКИ (ADR-048): вкладка, а не шторка, как «Настройки» в Telegram. Сюда собрано
 * всё, что раньше было в выдвижном меню и в шторке «Ещё»: разделы роли вне панели, создание,
 * показ, тема, смена роли. Ни один раздел не потерян (сверка с audit/ROUTES.md, тест tabs.spec).
 */
export function MoreScreen() {
  const role = useCurrentRole();
  const user = useCurrentUser();
  const projectId = useProjectId();
  const guide = useGuide();
  const { themeChoice, setThemeChoice } = useApp();
  const [roles, setRoles] = useState(false);
  const [plus, setPlus] = useState(false);

  const inPanel = new Set(bottomNavFor(role, projectId).map((item) => item.key));
  const rest = navItemsFor(role).filter((item) => !inPanel.has(item.key));
  const actions = plusActionsFor(role, projectId);
  const quickReport = actions.find((action) => action.key === "report") ?? null;
  const create = actions.filter((action) => action.key !== "report");
  const initials = (user?.name ?? "Гость")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 pb-6">
      <h1 className="text-page-title text-text">Ещё</h1>
      {user ? (
        <RoleCard
          initials={initials}
          name={user.name}
          role={user.roleLabel}
          {...(dataSource === "demo" ? { onChange: () => setRoles(true) } : {})}
        />
      ) : null}

      {quickReport || create.length ? (
        <SettingsGroup title="Создать">
          {quickReport ? (
            <SettingsButton
              icon={quickReport.icon}
              label={quickReport.label}
              onSelect={() => setPlus(true)}
            />
          ) : null}
          {create.map((action) => (
            <SettingsLink
              key={action.key}
              icon={action.icon}
              label={action.label}
              to={action.to}
              {...(action.search ? { search: action.search } : {})}
            />
          ))}
        </SettingsGroup>
      ) : null}

      {rest.length ? (
        <SettingsGroup title="Разделы">
          {rest.map((item) => {
            const href = sectionHref(projectId, item.section, item.to);
            return (
              <SettingsLink
                key={item.key}
                icon={item.icon}
                label={item.label}
                to={href.to}
                search={href.search as Record<string, string>}
              />
            );
          })}
        </SettingsGroup>
      ) : null}

      {dataSource === "demo" ? (
        <SettingsGroup title="Показ">
          {guide.scenarioId && guide.closed ? (
            <SettingsButton
              icon={MessageCircleQuestion}
              label="Подсказки показа"
              onSelect={reopenGuide}
            />
          ) : null}
          <li>
            <DemoReset
              trigger={
                <button
                  type="button"
                  className="flex min-h-row-compact w-full items-center gap-3 px-4 py-2.5 text-left text-body text-text transition-colors duration-100 focus-ring active:bg-surface-2 is-hover:bg-surface-2"
                >
                  <RotateCcw
                    className="size-5 shrink-0 text-text-2"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">Сбросить демо-данные</span>
                </button>
              }
            />
          </li>
          <SettingsLink icon={Clock} label="Учёт выработки бригад" to="/gas" />
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="Оформление">
        <ThemeSetting
          icon={Palette}
          value={themeChoice}
          options={themeChoices.map((choice) => ({
            value: choice,
            label: themeLabels[choice as ThemeChoice],
          }))}
          onChange={(choice) => setThemeChoice(choice as ThemeChoice)}
        />
      </SettingsGroup>

      <SettingsGroup>
        {dataSource === "demo" ? (
          <SettingsLink icon={Info} label="О продукте" to="/" />
        ) : (
          <SettingsButton
            icon={LogOut}
            label="Выйти"
            tone="danger"
            onSelect={() => void signOutFn().then(() => window.location.assign("/login"))}
          />
        )}
        {dataSource === "demo" ? (
          <SettingsLink icon={ArrowUpRight} label="Все сценарии демо" to="/demo" />
        ) : null}
      </SettingsGroup>

      <RoleSheet open={roles} onOpenChange={setRoles} />
      {plus ? (
        <Suspense fallback={null}>
          <PlusSheet
            open
            onOpenChange={setPlus}
            role={role}
            projectId={projectId}
            initialChannel="report"
          />
        </Suspense>
      ) : null}
    </div>
  );
}
