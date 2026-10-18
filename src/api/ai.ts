import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { extractionResult, sources, evidence as evidenceRow } from "@/contracts";
import { createModelGateway } from "@/adapters/ai";
import { captureInput } from "@/ports";
import { extractWithGateway } from "./extract-flow";
import { input, respond } from "./errors";
import { requestRepositories, serverActor } from "./server-repositories";

/**
 * Разбор сообщения моделью (GAIKA_AI_GATEWAY.md; ADR-035). Вызов живёт только на сервере:
 * ключ читается из переменных окружения и в браузер не попадает по построению.
 *
 * Что здесь происходит по шагам: собираем контекст объекта из портов, зовём шлюз, записываем
 * обращение в журнал и отдаём экрану черновик. Ответ, не прошедший схему, черновиком
 * не становится — экран получает отказ с причиной.
 *
 * Применение черновика к записям — шаг G5: здесь он только получен и показан человеку.
 */

const extractFactInput = z.object({
  projectId: z.string().min(1),
  message: z.string().trim().min(1).max(4000),
  /** Источник, если сообщение уже сохранено: журнал привяжется к нему */
  sourceId: z.string().min(1).nullable().default(null),
});

const extractFactResult = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    draft: extractionResult,
    /** Чем разобрано: показывается рядом с результатом (правило 4) */
    by: z.object({ provider: z.string(), model: z.string(), demo: z.boolean() }),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string(),
    by: z.object({ provider: z.string(), model: z.string(), demo: z.boolean() }),
  }),
]);

export const extractFactFn = createServerFn({ method: "POST" })
  .validator(input(extractFactInput))
  .handler(async ({ data }) => {
    const repos = requestRepositories();
    const { gateway } = createModelGateway();
    const outcome = await extractWithGateway(repos, gateway, data);
    return respond(
      extractFactResult,
      outcome.ok && outcome.draft
        ? { ok: true as const, draft: outcome.draft, by: outcome.by }
        : { ok: false as const, reason: outcome.reason ?? "Разбор не получен", by: outcome.by },
    );
  });

/* ---------- Запись факта ---------- */

const captureFactResult = z.object({
  source: sources,
  evidence: z.array(evidenceRow),
  /** Отправка с этим ключом уже проходила: дубля нет (ADR-036, п. 4) */
  repeated: z.boolean(),
});

/**
 * Записать факт с площадки (ADR-036). Источник и метки материалов сохраняются всегда — даже
 * когда речь не распознаётся: факт важнее разбора, и терять его из-за отсутствия ключа нельзя.
 *
 * Разбор делается отдельным вызовом `extractFactFn`: он может не получиться, и это не повод
 * потерять запись.
 */
export const captureFactFn = createServerFn({ method: "POST" })
  .validator(input(captureInput))
  .handler(async ({ data }) => {
    const repos = requestRepositories();
    const result = await repos.reports.capture(data, serverActor());
    return respond(captureFactResult, result);
  });
