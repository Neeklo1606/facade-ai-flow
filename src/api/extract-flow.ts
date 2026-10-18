import type { ExtractionResult } from "@/contracts";
import { buildProjectContext } from "@/domain/ai-context";
import type { ModelGateway, Repositories } from "@/ports";

/**
 * Разбор сообщения: один и тот же путь в обоих контурах (ADR-035). На сервере его зовёт
 * серверная функция, в демонстрации — адаптер во вкладке с заглушкой шлюза.
 *
 * Два контура не должны расходиться в поведении, поэтому сборка контекста, вызов шлюза
 * и запись журнала живут здесь, а не в двух местах.
 */
export interface ExtractOutcome {
  ok: boolean;
  draft: ExtractionResult | null;
  reason: string | null;
  by: { provider: string; model: string; demo: boolean };
}

export async function extractWithGateway(
  repos: Repositories,
  gateway: ModelGateway,
  input: { projectId: string; message: string; sourceId: string | null },
): Promise<ExtractOutcome> {
  const [card, reports, materials, now] = await Promise.all([
    repos.projects.card(input.projectId),
    repos.reports.list(input.projectId),
    repos.positions.materials(),
    repos.clock.now(),
  ]);
  if (!card) throw new Error(`Не найдено: объект ${input.projectId}`);

  const context = buildProjectContext({
    projectId: card.project.id,
    projectName: card.project.name,
    workDate: now.slice(0, 10),
    zones: card.zones,
    crews: card.crews,
    team: card.team,
    reports: reports.map((item) => item.report),
    materials,
  });

  const answer = await gateway.extract({
    message: input.message,
    context,
    sourceId: input.sourceId,
  });
  const by = {
    provider: gateway.describe.provider,
    model: gateway.describe.model,
    demo: gateway.describe.demo,
  };

  /*
   * Журнал пишется и на отказ: обращение было, модель отвечала, и это часть истории факта.
   * Ошибка записи журнала не должна ронять разбор — она только логируется.
   */
  try {
    await repos.processing.record({
      ...answer.job,
      result: answer.ok ? (answer.value as unknown as Record<string, unknown>) : null,
    });
  } catch (error) {
    console.error("processing.record", error);
  }

  return answer.ok
    ? { ok: true, draft: answer.value, reason: null, by }
    : { ok: false, draft: null, reason: answer.reason, by };
}
