/**
 * Агент учёта времени на сервере (ADR-066): свободный вопрос уходит в модель Claude вместе
 * с данными недели, которые роль видит на экранах. Ключ только в окружении сервера
 * (`ANTHROPIC_API_KEY`), модель `ASSISTANT_MODEL` (по умолчанию claude-opus-5-5). Без ключа
 * агент «не подключён»: экран отвечает правилами и говорит это рядом с ответом.
 *
 * Защита публичного адреса: вопрос до 1 000 знаков, данные до 40 000, история до 10 реплик,
 * не больше 20 вопросов в минуту с одного адреса. Модель только отвечает текстом.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ASSISTANT_SYSTEM } from "@/domain/gas-ops/assistant-context";
import { serverEnv } from "@/lib/runtime-env";

export const DEFAULT_ASSISTANT_MODEL = "claude-opus-5-5";
const MAX_QUESTION = 1000;
const MAX_CONTEXT = 40_000;
const MAX_HISTORY = 10;
const PER_MINUTE = 20;

export interface AssistantTurn {
  question: string;
  answer: string;
}

export function assistantConfigured(): { available: boolean; model: string | null } {
  const key = serverEnv("ANTHROPIC_API_KEY");
  return key
    ? { available: true, model: serverEnv("ASSISTANT_MODEL") ?? DEFAULT_ASSISTANT_MODEL }
    : { available: false, model: null };
}

const hits = new Map<string, number[]>();

/** Не больше PER_MINUTE вопросов в минуту с одного адреса: публичная ссылка показа */
export function allowRequest(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= PER_MINUTE) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

/** Проверка тела запроса: что пришло от браузера, то и ограничиваем */
export function parseAssistantBody(
  body: unknown,
):
  | { ok: true; question: string; context: string; history: AssistantTurn[] }
  | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "Пустой запрос" };
  const b = body as Record<string, unknown>;
  const question = typeof b["question"] === "string" ? b["question"].trim() : "";
  const context = typeof b["context"] === "string" ? b["context"] : "";
  if (!question) return { ok: false, reason: "Нет вопроса" };
  if (question.length > MAX_QUESTION) return { ok: false, reason: "Вопрос длиннее 1 000 знаков" };
  if (context.length > MAX_CONTEXT) return { ok: false, reason: "Данных недели слишком много" };
  const raw = Array.isArray(b["history"]) ? b["history"] : [];
  const history = raw
    .filter(
      (t): t is AssistantTurn =>
        !!t &&
        typeof (t as AssistantTurn).question === "string" &&
        typeof (t as AssistantTurn).answer === "string",
    )
    .slice(-MAX_HISTORY)
    .map((t) => ({
      question: t.question.slice(0, MAX_QUESTION),
      answer: t.answer.slice(0, 4000),
    }));
  return { ok: true, question, context, history };
}

export async function askClaude(input: {
  question: string;
  context: string;
  history: AssistantTurn[];
}): Promise<{ text: string; model: string }> {
  const config = assistantConfigured();
  if (!config.available || !config.model) throw new Error("Агент не подключён");
  const client = new Anthropic({ apiKey: serverEnv("ANTHROPIC_API_KEY"), timeout: 60_000 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...input.history.flatMap((t): Anthropic.Beta.BetaMessageParam[] => [
      { role: "user", content: t.question },
      { role: "assistant", content: t.answer },
    ]),
    { role: "user", content: input.question },
  ];
  // Отказ модели по правилам безопасности: тот же запрос уходит резервной модели (fallbacks)
  const response = await client.beta.messages.create({
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    model: config.model,
    max_tokens: 4000,
    // Данные недели в системной части: стабильный префикс, кэш между вопросами одного чата
    system: [
      { type: "text", text: ASSISTANT_SYSTEM },
      {
        type: "text",
        text: `<data>\n${input.context}\n</data>`,
        cache_control: { type: "ephemeral" },
      },
    ],
    // Короткие ответы по данным: низкое усилие достаточно и быстрее
    output_config: { effort: "low" },
    messages,
  });
  if (response.stop_reason === "refusal") {
    return {
      text: "На этот вопрос агент не отвечает. Спросите о данных недели.",
      model: config.model,
    };
  }
  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return { text: text || "Ответа нет. Повторите вопрос.", model: config.model };
}
