import { z } from "zod";
import { sourceKind } from "@/contracts";

/**
 * Ассистент системы (ADR-006). Отвечает на вопросы по данным единой модели: ответ собирается
 * из других портов и всегда ссылается на первоисточник. Языковой модели пока нет.
 */

/** Что ассистент умеет сейчас: четыре сценария быстрых действий */
export const agentIntent = z.enum([
  "project_summary",
  "deliveries",
  "documents_search",
  "decisions",
]);

export const askAgentInput = z.object({
  prompt: z.string().trim().min(1).max(2000),
  /** Объект из селектора; null — ассистент выберет объект из вопроса или самый требующий внимания */
  projectId: z.string().min(1).max(200).nullable().default(null),
  /** Быстрое действие передаёт сценарий явно; вопрос от руки распознаётся по словам */
  intent: agentIntent.optional(),
});

export const agentSource = z.object({
  sourceId: z.string().min(1),
  kind: sourceKind.schema,
  title: z.string().min(1),
  location: z.string(),
});

export const agentReply = z.object({
  intent: agentIntent,
  projectId: z.string().min(1).nullable(),
  projectName: z.string().min(1),
  /** Объект не выбран и не назван: по какому объекту ответ и как выбрать другой */
  scopeNote: z.string().min(1).nullable(),
  /** Абзацы ответа */
  text: z.array(z.string().min(1)).min(1),
  /** Показатели ответа: подпись и значение */
  facts: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })),
  /** Ответ без источника не существует: схема не пропустит его ни с сервера, ни из демо */
  sources: z.array(agentSource).min(1),
});

export type AgentIntent = z.infer<typeof agentIntent>;
export type AskAgentInput = z.input<typeof askAgentInput>;
export type AgentSource = z.infer<typeof agentSource>;
export type AgentReply = z.infer<typeof agentReply>;

export interface AgentPort {
  /** null — вопрос не относится ни к одному сценарию или по нему нет первоисточника */
  ask(input: AskAgentInput): Promise<AgentReply | null>;
}
