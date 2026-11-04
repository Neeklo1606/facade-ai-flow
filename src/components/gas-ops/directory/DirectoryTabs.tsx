/**
 * Справочники одним экраном (финальный промт, 2.3; ADR-064): сметы, бригады, сотрудники,
 * объекты, ставки и состав — вкладки над каждым из этих экранов. Экраны прежние, ссылки
 * на них не меняются; вкладка, которую роль не открывает, не показывается.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { useGasActor } from "@/api/gas-ops";
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
      <ul className="flex w-max gap-2">
        {tabs.map((tab) => {
          const on = pathname === tab.to;
          return (
            <li key={tab.key}>
              <Link
                to={tab.to}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-body whitespace-nowrap focus-ring",
                  on ? "border-orange-strong bg-orange-dim text-text" : "border-line-2 text-text-2",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
