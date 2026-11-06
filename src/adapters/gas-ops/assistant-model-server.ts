/**
 * Модель агента через сервер (ADR-066): браузер шлёт вопрос и данные недели роли на
 * `/api/gas/assistant`, ключ модели живёт только там. Сервер без ключа отвечает
 * «не подключён», и экран остаётся на правилах.
 */
import type { GasAssistantModel } from "@/ports/gas-assistant";

const URL_ = "/api/gas/assistant";
let cached: Promise<{ available: boolean; model: string | null }> | null = null;

export const assistantModelServer: GasAssistantModel = {
  status: () => {
    cached ??= fetch(URL_, { headers: { accept: "application/json" } })
      .then(async (r) =>
        r.ok ? ((await r.json()) as { available: boolean; model: string | null }) : null,
      )
      .then((v) => v ?? { available: false, model: null })
      .catch(() => ({ available: false, model: null }));
    return cached;
  },
  ask: async (input) => {
    const response = await fetch(URL_, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => ({}))) as {
      text?: string;
      model?: string;
      error?: string;
    };
    if (!response.ok || !body.text) throw new Error(body.error ?? "Агент не ответил, повторите");
    return { text: body.text, model: body.model ?? "" };
  },
};
