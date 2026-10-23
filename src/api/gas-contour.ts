/**
 * Контур /gas для запроса (ADR-047): личный контур заказчика при верной куке личной ссылки,
 * иначе публичный. Набор заказчика грузится внутри обработчика: в клиентскую сборку
 * серверная функция попадает заглушкой вызова, без данных, а импорт `src/server/**`
 * из клиентского кода запрещает сборщик (import-protection TanStack Start).
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { hasClientAccess } from "@/lib/client-link";
import type { GasContourPayload } from "@/lib/gas-ops/contour";

export const gasContourFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<GasContourPayload> => {
    if (!(await hasClientAccess(getRequest().headers.get("cookie")))) return { kind: "public" };
    const { customerContour } = await import("@/server/customer-data");
    return customerContour();
  },
);
