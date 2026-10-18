import { z } from "zod";
import type { Transcript } from "@/contracts";
import type { GatewayResult } from "./ai";

/**
 * Порт речи (ADR-040, п. 2). Отдельно от шлюза разбора: распознаватель и модель разбора
 * выбираются независимо, и экран не знает ни того, ни другого.
 */
export const speechInput = z
  .object({
    /** Содержимое записи; null — записи не было (имитация в показе без микрофона) */
    bytes: z.instanceof(Uint8Array).nullable(),
    mimeType: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
    projectId: z.string().min(1).nullable().default(null),
    sourceId: z.string().min(1).nullable().default(null),
    /**
     * Сценарий показа. Читает его только демо-реализация: живой распознаватель слушает звук,
     * а не подсказку.
     */
    scenario: z.string().min(1).nullable().default(null),
  })
  .strict();

export type SpeechInput = z.input<typeof speechInput>;

export interface SpeechPort {
  /** Речь в текст с интервалами слов или фраз */
  transcribe(input: SpeechInput): Promise<GatewayResult<Transcript>>;
  /** Чем сейчас распознаётся речь: показывается рядом с расшифровкой (правило 4) */
  readonly describe: { provider: string; model: string; demo: boolean };
}
