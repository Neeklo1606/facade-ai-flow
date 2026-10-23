import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EmployeeRole } from "@/contracts";
import { queries } from "@/api/queries";
import { useApp } from "@/lib/app-context";
import { homeRouteFor } from "@/lib/navigation";

/**
 * Войти за персону и узнать её рабочий экран (ADR-028). Объекты всё равно загружаются сразу:
 * экран роли показывает данные выбранного объекта, а у прораба реестр — только его объекты.
 */
export function useEnterAs() {
  const { setPersonaId } = useApp();
  const queryClient = useQueryClient();
  return useCallback(
    async (personaId: string, role: EmployeeRole) => {
      await setPersonaId(personaId);
      /*
       * Объекты новой роли подгружаются заранее, но это не обязательно для перехода: смена
       * персоны сбрасывает кеш, и сброс может отменить эту загрузку (CancelledError).
       * Тогда экран роли сам запросит объекты, а вход не обрывается
       */
      await queryClient.fetchQuery(queries.projects()).catch(() => undefined);
      return homeRouteFor(role);
    },
    [setPersonaId, queryClient],
  );
}
