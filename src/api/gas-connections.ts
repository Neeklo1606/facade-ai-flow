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
import type { MaxCheckAction, MaxCheckAnswer } from "./gas-max-check";

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

/** Строка результата проверки MAX для экрана */
export interface MaxCheckView {
  name: string;
  ok: boolean;
  text: string;
}

/**
 * Проверка канала MAX (ADR-087): «check» — токен и вебхук, «test» — сообщение себе.
 * Ответ сразу строками для экрана; ошибка сервера тоже строка, а не тишина
 */
export async function runMaxCheck(action: MaxCheckAction): Promise<MaxCheckView[]> {
  try {
    const response = await fetch("/api/gas/max-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as
      MaxCheckAnswer | { reason?: string } | null;
    if (!response.ok || !body || !("configured" in body)) {
      const reason = body && "reason" in body && body.reason ? body.reason : null;
      return [{ name: "Проверка", ok: false, text: reason ?? `Сервер ответил ${response.status}` }];
    }
    if (!body.configured) return [{ name: "MAX", ok: false, text: body.text }];
    if (body.action === "check") return body.lines;
    return [{ name: "Тестовое сообщение", ok: body.ok, text: body.text }];
  } catch {
    return [{ name: "Проверка", ok: false, text: "Сервер не ответил" }];
  }
}
