import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { ROLE_LABEL, useGasActions, useGasUsers, type Role } from "@/api/gas-ops";
import { gasScreen, ROLE_HOME } from "@/lib/gas-ops/screens";
import { toast } from "@/lib/toast";

/**
 * Смена роли (F1): вход за человека этой роли, переход на стартовый экран роли и тост
 * «Вы смотрите как …». Права остаются мок-ограничением порта, как в ADR-043.
 */
export function useRoleSwitch(): (role: Role, options?: { stay?: boolean }) => Promise<boolean> {
  const users = useGasUsers();
  const actions = useGasActions();
  const navigate = useNavigate();
  return useCallback(
    async (role, options) => {
      const user = users.find((u) => u.role === role);
      if (!user) return false;
      const result = await actions.signIn(user.id);
      if (!result.ok) {
        toast.error(result.message);
        return false;
      }
      if (!options?.stay) void navigate({ to: gasScreen(ROLE_HOME[role]).to });
      toast.success(`Вы смотрите как ${ROLE_LABEL[role].toLowerCase()}`);
      return true;
    },
    [users, actions, navigate],
  );
}
