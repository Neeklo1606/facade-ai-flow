import type { ExtractionResult, Transcript } from "@/contracts";
import {
  extractInput,
  type AudioInput,
  type ExtractInput,
  type GatewayJob,
  type GatewayResult,
  type ModelGateway,
} from "@/ports";
import { EXTRACT_PROMPT_VERSION } from "@/ai/prompts/extract";
import { SAMPLE_MESSAGES } from "@/ai/samples/messages";

/**
 * Заглушка шлюза для `AI_MODE=demo` (ADR-035, п. 1): модель не вызывается, ключи не нужны.
 * На сообщения набора возвращается подготовленный разбор, на всё остальное — честный отказ.
 *
 * Провайдер в журнале называется `demo`: показ не выдаёт имитацию за работу живой модели
 * (правило 4). Рядом с результатом экран ставит пометку «Демо: результат подготовлен заранее».
 */

export const DEMO_PROVIDER = "demo";
export const DEMO_MODEL = "demo-scenarios";

/** Три голосовых примера показа: расшифровки берутся из набора, аудио появится в G8 */
export const DEMO_RECORDINGS: Record<string, string> = {
  "demo-voice-shift": "clean-tray",
  "demo-voice-task": "clean-task",
  "demo-voice-risk": "clean-risk",
};

/** Сообщения сравниваются по смыслу написанного, а не по пробелам и запятым */
export const normalizeMessage = (text: string) =>
  text
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const byMessage = new Map(
  SAMPLE_MESSAGES.map((sample) => [normalizeMessage(sample.message), sample]),
);
const byId = new Map(SAMPLE_MESSAGES.map((sample) => [sample.id, sample]));

export function createDemoGateway(): ModelGateway {
  const job = (
    task: GatewayJob["task"],
    started: number,
    startedAt: string,
    scope: { projectId: string | null; sourceId: string | null },
    status: GatewayJob["status"],
    refusal: string | null,
  ): GatewayJob => ({
    projectId: scope.projectId,
    sourceId: scope.sourceId,
    task,
    provider: DEMO_PROVIDER,
    model: DEMO_MODEL,
    promptVersion: EXTRACT_PROMPT_VERSION,
    status,
    startedAt,
    durationMs: Math.max(1, Math.round(performance.now() - started)),
    tokensIn: null,
    tokensOut: null,
    /* Имитация ничего не стоит, и выдумывать ей цену нельзя: в журнале null */
    costKopecks: null,
    refusal,
  });

  return {
    describe: {
      provider: DEMO_PROVIDER,
      model: DEMO_MODEL,
      promptVersion: EXTRACT_PROMPT_VERSION,
      demo: true,
    },

    extract(raw: ExtractInput): Promise<GatewayResult<ExtractionResult>> {
      const input = extractInput.parse(raw);
      const started = performance.now();
      const startedAt = new Date().toISOString();
      const scope = { projectId: input.context.projectId, sourceId: input.sourceId };
      const sample = byMessage.get(normalizeMessage(input.message));
      if (!sample) {
        const reason =
          "В демонстрации разбираются подготовленные сообщения: живой разбор включается ключом модели";
        return Promise.resolve({
          ok: false,
          reason,
          job: job("extract", started, startedAt, scope, "failed", reason),
        });
      }
      return Promise.resolve({
        ok: true,
        value: sample.expected,
        job: job("extract", started, startedAt, scope, "ok", null),
      });
    },

    transcribe(input: AudioInput): Promise<GatewayResult<Transcript>> {
      const started = performance.now();
      const startedAt = new Date().toISOString();
      const scope = { projectId: input.projectId ?? null, sourceId: input.sourceId ?? null };
      const sampleId = input.sourceId ? DEMO_RECORDINGS[input.sourceId] : undefined;
      const sample = sampleId ? byId.get(sampleId) : undefined;
      if (!sample) {
        const reason = "В демонстрации речь не распознаётся: это подготовленные примеры показа";
        return Promise.resolve({
          ok: false,
          reason,
          job: job("transcribe", started, startedAt, scope, "failed", reason),
        });
      }
      return Promise.resolve({
        ok: true,
        value: {
          text: sample.message,
          segments: [{ text: sample.message, startMs: 0, endMs: input.durationMs }],
          durationMs: input.durationMs,
        },
        job: job("transcribe", started, startedAt, scope, "ok", null),
      });
    },
  };
}
