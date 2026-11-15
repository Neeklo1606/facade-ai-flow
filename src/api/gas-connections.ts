/**
 * Подключения сервера для «Настроек» (ADR-072): один запрос за открытие экрана.
 * Пока ответа нет — null, экран пишет «проверяю», а не «не подключён».
 */
import { useEffect, useState } from "react";
import {
  connectionRows,
  type ConnectionRow,
  type ServerConnections,
} from "@/domain/gas-ops/connections";

export type { ConnectionRow } from "@/domain/gas-ops/connections";

export function useServerConnections(): ConnectionRow[] | null {
  const [rows, setRows] = useState<ConnectionRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/gas/connections", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ServerConnections>) : Promise.reject(new Error())))
      .then((c) => alive && setRows(connectionRows(c)))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, []);
  return rows;
}
