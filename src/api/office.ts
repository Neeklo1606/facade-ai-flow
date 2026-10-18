import { createConnections } from "@/adapters/channels";
import { can } from "@/domain/access";
import { serverEnv } from "@/lib/runtime-env";
import { authAvailable } from "./auth-store";
import { requestSession } from "./server-repositories";

/**
 * Подключения кабинета (ADR-039): статус из конфигурации сервера, право — на сервере.
 * Прораб, открывший адрес, получает 403 от сервера, а не пустой экран (ADR-012).
 */
export async function connectionsResponse() {
  const session = await requestSession();
  if (!session || !can(session.role, "office")) {
    return new Response("Кабинет компании открыт руководителю и директору", {
      status: 403,
      headers: { "cache-control": "no-store" },
    });
  }
  const statuses = await createConnections(serverEnv, { phoneLogin: authAvailable() }).status();
  return Response.json(statuses, { headers: { "cache-control": "no-store" } });
}
