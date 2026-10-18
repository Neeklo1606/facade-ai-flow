import type { SpeechPort } from "@/ports";
import { createOpenAiCompatibleGateway } from "@/adapters/ai/openai-compatible";

/**
 * Распознаватель OpenAI-совместимого API (`/audio/transcriptions`, ADR-040, п. 2). Запрос
 * и разбор ответа уже живут в адаптере шлюза: здесь только порт речи поверх него.
 */
export interface SpeechConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxAudioSec: number;
}

export function createOpenAiSpeech(config: SpeechConfig): SpeechPort {
  const gateway = createOpenAiCompatibleGateway({
    provider: config.provider,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    timeoutMs: config.timeoutMs,
    maxAudioSec: config.maxAudioSec,
    speech: { baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model },
  });
  return {
    describe: { provider: config.provider, model: config.model, demo: false },
    async transcribe(input) {
      if (!input.bytes) {
        return {
          ok: false,
          reason: "Записи нет: распознавать нечего",
          job: {
            projectId: input.projectId ?? null,
            sourceId: input.sourceId ?? null,
            task: "transcribe",
            provider: config.provider,
            model: config.model,
            promptVersion: "stt",
            status: "failed",
            startedAt: new Date().toISOString(),
            durationMs: 1,
            tokensIn: null,
            tokensOut: null,
            costKopecks: null,
            refusal: "Записи нет",
          },
        };
      }
      return gateway.transcribe({
        bytes: input.bytes,
        mimeType: input.mimeType,
        durationMs: input.durationMs,
        projectId: input.projectId ?? null,
        sourceId: input.sourceId ?? null,
      });
    },
  };
}
