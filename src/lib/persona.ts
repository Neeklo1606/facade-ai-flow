import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EmployeeRole } from "@/contracts";
import { queries } from "@/api/queries";
import { ALL_PROJECTS, useApp } from "@/lib/app-context";
import { homeRouteFor } from "@/lib/navigation";

/**
 * Войти за персону и узнать её рабочий экран (ADR-028). Объекты всё равно загружаются сразу:
 * экран роли показывает данные выбранного объекта, а у прораба реестр — только его объекты.
 */
export function useEnterAs() {
  const { setPersonaId, projectId } = useApp();
  const queryClient = useQueryClient();
  return useCallback(
    async (personaId: string, role: EmployeeRole) => {
      await setPersonaId(personaId);
      await queryClient.fetchQuery(queries.projects());
      return homeRouteFor(role);
    },
    [setPersonaId, projectId, queryClient],
  );
}
