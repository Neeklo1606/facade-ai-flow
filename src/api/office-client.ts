import { useQuery } from "@tanstack/react-query";
import { connectionStatus, type ConnectionStatus } from "@/contracts";
import { z } from "zod";
import { api } from "./client";
import { DEMO_PERSONAS, currentUserId, dataSource, hasChosenPersona } from "./config";

/**
 * Статус подключений с сервера (ADR-039): и в демонстрации, и в рабочем контуре он один —
 * конфигурация живёт на сервере. Отказ сервера приходит ошибкой «403».
 */
export function useConnections() {
  return useQuery<ConnectionStatus[], Error>({
    queryKey: ["office", "connections", currentUserId()],
    queryFn: async () => {
      /*
       * Демонстрация: сервер узнаёт роль вкладки по куке персоны. Кука выдаётся перед запросом,
       * иначе первый заход в кабинет после смены роли спорил бы с прежней кукой.
       */
      if (dataSource === "demo" && hasChosenPersona()) {
        await api.signIn(currentUserId() as (typeof DEMO_PERSONAS)[number]);
      }
      const response = await fetch("/api/office/connections", { credentials: "same-origin" });
      if (response.status === 403) throw new Error("403");
      if (!response.ok) throw new Error(`Сервер ответил ${response.status}`);
      return z.array(connectionStatus).parse(await response.json());
    },
    retry: false,
  });
}
