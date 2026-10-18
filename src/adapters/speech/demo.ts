import type { Transcript } from "@/contracts";
import type { GatewayJob, GatewayResult, SpeechInput, SpeechPort } from "@/ports";
import { DEMO_EXAMPLES } from "@/ai/samples/demo-examples";
import { wordTimings } from "@/domain/transcript";

/**
 * Демо-распознаватель (ADR-040, п. 2): звук не слушает, отдаёт подготовленную расшифровку
 * выбранного сценария показа с интервалами слов. Без сценария — «Смена».
 *
 * Провайдер в журнале называется `demo`, и экран ставит рядом «Демо: расшифровка подготовлена
 * заранее»: имитация не выдаёт себя за распознавание.
 */
export const DEMO_SPEECH_PROVIDER = "demo";
export const DEMO_SPEECH_MODEL = "demo-transcripts";
export const DEFAULT_DEMO_SCENARIO = "demo-shift";

/** Темп речи для подготовленной расшифровки: около 2,5 слова в секунду */
const MS_PER_WORD = 400;

export function createDemoSpeech(): SpeechPort {
  return {
    describe: { provider: DEMO_SPEECH_PROVIDER, model: DEMO_SPEECH_MODEL, demo: true },
    transcribe(input: SpeechInput): Promise<GatewayResult<Transcript>> {
      const started = performance.now();
      const job = (status: GatewayJob["status"], refusal: string | null): GatewayJob => ({
        projectId: input.projectId ?? null,
        sourceId: input.sourceId ?? null,
        task: "transcribe",
        provider: DEMO_SPEECH_PROVIDER,
        model: DEMO_SPEECH_MODEL,
        promptVersion: "demo",
        status,
        startedAt: new Date().toISOString(),
        durationMs: Math.max(1, Math.round(performance.now() - started)),
        tokensIn: null,
        tokensOut: null,
        costKopecks: null,
        refusal,
      });
      const example = DEMO_EXAMPLES.find(
        (item) => item.id === (input.scenario ?? DEFAULT_DEMO_SCENARIO),
      );
      if (!example) {
        const reason = "Для этого сценария подготовленной расшифровки нет";
        return Promise.resolve({ ok: false, reason, job: job("failed", reason) });
      }
      const words = example.message.split(/\s+/u).filter(Boolean).length;
      const durationMs = words * MS_PER_WORD;
      return Promise.resolve({
        ok: true,
        value: {
          text: example.message,
          segments: wordTimings(example.message, durationMs),
          durationMs,
        },
        job: job("ok", null),
      });
    },
  };
}
