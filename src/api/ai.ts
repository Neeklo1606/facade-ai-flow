import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { extractionResult } from "@/contracts";
import { buildProjectContext } from "@/domain/ai-context";
import { createModelGateway } from "@/adapters/ai";
import { input, respond } from "./errors";
import { requestRepositories } from "./server-repositories";

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
    const [card, reports, materials, now] = await Promise.all([
      repos.projects.card(data.projectId),
      repos.reports.list(data.projectId),
      repos.positions.materials(),
      repos.clock.now(),
    ]);
    if (!card) throw new Error(`Не найдено: объект ${data.projectId}`);

    const context = buildProjectContext({
      projectId: card.project.id,
      projectName: card.project.name,
      workDate: now.slice(0, 10),
      zones: card.zones,
      crews: card.crews,
      team: card.team,
      reports: reports.map((card) => card.report),
      materials,
    });

    const { gateway } = createModelGateway();
    const answer = await gateway.extract({
      message: data.message,
      context,
      sourceId: data.sourceId,
    });
    const by = {
      provider: gateway.describe.provider,
      model: gateway.describe.model,
      demo: gateway.describe.demo,
    };

    /*
     * Журнал пишется и на отказ: обращение было, модель отвечала, и это часть истории факта.
     * Запись журнала не должна ронять разбор, поэтому ошибка записи только логируется.
     */
    try {
      await repos.processing.record({
        ...answer.job,
        result: answer.ok ? (answer.value as unknown as Record<string, unknown>) : null,
      });
    } catch (error) {
      console.error("processing.record", error);
    }

    return respond(
      extractFactResult,
      answer.ok
        ? { ok: true as const, draft: answer.value, by }
        : { ok: false as const, reason: answer.reason, by },
    );
  });
