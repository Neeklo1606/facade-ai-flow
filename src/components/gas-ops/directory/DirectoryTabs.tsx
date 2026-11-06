/**
 * Справочники одним экраном (финальный промт, 2.3; ADR-064): сметы, бригады, сотрудники,
 * объекты, ставки и состав — вкладки над каждым из этих экранов. Экраны прежние, ссылки
 * на них не меняются; вкладка, которую роль не открывает, не показывается.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { useGasActor } from "@/api/gas-ops";
import { SCREEN_ICON } from "@/components/gas-ops/shell/icons";
import { gasScreen, type GasScreenKey } from "@/lib/gas-ops/screens";
import { cn } from "@/lib/utils";

const TABS: { key: GasScreenKey; to: string; label: string }[] = [
  { key: "estimates", to: "/gas/estimates", label: "Сметы" },
  { key: "brigades", to: "/gas/brigades", label: "Бригады" },
  { key: "employees", to: "/gas/employees", label: "Сотрудники" },
  { key: "objects", to: "/gas/objects", label: "Объекты" },
  { key: "directory", to: "/gas/directory", label: "Ставки и состав" },
];

export function DirectoryTabs() {
  const actor = useGasActor();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = TABS.filter((tab) => gasScreen(tab.key).roles.includes(actor.role));
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Справочники" className="-mx-gutter overflow-x-auto px-gutter">
      {/* Одна дорожка вкладок (ADR-066): выбранная белой карточкой, значок раздела рядом */}
      <ul className="dir-tabs flex w-max gap-1 rounded-pill bg-panel-2 p-1">
        {tabs.map((tab) => {
          const on = pathname === tab.to;
          const Icon = SCREEN_ICON[tab.key];
          return (
            <li key={tab.key}>
              <Link
                to={tab.to}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "dir-tab inline-flex min-h-11 items-center gap-2 rounded-pill px-4 text-body whitespace-nowrap focus-ring",
                  on ? "text-ink" : "text-ink-2",
                )}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
