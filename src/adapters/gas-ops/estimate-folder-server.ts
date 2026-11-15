/**
 * Папка смет рабочего контура (ADR-072): браузер спрашивает сервер, токен Диска остаётся там.
 */
import type { EstimateFolderPort, FolderListing } from "@/ports/estimate-folder";

const URL_BASE = "/api/gas/estimate-folder";

async function reasonOf(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { reason?: unknown } | null;
  return typeof body?.reason === "string" ? body.reason : `Сервер ответил ${response.status}`;
}

export const estimateFolderServer: EstimateFolderPort = {
  async list() {
    try {
      const response = await fetch(URL_BASE, { credentials: "same-origin" });
      if (!response.ok) {
        const reason = await reasonOf(response);
        return { ok: false, status: { connected: false, demo: false, reason }, reason };
      }
      return (await response.json()) as FolderListing;
    } catch {
      const reason = "Сервер не ответил: нет связи";
      return { ok: false, status: { connected: false, demo: false, reason }, reason };
    }
  },
  async download(path) {
    try {
      const response = await fetch(`${URL_BASE}?path=${encodeURIComponent(path)}`, {
        credentials: "same-origin",
      });
      if (!response.ok) return { ok: false, reason: await reasonOf(response) };
      return { ok: true, data: await response.arrayBuffer() };
    } catch {
      return { ok: false, reason: "Сервер не ответил: нет связи" };
    }
  },
};
