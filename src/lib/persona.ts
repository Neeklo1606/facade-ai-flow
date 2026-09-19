import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EmployeeRole } from "@/contracts";
import { queries } from "@/api/queries";
import { ALL_PROJECTS, useApp } from "@/lib/app-context";
import { startRouteFor } from "@/lib/navigation";

/**
 * Войти за персону и узнать её стартовый экран. Объекты берутся уже после входа: у прораба
 * реестр — только его объекты, и стартовый экран не должен вести в чужой (ADR-012).
 */
export function useEnterAs() {
  const { setPersonaId, projectId } = useApp();
  const queryClient = useQueryClient();
  return useCallback(
    async (personaId: string, role: EmployeeRole) => {
      await setPersonaId(personaId);
      const list = await queryClient.fetchQuery(queries.projects());
      const selected =
        projectId !== ALL_PROJECTS && list.some((item) => item.project.id === projectId)
          ? projectId
          : null;
      return startRouteFor(role, selected ?? list[0]?.project.id ?? null);
    },
    [setPersonaId, projectId, queryClient],
  );
}
