import { serverEnv } from "@/lib/runtime-env";
import type { SpeechPort } from "@/ports";
import { createDemoSpeech } from "./demo";
import { createOpenAiSpeech } from "./openai";
import { createYandexSpeech } from "./yandex";

export { createDemoSpeech, DEFAULT_DEMO_SCENARIO } from "./demo";
export { createYandexSpeech, SpeechNotConnectedError } from "./yandex";
export { createOpenAiSpeech } from "./openai";

/**
 * Выбор распознавателя (ADR-040, п. 2). Чистая функция от окружения: так выбор проверяется
 * тестом, а не догадкой. Без ключа — демо, даже если провайдер назван: обещать распознавание,
 * которого нет, нельзя (правило 4).
 */
export type SpeechChoice =
  | { kind: "demo"; reason: string }
  | { kind: "openai"; provider: string; baseUrl: string; apiKey: string; model: string }
  | { kind: "yandex"; model: string };

const BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

export function pickSpeech(env: (name: string) => string | undefined): SpeechChoice {
  const mode = env("AI_MODE") ?? "demo";
  if (mode !== "live") return { kind: "demo", reason: "AI_MODE не live: расшифровки показа" };
  const provider = env("STT_PROVIDER") ?? "demo";
  if (provider === "demo") return { kind: "demo", reason: "STT_PROVIDER не задан" };
  if (provider === "yandex") return { kind: "yandex", model: env("STT_MODEL") ?? "general" };
  const apiKey = env("STT_API_KEY");
  const model = env("STT_MODEL");
  const baseUrl = env("STT_BASE_URL") ?? BASE_URLS[provider];
  if (!apiKey || !model || !baseUrl) {
    return {
      kind: "demo",
      reason: `STT_PROVIDER=${provider}, но не задано: ${[
        !apiKey && "STT_API_KEY",
        !model && "STT_MODEL",
        !baseUrl && "STT_BASE_URL",
      ]
        .filter(Boolean)
        .join(", ")}`,
    };
  }
  return { kind: "openai", provider, baseUrl, apiKey, model };
}

/** Распознаватель по окружению сервера. На клиенте `serverEnv` пуст — там всегда демо */
export function createSpeech(env: (name: string) => string | undefined = serverEnv): SpeechPort {
  const choice = pickSpeech(env);
  switch (choice.kind) {
    case "demo":
      return createDemoSpeech();
    case "yandex":
      return createYandexSpeech(choice.model);
    case "openai": {
      const num = (name: string, fallback: number) => {
        const value = Number(env(name));
        return Number.isFinite(value) && value > 0 ? value : fallback;
      };
      return createOpenAiSpeech({
        provider: choice.provider,
        baseUrl: choice.baseUrl,
        apiKey: choice.apiKey,
        model: choice.model,
        timeoutMs: num("AI_TIMEOUT_MS", 30_000),
        maxAudioSec: num("AI_MAX_AUDIO_SEC", 180),
      });
    }
  }
}
