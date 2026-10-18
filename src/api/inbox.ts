import { useMemo } from "react";
import { isLegacyPath, legacyModulesEnabled } from "@/lib/legacy-modules";
import { useCheckQueue } from "./check";
import { useDashboard } from "./dashboard";
import { useToday } from "./today";
import { useAccess } from "./access";

/**
 * Данные экрана «Входящие» (ADR-034, п. 3): то, что ждёт этого человека. Собирается из уже
 * работающих источников — возвраты автору, очередь проверки и строки «Требует решения».
 *
 * Уточнений модели и задач здесь нет, потому что их нет в продукте: экран показывает только
 * блоки, за которыми стоят данные, и ни слова про то, чего пока не умеет система.
 *
 * Решения, которые ведут в модули за флагом `legacy_modules`, из списка уходят вместе
 * с модулями: ссылка, которая перенаправляет на рабочий экран, человеку не помогает.
 */
export function useInbox(projectId: string | null) {
  const { can, role } = useAccess();
  const decides = can("field-reports", "write") || role === "director";
  const seesReports = can("field-reports");
  const today = useToday(projectId, seesReports);
  const check = useCheckQueue(projectId, decides);
  const dash = useDashboard("week");

  const decisions = useMemo(
    () =>
      legacyModulesEnabled()
        ? dash.attention
        : dash.attention.filter((row) => !isLegacyPath(row.to)),
    [dash.attention],
  );

  const queue = decides ? check.queue : [];

  return {
    returned: today.returned,
    queue,
    decisions,
    count: today.returned.length + queue.length + decisions.length,
    pending: (seesReports && today.pending) || (decides && check.pending) || dash.listsPending,
    error: (seesReports && today.error) || (decides && check.error) || dash.listsError,
    refetch: () => {
      today.refetch();
      check.refetch();
      dash.refetch();
    },
  };
}
