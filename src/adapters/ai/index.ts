import { serverEnv } from "@/lib/runtime-env";
import type { ModelGateway } from "@/ports";
import { createDemoGateway } from "./demo";
import { createOpenAiCompatibleGateway, type LlmConfig } from "./openai-compatible";

/**
 * Выбор шлюза переменными окружения (GAIKA_AI_GATEWAY.md, раздел 3). Экраны о провайдере
 * не знают: они зовут порт.
 *
 * Без ключа работает заглушка — это не ошибка, а состояние: демонстрация живёт без ключей
 * и говорит об этом вслух (ADR-035, п. 1).
 */

export { createDemoGateway, DEMO_PROVIDER, DEMO_MODEL, DEMO_RECORDINGS } from "./demo";
export { createOpenAiCompatibleGateway, type LlmConfig } from "./openai-compatible";
export { estimateCost, PRICES, type ModelPrice } from "./pricing";

/** Адреса провайдеров по умолчанию: ключ и модель всё равно из окружения */
const BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/v1",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const num = (name: string, fallback: number) => {
  const raw = serverEnv(name);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export interface GatewayChoice {
  gateway: ModelGateway;
  /** Почему выбран этот шлюз: пишется в журнал запуска, видно при разборе инцидента */
  reason: string;
}

/**
 * Шлюз по окружению. Вызывается только на сервере: `serverEnv` на клиенте пуст,
 * и там всегда получится заглушка — ключ в браузер не попадает по построению.
 */
export function createModelGateway(): GatewayChoice {
  const mode = serverEnv("AI_MODE") ?? "demo";
  if (mode === "demo") {
    return { gateway: createDemoGateway(), reason: "AI_MODE=demo: подготовленные разборы" };
  }
  const provider = serverEnv("LLM_PROVIDER") ?? "deepseek";
  const apiKey = serverEnv("LLM_API_KEY");
  const model = serverEnv("LLM_MODEL");
  const baseUrl = serverEnv("LLM_BASE_URL") ?? BASE_URLS[provider];
  if (!apiKey || !model || !baseUrl) {
    return {
      gateway: createDemoGateway(),
      reason: `AI_MODE=live, но не задано: ${[
        !apiKey && "LLM_API_KEY",
        !model && "LLM_MODEL",
        !baseUrl && "LLM_BASE_URL",
      ]
        .filter(Boolean)
        .join(", ")}`,
    };
  }
  const speechKey = serverEnv("STT_API_KEY");
  const speechModel = serverEnv("STT_MODEL");
  const speechProvider = serverEnv("STT_PROVIDER") ?? "openai";
  const config: LlmConfig = {
    provider,
    baseUrl,
    apiKey,
    model,
    cheapModel: serverEnv("LLM_MODEL_CHEAP"),
    timeoutMs: num("AI_TIMEOUT_MS", 30_000),
    maxAudioSec: num("AI_MAX_AUDIO_SEC", 180),
    ...(speechKey && speechModel
      ? {
          speech: {
            baseUrl: serverEnv("STT_BASE_URL") ?? BASE_URLS[speechProvider] ?? BASE_URLS["openai"]!,
            apiKey: speechKey,
            model: speechModel,
          },
        }
      : {}),
  };
  return {
    gateway: createOpenAiCompatibleGateway(config),
    reason: `AI_MODE=live: ${provider}/${model}${speechKey && speechModel ? `, речь ${speechProvider}/${speechModel}` : ", речь не настроена"}`,
  };
}
