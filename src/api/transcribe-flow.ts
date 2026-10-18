import type { Transcript } from "@/contracts";
import type { Repositories, SpeechPort } from "@/ports";

/**
 * Расшифровка записи (ADR-040, п. 2). Путь один в обоих контурах: на сервере его зовёт
 * серверная функция с распознавателем по окружению, в демонстрации — вкладка с демо-распознавателем.
 * Обращение пишется в журнал обработок и на отказ: это часть истории факта.
 */
export interface TranscribeOutcome {
  ok: boolean;
  transcript: Transcript | null;
  reason: string | null;
  by: { provider: string; model: string; demo: boolean };
}

export async function transcribeWith(
  repos: Repositories,
  speech: SpeechPort,
  data: {
    bytes: Uint8Array<ArrayBuffer> | null;
    mimeType: string;
    durationMs: number;
    projectId: string;
    sourceId: string | null;
    scenario: string | null;
  },
): Promise<TranscribeOutcome> {
  const by = { ...speech.describe };
  let answer;
  try {
    answer = await speech.transcribe(data);
  } catch (error) {
    // Неподключённый распознаватель — состояние, а не падение: экран покажет причину одной строкой
    return { ok: false, transcript: null, reason: (error as Error).message, by };
  }
  try {
    await repos.processing.record({
      ...answer.job,
      result: answer.ok ? { text: answer.value.text, words: answer.value.segments.length } : null,
    });
  } catch (error) {
    console.error("processing.record", error);
  }
  return answer.ok
    ? { ok: true, transcript: answer.value, reason: null, by }
    : { ok: false, transcript: null, reason: answer.reason, by };
}
