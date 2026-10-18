import { z } from "zod";
import { col, pgEnum, table } from "./db";

/**
 * Шлюз моделей (GAIKA_AI_GATEWAY.md, ADR-035): схема разбора и журнал обработок.
 *
 * Схема здесь главная: ответ модели, который ей не соответствует, не применяется вовсе.
 * Поэтому у каждого значения три обязательных спутника — на чём оно основано, нужна ли
 * проверка человеком и из какой фразы оно взято.
 */

/* ---------- Происхождение значения ---------- */

export const provenance = z.object({
  /** Точная фраза из расшифровки или текста сообщения */
  quote: z.string().min(1),
  /** Интервал в аудио, если источник — голос */
  audioStartMs: z.number().int().nonnegative().optional(),
  audioEndMs: z.number().int().nonnegative().optional(),
  /** Фото или файл, если значение взято оттуда */
  mediaId: z.string().min(1).optional(),
});

/** На чём стоит значение: сказано прямо, следует из контекста объекта или неизвестно */
export const fieldBasis = z.enum(["stated", "inferred_from_context", "unknown"]);

/**
 * Значение с основанием. `value: null` — неизвестно, и это нормальный ответ: правило 3
 * запрещает подставлять ноль или правдоподобную догадку. `attention` — причина янтарной
 * точки словами; без причины точка не ставится.
 */
export const aiField = <T extends z.ZodTypeAny>(value: T) =>
  z
    .object({
      value: value.nullable(),
      basis: fieldBasis,
      attention: z.string().min(1).nullable(),
      provenance: provenance.nullable(),
    })
    .strict()
    /*
     * Неизвестное не притворяется известным и наоборот: «сказано» без значения и значение
     * с основанием «неизвестно» — это невалидный ответ, а не черновик с дыркой.
     */
    .refine((field) => (field.basis === "unknown") === (field.value === null), {
      message: "basis «unknown» означает value null, и наоборот",
    })
    /* Значение, сказанное вслух, обязано иметь фразу-источник: правило 2 */
    .refine((field) => field.basis !== "stated" || field.provenance !== null, {
      message: "У значения со словами «сказано» должна быть фраза-источник",
    });

export const workRecordDraft = z.object({
  zone: aiField(z.string().min(1)),
  workTypeCode: aiField(z.string().min(1)),
  quantity: aiField(z.number().nonnegative()),
  unit: aiField(z.string().min(1)),
  people: aiField(z.number().int().nonnegative()),
  hours: aiField(z.number().nonnegative()),
});

export const taskEvidence = z.enum(["photo_before", "photo_after"]);

export const taskDraft = z.object({
  location: aiField(z.string().min(1)),
  defect: aiField(z.string().min(1)),
  assignee: aiField(z.string().min(1)),
  dueDate: aiField(z.string().date()),
  evidenceRequired: aiField(z.array(taskEvidence)),
});

/** Пять видов карточки сценария 3 (продукт, раздел 4) */
export const riskKind = z.enum([
  "material_shortage",
  "delivery_delay",
  "doc_mismatch",
  "downtime",
  "client_question",
]);

export const riskImpact = z.enum(["schedule", "cost", "quality", "safety"]);

export const riskDraft = z.object({
  kind: aiField(riskKind),
  what: aiField(z.string().min(1)),
  impact: aiField(riskImpact),
  decisionNeeded: aiField(z.string().min(1)),
  owner: aiField(z.string().min(1)),
  answerBy: aiField(z.string().date()),
});

export const extractionResult = z
  .object({
    workRecords: z.array(workRecordDraft),
    tasks: z.array(taskDraft),
    risks: z.array(riskDraft),
    plannedTomorrow: z.array(z.string().min(1)),
    /** Не больше трёх вопросов и только блокирующие: человек на площадке в перчатках */
    clarifications: z.array(z.string().min(1)).max(3),
  })
  .strict();

/** Расшифровка речи: текст и отрезки с интервалами */
export const transcript = z
  .object({
    text: z.string(),
    segments: z.array(
      z.object({
        text: z.string().min(1),
        startMs: z.number().int().nonnegative(),
        endMs: z.number().int().nonnegative(),
      }),
    ),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

/* ---------- Журнал обработок ---------- */

export const aiTask = pgEnum(
  "ai_task",
  ["transcribe", "extract", "draft", "answer"],
  "Что шлюз делал в этом обращении",
);

export const aiJobStatus = pgEnum(
  "ai_job_status",
  ["ok", "invalid", "failed"],
  "Чем кончилось обращение: разобрано, ответ не прошёл схему, вызов не удался",
);

export const processingJobs = table(
  {
    name: "processing_jobs",
    comment: "Журнал обращений к модели: провайдер, модель, версия промпта, длительность, токены",
    primaryKey: ["id"],
    appendOnly: true,
    indexes: [
      { columns: ["projectId", "startedAt desc"], purpose: "журнал обработок объекта" },
      { columns: ["sourceId"], purpose: "обработки одного источника в панели «Источник»" },
    ],
    checks: [
      "duration_ms >= 0",
      // Результат есть ровно у успешной обработки: отказ не притворяется разбором
      "(status = 'ok') = (result is not null)",
      // Отказ обязан назвать причину, успех — не обязан
      "(status = 'ok') or (refusal is not null)",
    ],
  },
  {
    id: col.id(),
    projectId: col.ref("projects", "restrict", {
      nullable: true,
      comment: "объект, в контексте которого шёл разбор",
    }),
    sourceId: col.ref("sources", "cascade", { nullable: true }),
    task: col.enum(aiTask),
    provider: col.name({ comment: "deepseek, openai, openrouter, demo" }),
    model: col.name(),
    promptVersion: col.name({ comment: "версия системного промпта: сравнение прогонов оценки" }),
    status: col.enum(aiJobStatus),
    startedAt: col.timestamp(),
    durationMs: col.int(),
    tokensIn: col.int({ nullable: true }),
    tokensOut: col.int({ nullable: true }),
    costKopecks: col.money({
      nullable: true,
      comment: "оценка по прайсу провайдера; null — цены модели нет",
    }),
    refusal: col.text({ nullable: true, comment: "почему ответ не применён" }),
    /*
     * Содержимое запроса здесь не хранится: в журнал идёт результат разбора, а не текст
     * сообщения и тем более не аудио (ADR-035, п. 2).
     */
    result: col.jsonb(z.record(z.string(), z.unknown()), { nullable: true }),
  },
);

export type Provenance = z.infer<typeof provenance>;
export type FieldBasis = z.infer<typeof fieldBasis>;
export type WorkRecordDraft = z.infer<typeof workRecordDraft>;
export type TaskDraft = z.infer<typeof taskDraft>;
export type RiskDraft = z.infer<typeof riskDraft>;
export type RiskKind = z.infer<typeof riskKind>;
export type ExtractionResult = z.infer<typeof extractionResult>;
export type Transcript = z.infer<typeof transcript>;
export type ProcessingJobRow = z.infer<typeof processingJobs>;
export type AiTask = z.infer<typeof aiTask.schema>;
export type AiJobStatus = z.infer<typeof aiJobStatus.schema>;

/* ---------- Словари ---------- */

export const aiTaskLabel: Record<AiTask, string> = {
  transcribe: "Распознавание речи",
  extract: "Извлечение фактов",
  draft: "Черновик формулировки",
  answer: "Ответ ассистента",
};

export const riskKindLabel: Record<RiskKind, string> = {
  material_shortage: "Нехватка материала",
  delivery_delay: "Задержка поставки",
  doc_mismatch: "Несоответствие документации",
  downtime: "Простой",
  client_question: "Вопрос к заказчику",
};
