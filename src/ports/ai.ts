import { z } from "zod";
import {
  extractionResult,
  processingJobs,
  transcript,
  type ExtractionResult,
  type ProcessingJobRow,
  type Transcript,
} from "@/contracts";

/**
 * Шлюз моделей (GAIKA_AI_GATEWAY.md, ADR-035). Экраны не знают ни провайдера, ни ключа:
 * они просят разобрать сообщение и получают черновик со ссылками на фразы.
 *
 * Портов два, потому что провайдеры разные: DeepSeek речь не распознаёт, а стоимость речи
 * считается в секундах, а не в токенах.
 *
 * `draft` и `answer` из документа здесь не объявлены: у них пока нет потребителя. Черновик
 * формулировок нужен сценарию 1 (G5), а ответ ассистента уже живёт своим портом (ADR-006).
 * Порт растёт вместе с экраном, который его зовёт, иначе в коде появляется мёртвый метод.
 */

/* ---------- Контекст объекта ---------- */

/**
 * Что уходит в модель вместе с сообщением (ADR-035, п. 2). Модель выбирает из списков,
 * а не придумывает: вид работ, участок и человека она обязана взять отсюда.
 * Ни цен, ни договоров, ни контактов здесь нет.
 */
export const projectContext = z
  .object({
    projectId: z.string().min(1),
    projectName: z.string().min(1),
    /** Участки, захватки, секции: код и как их называют на площадке */
    zones: z.array(z.object({ code: z.string().min(1), name: z.string().min(1) })),
    workTypes: z.array(
      z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        /** Допустимые единицы: «пог. м», «м²», «шт» */
        units: z.array(z.string().min(1)).min(1),
        /** Как это называют вслух: «лоток», «кабельный лоток» */
        synonyms: z.array(z.string().min(1)),
      }),
    ),
    people: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })),
    crews: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })),
    /** Ожидаемые материалы: чтобы «нащельник» сопоставился с номенклатурой объекта */
    materials: z.array(z.object({ name: z.string().min(1), unit: z.string().min(1) })),
    /** Рабочая дата и пояс объекта: «завтра» и «до пятницы» считаются от них */
    workDate: z.string().date(),
    timezone: z.string().min(1),
  })
  .strict();

export type ProjectContext = z.infer<typeof projectContext>;

/* ---------- Вход ---------- */

export const extractInput = z
  .object({
    /** Текст сообщения или расшифровка голосового */
    message: z.string().min(1).max(4000),
    context: projectContext,
    /** Источник, к которому привязывается обработка */
    sourceId: z.string().min(1).nullable().default(null),
  })
  .strict();

export type ExtractInput = z.input<typeof extractInput>;

export const audioInput = z
  .object({
    /** Содержимое записи и её тип: шлюз не знает, откуда она взялась */
    bytes: z.instanceof(Uint8Array),
    mimeType: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
    projectId: z.string().min(1).nullable().default(null),
    sourceId: z.string().min(1).nullable().default(null),
  })
  .strict();

export type AudioInput = z.input<typeof audioInput>;

/* ---------- Выход ---------- */

/** Работа, которую шлюз записал в журнал: без неё результата не бывает */
export const gatewayJob = processingJobs.omit({ id: true, result: true });

export type GatewayJob = Omit<ProcessingJobRow, "id" | "result">;

/**
 * Результат обращения. Невалидный ответ модели не применяется: он приходит как `ok: false`
 * с причиной, и экран показывает «не удалось разобрать, уточните или заполните вручную».
 */
export type GatewayResult<T> =
  { ok: true; value: T; job: GatewayJob } | { ok: false; reason: string; job: GatewayJob };

export const extractionSchema = extractionResult;
export const transcriptSchema = transcript;

export interface ModelGateway {
  /** Речь в текст с интервалами */
  transcribe(input: AudioInput): Promise<GatewayResult<Transcript>>;
  /** Извлечение фактов по схеме с контекстом объекта */
  extract(input: ExtractInput): Promise<GatewayResult<ExtractionResult>>;
  /** Чем сейчас работает шлюз: показывается рядом с результатом */
  readonly describe: { provider: string; model: string; promptVersion: string; demo: boolean };
}

/* ---------- Журнал обработок ---------- */

export const recordJobInput = processingJobs.omit({ id: true });

export type RecordJobInput = Omit<ProcessingJobRow, "id">;

/** Журнал обращений к модели: пишется всегда, читается панелью источника и оценкой качества */
export interface ProcessingPort {
  record(input: RecordJobInput): Promise<ProcessingJobRow>;
  /** Обработки объекта, новые сверху; `null` — по всем объектам */
  list(projectId: string | null): Promise<ProcessingJobRow[]>;
}

export type { ExtractionResult, Transcript, ProcessingJobRow };
