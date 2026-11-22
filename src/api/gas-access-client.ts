/**
 * Экран приглашений (ADR-086): запросы к `/api/gas/access` из браузера. Только рабочий
 * контур: в демо доступа людей нет, экран блок не показывает.
 */
import { useCallback, useEffect, useState } from "react";
import type { AccessPerson } from "./gas-access";

export type { AccessPerson, AccessState } from "./gas-access";

export interface AccessList {
  people: AccessPerson[];
  roles: string[];
  brigades: string[];
}

export type AccessLoad =
  { kind: "loading" } | { kind: "ready"; data: AccessList } | { kind: "failed"; reason: string };

async function reasonOf(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { reason?: unknown } | null;
  return typeof body?.reason === "string" ? body.reason : `Сервер ответил ${response.status}`;
}

export function useGasAccess(enabled: boolean) {
  const [load, setLoad] = useState<AccessLoad>({ kind: "loading" });
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/gas/access", { cache: "no-store" });
      if (!response.ok) return setLoad({ kind: "failed", reason: await reasonOf(response) });
      setLoad({ kind: "ready", data: (await response.json()) as AccessList });
    } catch {
      setLoad({ kind: "failed", reason: "Сервер не ответил: нет связи" });
    }
  }, []);
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const act = useCallback(
    async (
      body: Record<string, string>,
    ): Promise<{ ok: true; link: string | null } | { ok: false; reason: string }> => {
      try {
        const response = await fetch("/api/gas/access", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) return { ok: false, reason: await reasonOf(response) };
        const data = (await response.json()) as { link?: string };
        await refresh();
        return { ok: true, link: data.link ?? null };
      } catch {
        return { ok: false, reason: "Сервер не ответил: нет связи" };
      }
    },
    [refresh],
  );

  return { load, act };
}
