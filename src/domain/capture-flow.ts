/**
 * Поток экрана «Запись» одной линией состояний (ADR-040, п. 1).
 *
 * idle → recording ⇄ paused → uploading → transcribing → extracting → review → done,
 * плюс no-mic (микрофона нет или он запрещён) и error (с повтором).
 *
 * Машина не знает ни о браузере, ни о сети: события приносит экран, а здесь только правила
 * переходов. Поэтому повтор «Готово», отказ микрофона и окно отмены проверяются тестами.
 */

/** Окно «Отменить» после «Верно»: 6 секунд, как у тоста отмены по всему продукту */
export const UNDO_WINDOW_MS = 6_000;

/** Длительность имитации записи без микрофона: показ видит волну, а не мгновенный скачок */
export const SIMULATED_RECORDING_MS = 7_000;

export type CaptureStep =
  | "idle"
  | "recording"
  | "paused"
  | "uploading"
  | "transcribing"
  | "extracting"
  | "review"
  | "done"
  | "no-mic"
  | "error";

/** Почему нет микрофона: от причины зависит одна строка на экране */
export type NoMicReason = "denied" | "unsupported" | "failed";

/** Откуда пришёл факт: голосом, имитацией записи в показе или текстом */
export type CaptureInputKind = "voice" | "simulated" | "text";

/** Что создано по «Верно»: строка на сущность на экране «Готово» */
export interface CreatedEntity {
  kind: "report" | "request";
  id: string;
  /** Одна строка для человека: «Отчёт на проверку: облицовка, 96 м²» */
  title: string;
}

export interface CaptureFlow {
  step: CaptureStep;
  /** Выбранный сценарий показа; null — сценарий не выбран (в демо берётся «Смена») */
  scenario: string | null;
  input: CaptureInputKind | null;
  noMic: NoMicReason | null;
  /** Ошибка одной строкой; `refused` — разбор не дан (нет ключа), а не сбой */
  error: { message: string; refused: boolean; retry: CaptureStep | null } | null;
  /** Созданное по «Верно» и момент создания: от него считается окно отмены */
  created: CreatedEntity[];
  doneAt: number | null;
  /** Сколько раз нажали «Верно» в этом потоке: второй раз ничего не создаёт */
  confirms: number;
}

export type CaptureEvent =
  | { type: "pick"; scenario: string | null }
  | { type: "start" }
  | { type: "mic-unavailable"; reason: NoMicReason }
  | { type: "simulate" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "finish" }
  | { type: "submit-text" }
  | { type: "uploaded" }
  | { type: "transcribed" }
  | { type: "extracted" }
  | { type: "failed"; message: string; refused?: boolean }
  | { type: "retry" }
  | { type: "clarify" }
  | { type: "confirm" }
  | { type: "created"; entities: CreatedEntity[]; at: number }
  | { type: "undo"; at: number }
  | { type: "reset" };

export const initialFlow = (scenario: string | null = null): CaptureFlow => ({
  step: "idle",
  scenario,
  input: null,
  noMic: null,
  error: null,
  created: [],
  doneAt: null,
  confirms: 0,
});

/** Где сейчас идёт работа системы: экран показывает этапы, а не спиннер */
export const working = (step: CaptureStep) =>
  step === "uploading" || step === "transcribing" || step === "extracting";

/** Идёт ли запись: живая волна, таймер и кнопки «Пауза», «Фото», «Готово» */
export const capturing = (step: CaptureStep) => step === "recording" || step === "paused";

/** Можно ли ещё отменить созданное в момент `at` */
export function canUndo(flow: CaptureFlow, at: number) {
  return (
    flow.step === "done" &&
    flow.doneAt !== null &&
    flow.created.length > 0 &&
    at - flow.doneAt < UNDO_WINDOW_MS
  );
}

/** Сколько секунд показывать на «Отменить»: целые, от 6 до 1 */
export function undoSecondsLeft(flow: CaptureFlow, at: number) {
  if (!canUndo(flow, at)) return 0;
  return Math.max(1, Math.ceil((UNDO_WINDOW_MS - (at - flow.doneAt!)) / 1000));
}

/**
 * Переход. Событие, которое в текущем состоянии ничего не значит, возвращает то же состояние:
 * повтор «Готово» после отправки или «Пауза» в покое не ломают поток.
 */
export function captureReducer(flow: CaptureFlow, event: CaptureEvent): CaptureFlow {
  switch (event.type) {
    case "pick":
      // Сценарий меняется только до записи: посреди потока подсказка не прыгает
      return flow.step === "idle" || flow.step === "no-mic" || flow.step === "error"
        ? { ...flow, scenario: event.scenario }
        : flow;

    case "start":
      return flow.step === "idle" || flow.step === "error"
        ? { ...flow, step: "recording", input: "voice", error: null, noMic: null }
        : flow;

    case "mic-unavailable":
      return flow.step === "idle" || flow.step === "recording" || flow.step === "error"
        ? { ...flow, step: "no-mic", noMic: event.reason, input: null }
        : flow;

    case "simulate":
      // Имитация записи: те же этапы, что у голоса, с пометкой «Демо: имитация записи»
      return flow.step === "no-mic" || flow.step === "idle"
        ? { ...flow, step: "recording", input: "simulated", error: null }
        : flow;

    case "pause":
      return flow.step === "recording" && flow.input === "voice"
        ? { ...flow, step: "paused" }
        : flow;

    case "resume":
      return flow.step === "paused" ? { ...flow, step: "recording" } : flow;

    case "finish":
      // «Готово» и отпускание капсулы при удержании: второй раз уже не во время записи
      return capturing(flow.step) ? { ...flow, step: "uploading" } : flow;

    case "submit-text":
      return flow.step === "idle" || flow.step === "no-mic" || flow.step === "error"
        ? { ...flow, step: "uploading", input: "text", error: null }
        : flow;

    case "uploaded":
      if (flow.step !== "uploading") return flow;
      // Текст не расшифровывают: он сразу идёт в разбор
      return { ...flow, step: flow.input === "text" ? "extracting" : "transcribing" };

    case "transcribed":
      return flow.step === "transcribing" ? { ...flow, step: "extracting" } : flow;

    case "extracted":
      return flow.step === "extracting" ? { ...flow, step: "review", confirms: 0 } : flow;

    case "failed":
      if (!working(flow.step) && flow.step !== "review") return flow;
      return {
        ...flow,
        step: "error",
        confirms: 0,
        error: {
          message: event.message,
          refused: event.refused ?? false,
          // Повторяется тот этап, на котором упали; отказ в разборе повтором не лечится
          retry: event.refused ? null : flow.step,
        },
      };

    case "retry":
      return flow.step === "error" && flow.error?.retry
        ? { ...flow, step: flow.error.retry, error: null }
        : flow;

    case "clarify":
      // «Уточнить голосом»: новая запись с тем же сценарием, прежний разбор не применяется
      return flow.step === "review"
        ? { ...flow, step: "recording", input: flow.input === "simulated" ? "simulated" : "voice" }
        : flow;

    case "confirm":
      return flow.step === "review" ? { ...flow, confirms: flow.confirms + 1 } : flow;

    case "created":
      // Создание засчитывается один раз: повтор «Верно» дубля не даёт
      return flow.step === "review" && flow.confirms === 1
        ? { ...flow, step: "done", created: event.entities, doneAt: event.at }
        : flow;

    case "undo":
      return canUndo(flow, event.at)
        ? { ...flow, step: "review", created: [], doneAt: null, confirms: 0 }
        : flow;

    case "reset":
      return initialFlow(flow.scenario);
  }
}

/** Этапы разбора, которые экран показывает по очереди вместо спиннера (D1, п. 5) */
export const EXTRACT_STAGES = [
  "Расшифровали",
  "Нашли объект и захватку",
  "Сверили единицы",
  "Готово к проверке",
] as const;

/** Сколько длится показ этапов разбора: 1,5–2 с, чтобы глаз успел прочитать */
export const EXTRACT_STAGE_MS = 450;
