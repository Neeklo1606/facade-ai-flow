import {
  extractInput,
  transcriptSchema,
  type AudioInput,
  type ExtractInput,
  type GatewayJob,
  type GatewayResult,
  type ModelGateway,
} from "@/ports";
import { extractionResult, type ExtractionResult, type Transcript } from "@/contracts";
import { buildExtractMessages, EXTRACT_PROMPT_VERSION } from "@/ai/prompts/extract";
import { estimateCost } from "./pricing";

/**
 * Адаптер провайдеров с совместимым chat API: DeepSeek, OpenAI, OpenRouter (ADR-035, п. 1).
 * Различие между ними — адрес, ключ и имя модели, а не протокол. Появится провайдер
 * с другим форматом авторизации или тела запроса — у него будет свой адаптер.
 *
 * Работает только на сервере: ключ читается из переменных окружения и на клиент не попадает.
 */

export interface LlmConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Дешёвая модель для классификации и коротких задач; нет — берётся основная */
  cheapModel?: string | undefined;
  timeoutMs: number;
  /** Провайдер распознавания речи и его модель: речь отделена от текста */
  speech?: { baseUrl: string; apiKey: string; model: string } | undefined;
  maxAudioSec: number;
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: ChatUsage;
}

const now = () => new Date().toISOString();

export function createOpenAiCompatibleGateway(config: LlmConfig): ModelGateway {
  /** Общая часть записи журнала: провайдер, модель, версия промпта, время */
  const jobOf = (
    task: GatewayJob["task"],
    started: number,
    startedAt: string,
    input: { projectId: string | null; sourceId: string | null },
    status: GatewayJob["status"],
    tokens: { in: number | null; out: number | null },
    refusal: string | null,
    model = config.model,
  ): GatewayJob => ({
    projectId: input.projectId,
    sourceId: input.sourceId,
    task,
    provider: config.provider,
    model,
    promptVersion: EXTRACT_PROMPT_VERSION,
    status,
    startedAt,
    durationMs: Math.round(performance.now() - started),
    tokensIn: tokens.in,
    tokensOut: tokens.out,
    costKopecks: estimateCost(config.provider, model, tokens.in, tokens.out),
    refusal,
  });

  async function post(path: string, body: unknown, signal: AbortSignal) {
    const response = await fetch(`${config.baseUrl.replace(/\/$/u, "")}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 200)}`);
    }
    return (await response.json()) as ChatResponse;
  }

  return {
    describe: {
      provider: config.provider,
      model: config.model,
      promptVersion: EXTRACT_PROMPT_VERSION,
      demo: false,
    },

    async extract(raw: ExtractInput): Promise<GatewayResult<ExtractionResult>> {
      const input = extractInput.parse(raw);
      const started = performance.now();
      const startedAt = now();
      const scope = { projectId: input.context.projectId, sourceId: input.sourceId };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const data = await post(
          "/chat/completions",
          {
            model: config.model,
            messages: buildExtractMessages(input.context, input.message),
            response_format: { type: "json_object" },
            temperature: 0,
          },
          controller.signal,
        );
        const tokens = {
          in: data.usage?.prompt_tokens ?? null,
          out: data.usage?.completion_tokens ?? null,
        };
        const content = data.choices?.[0]?.message?.content ?? "";
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          return {
            ok: false,
            reason: "Ответ модели не разобрался как JSON",
            job: jobOf("extract", started, startedAt, scope, "invalid", tokens, "ответ не JSON"),
          };
        }
        /*
         * Схема — последняя граница перед черновиком: невалидный ответ не применяется вовсе
         * (GAIKA_AI_GATEWAY.md, раздел 7). Человек увидит «не удалось разобрать».
         */
        const checked = extractionResult.safeParse(parsed);
        if (!checked.success) {
          const reason = checked.error.issues
            .slice(0, 3)
            .map((issue) => `${issue.path.join(".") || "ответ"}: ${issue.message}`)
            .join("; ");
          return {
            ok: false,
            reason: `Ответ модели не прошёл схему. ${reason}`,
            job: jobOf("extract", started, startedAt, scope, "invalid", tokens, reason),
          };
        }
        return {
          ok: true,
          value: checked.data,
          job: jobOf("extract", started, startedAt, scope, "ok", tokens, null),
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          reason: `Модель не ответила. ${reason}`,
          job: jobOf(
            "extract",
            started,
            startedAt,
            scope,
            "failed",
            { in: null, out: null },
            reason.slice(0, 200),
          ),
        };
      } finally {
        clearTimeout(timer);
      }
    },

    async transcribe(input: AudioInput): Promise<GatewayResult<Transcript>> {
      const started = performance.now();
      const startedAt = now();
      const scope = { projectId: input.projectId ?? null, sourceId: input.sourceId ?? null };
      const speech = config.speech;
      const model = speech?.model ?? "stt";
      if (!speech) {
        const reason = "Распознавание речи не настроено: нет STT_PROVIDER и ключа";
        return {
          ok: false,
          reason,
          job: jobOf(
            "transcribe",
            started,
            startedAt,
            scope,
            "failed",
            { in: null, out: null },
            reason,
            model,
          ),
        };
      }
      if (input.durationMs > config.maxAudioSec * 1000) {
        const reason = `Запись длиннее ${config.maxAudioSec} с: разбейте её на части`;
        return {
          ok: false,
          reason,
          job: jobOf(
            "transcribe",
            started,
            startedAt,
            scope,
            "failed",
            { in: null, out: null },
            reason,
            model,
          ),
        };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const form = new FormData();
        form.append("file", new Blob([input.bytes], { type: input.mimeType }), "audio");
        form.append("model", speech.model);
        form.append("response_format", "verbose_json");
        form.append("language", "ru");
        const response = await fetch(`${speech.baseUrl.replace(/\/$/u, "")}/audio/transcriptions`, {
          method: "POST",
          headers: { authorization: `Bearer ${speech.apiKey}` },
          body: form,
          signal: controller.signal,
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 200)}`);
        }
        const data = (await response.json()) as {
          text?: string;
          segments?: { text?: string; start?: number; end?: number }[];
        };
        const value: Transcript = {
          text: data.text ?? "",
          segments: (data.segments ?? []).map((segment) => ({
            text: (segment.text ?? "").trim() || "—",
            startMs: Math.round((segment.start ?? 0) * 1000),
            endMs: Math.round((segment.end ?? 0) * 1000),
          })),
          durationMs: input.durationMs,
        };
        const checked = transcriptSchema.safeParse(value);
        if (!checked.success) {
          const reason = "Расшифровка не прошла схему";
          return {
            ok: false,
            reason,
            job: jobOf(
              "transcribe",
              started,
              startedAt,
              scope,
              "invalid",
              { in: null, out: null },
              reason,
              model,
            ),
          };
        }
        return {
          ok: true,
          value: checked.data,
          job: jobOf(
            "transcribe",
            started,
            startedAt,
            scope,
            "ok",
            { in: null, out: null },
            null,
            model,
          ),
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          reason: `Речь не распознана. ${reason}`,
          job: jobOf(
            "transcribe",
            started,
            startedAt,
            scope,
            "failed",
            { in: null, out: null },
            reason.slice(0, 200),
            model,
          ),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
