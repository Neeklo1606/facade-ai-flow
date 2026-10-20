import { Check } from "lucide-react";
import { ROLE_LABEL, useGasActor } from "@/api/gas-ops";
import { ROLE_ABOUT, ROLE_ORDER, roleInitial } from "@/lib/gas-ops/screens";
import { cn } from "@/lib/utils";
import { useRoleSwitch } from "./use-role-switch";

/**
 * Список ролей (F1): кто это и что делает, одной строкой. Системного `<select>` больше нет:
 * на экране бригадира стоял «Менеджер проверки», и это сбивало.
 */
export function RoleList({ onDone }: { onDone?: () => void }) {
  const actor = useGasActor();
  const switchRole = useRoleSwitch();
  return (
    <ul className="flex flex-col gap-1" aria-label="Роли">
      {ROLE_ORDER.map((role) => {
        const active = actor.role === role;
        return (
          <li key={role}>
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => {
                onDone?.();
                if (!active) void switchRole(role);
              }}
              className={cn(
                "flex min-h-[56px] w-full items-center gap-3 rounded-[var(--r-md)] px-3 py-2 text-left focus-ring press",
                active ? "bg-surface-2" : "is-hover:bg-surface-2",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-semibold",
                  active ? "bg-pill text-pill-text" : "bg-surface-3 text-text-2",
                )}
              >
                {roleInitial(role)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-5 font-medium text-text">
                  {ROLE_LABEL[role]}
                </span>
                <span className="block text-[13px] leading-[18px] text-text-3">
                  {ROLE_ABOUT[role]}
                </span>
              </span>
              {active ? <Check className="size-4 shrink-0 text-text-2" aria-hidden /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
