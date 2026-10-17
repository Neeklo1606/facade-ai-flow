import { useNavigate } from "@tanstack/react-router";
import type { ProjectOverview } from "@/contracts";
import { useAccess } from "@/api/access";
import { PillTabs } from "@/components/common/PillTabs";
import { badgeCounts, badgeIsCritical } from "@/lib/badges";
import { sectionHref } from "@/lib/navigation";
import { supplyTabsFor, type SupplyTabId } from "@/lib/supply";

/**
 * Полоса вкладок раздела «Снабжение» (ADR-031): спецификация → запросы → поставщики →
 * поставки. Набор вкладок — права роли, счётчик у каждой свой: из них складывается число
 * на пункте меню, и здесь видно, из чего.
 *
 * У роли с одной доступной вкладкой полосы нет: выбор из одного обещает выбор, которого
 * нет (ADR-031, п. 2).
 */
export function SupplyTabs({
  projectId,
  overview,
  current,
}: {
  projectId: string;
  overview: ProjectOverview | null;
  current: SupplyTabId;
}) {
  const navigate = useNavigate();
  const { ready, role } = useAccess();
  // Пока роль неизвестна, полосу не рисуем: иначе у прораба мелькнули бы чужие вкладки
  const tabs = ready && role ? supplyTabsFor(role) : [];
  if (tabs.length < 2) return null;

  const counts = badgeCounts(projectId, overview ? [overview] : []);

  return (
    <PillTabs
      className="mb-5"
      label="Разделы снабжения"
      value={current}
      onChange={(next) => {
        const tab = tabs.find((item) => item.id === next);
        if (!tab) return;
        const href = sectionHref(projectId, tab.section);
        void navigate({ to: href.to, search: href.search as never });
      }}
      tabs={tabs.map((tab) => {
        const count = tab.badge ? counts[tab.badge] : 0;
        return {
          value: tab.id,
          label: tab.label,
          ...(tab.badge && count > 0
            ? {
                attention: {
                  count,
                  critical: badgeIsCritical([tab.badge]),
                  label: tab.badgeLabel ?? "требует внимания",
                },
              }
            : {}),
        };
      })}
    />
  );
}
