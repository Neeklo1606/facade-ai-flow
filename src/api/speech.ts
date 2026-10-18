import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { transcript } from "@/contracts";
import { createSpeech, pickSpeech } from "@/adapters/speech";
import { serverEnv } from "@/lib/runtime-env";
import { transcribeWith } from "./transcribe-flow";
import { input, respond } from "./errors";
import { requestRepositories } from "./server-repositories";

/** Предел записи 180 с при ~48 кбит/с — около 1,1 МБ, в base64 с запасом */
const MAX_AUDIO_BASE64 = 4_000_000;

const transcribeInput = z.object({
  audio: z.string().max(MAX_AUDIO_BASE64).nullable(),
  mimeType: z.string().min(1).max(80),
  durationMs: z.number().int().nonnegative().max(600_000),
  projectId: z.string().min(1),
  sourceId: z.string().min(1).nullable(),
  scenario: z.string().min(1).max(40).nullable(),
});

const transcribeResult = z.object({
  ok: z.boolean(),
  transcript: transcript.nullable(),
  reason: z.string().nullable(),
  by: z.object({ provider: z.string(), model: z.string(), demo: z.boolean() }),
});

export const transcribeFn = createServerFn({ method: "POST" })
  .validator(input(transcribeInput))
  .handler(async ({ data }) => {
    const repos = requestRepositories();
    /*
     * Доступ к фактам объекта проверяет обёртка прав на сервере: без него чтение отчётов
     * объекта бросает отказ, и до распознавателя (и его счёта) запрос не доходит.
     */
    await repos.reports.list(data.projectId);
    /*
     * Рабочий контур без ключа: подготовленная расшифровка показа на настоящую запись была бы
     * враньём (правило 4). Сервер честно отвечает «не подключено», экран предлагает текст.
     */
    const choice = pickSpeech(serverEnv);
    if (choice.kind === "demo") {
      return respond(transcribeResult, {
        ok: false,
        transcript: null,
        reason: "Распознавание речи не подключено. Запишите факт текстом.",
        by: { provider: "none", model: "none", demo: false },
      });
    }
    const bytes = data.audio ? new Uint8Array(Buffer.from(data.audio, "base64")) : null;
    const outcome = await transcribeWith(repos, createSpeech(), { ...data, bytes });
    return respond(transcribeResult, outcome);
  });
