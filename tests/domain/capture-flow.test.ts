import { describe, expect, test } from "bun:test";
import {
  UNDO_WINDOW_MS,
  canUndo,
  captureReducer,
  initialFlow,
  undoSecondsLeft,
  type CaptureEvent,
  type CaptureFlow,
} from "@/domain/capture-flow";

/**
 * Машина состояний экрана «Запись» (ADR-040, п. 1). Проверяется то, что ломает доверие:
 * двойная отправка, двойное создание, отмена после окна, тупик без микрофона.
 */

const run = (events: CaptureEvent[], from: CaptureFlow = initialFlow()) =>
  events.reduce(captureReducer, from);

const voiceToReview: CaptureEvent[] = [
  { type: "start" },
  { type: "finish" },
  { type: "uploaded" },
  { type: "transcribed" },
  { type: "extracted" },
];

describe("основной путь голосом", () => {
  test("idle → recording → uploading → transcribing → extracting → review → done", () => {
    const steps: string[] = [];
    let flow = initialFlow("demo-shift");
    for (const event of voiceToReview) {
      flow = captureReducer(flow, event);
      steps.push(flow.step);
    }
    expect(steps).toEqual(["recording", "uploading", "transcribing", "extracting", "review"]);
    flow = captureReducer(flow, { type: "confirm" });
    flow = captureReducer(flow, {
      type: "created",
      entities: [{ kind: "report", id: "fr-1", title: "Отчёт" }],
      at: 1_000,
    });
    expect(flow.step).toBe("done");
    expect(flow.created).toHaveLength(1);
    expect(flow.scenario).toBe("demo-shift");
  });

  test("пауза и продолжение не выходят из записи", () => {
    const flow = run([{ type: "start" }, { type: "pause" }, { type: "resume" }]);
    expect(flow.step).toBe("recording");
    expect(run([{ type: "start" }, { type: "pause" }]).step).toBe("paused");
  });

  test("«Готово» из паузы отправляет запись", () => {
    expect(run([{ type: "start" }, { type: "pause" }, { type: "finish" }]).step).toBe("uploading");
  });
});

describe("повторы ничего не удваивают", () => {
  test("повторное «Готово» после отправки не меняет состояние", () => {
    const sent = run([{ type: "start" }, { type: "finish" }]);
    expect(captureReducer(sent, { type: "finish" })).toBe(sent);
  });

  test("второе «Верно» не создаёт сущности второй раз", () => {
    const review = run(voiceToReview);
    const once = captureReducer(review, { type: "confirm" });
    const twice = captureReducer(once, { type: "confirm" });
    const created = captureReducer(twice, {
      type: "created",
      entities: [{ kind: "report", id: "fr-1", title: "Отчёт" }],
      at: 0,
    });
    // Ответ на второе нажатие не засчитывается: экран остаётся на проверке
    expect(created.step).toBe("review");
    expect(created.created).toEqual([]);
  });

  test("пауза в покое ничего не делает", () => {
    const idle = initialFlow();
    expect(captureReducer(idle, { type: "pause" })).toBe(idle);
  });
});

describe("нет микрофона", () => {
  test("отказ в доступе ведёт в no-mic, а не в тупик", () => {
    const flow = run([{ type: "start" }, { type: "mic-unavailable", reason: "denied" }]);
    expect(flow.step).toBe("no-mic");
    expect(flow.noMic).toBe("denied");
  });

  test("«Показать без микрофона» идёт тем же путём, что и голос", () => {
    const flow = run([
      { type: "mic-unavailable", reason: "unsupported" },
      { type: "simulate" },
      { type: "finish" },
      { type: "uploaded" },
    ]);
    expect(flow.input).toBe("simulated");
    expect(flow.step).toBe("transcribing");
  });

  test("из no-mic можно написать текстом", () => {
    const flow = run([{ type: "mic-unavailable", reason: "failed" }, { type: "submit-text" }]);
    expect(flow.step).toBe("uploading");
    expect(captureReducer(flow, { type: "uploaded" }).step).toBe("extracting");
  });

  test("имитацию нельзя поставить на паузу", () => {
    const flow = run([{ type: "simulate" }]);
    expect(captureReducer(flow, { type: "pause" })).toBe(flow);
  });
});

describe("текст минует расшифровку", () => {
  test("submit-text → uploading → extracting", () => {
    const flow = run([{ type: "submit-text" }, { type: "uploaded" }]);
    expect(flow.step).toBe("extracting");
    expect(flow.input).toBe("text");
  });
});

describe("ошибки и отказы", () => {
  test("сбой расшифровки повторяется с того же этапа", () => {
    const failed = run([
      { type: "start" },
      { type: "finish" },
      { type: "uploaded" },
      { type: "failed", message: "Сеть недоступна" },
    ]);
    expect(failed.step).toBe("error");
    expect(failed.error?.retry).toBe("transcribing");
    expect(captureReducer(failed, { type: "retry" }).step).toBe("transcribing");
  });

  test("отказ в разборе повтором не лечится", () => {
    const refused = run([
      { type: "submit-text" },
      { type: "uploaded" },
      { type: "failed", message: "Без ключа разбирается только пример", refused: true },
    ]);
    expect(refused.error?.refused).toBe(true);
    expect(refused.error?.retry).toBeNull();
    expect(captureReducer(refused, { type: "retry" })).toBe(refused);
  });

  test("сбой на «Верно» возвращает к проверке и снова позволяет подтвердить", () => {
    const review = captureReducer(run(voiceToReview), { type: "confirm" });
    const failed = captureReducer(review, { type: "failed", message: "Нет сети" });
    const back = captureReducer(failed, { type: "retry" });
    expect(back.step).toBe("review");
    const again = captureReducer(captureReducer(back, { type: "confirm" }), {
      type: "created",
      entities: [{ kind: "request", id: "mr-1", title: "Заявка" }],
      at: 0,
    });
    expect(again.step).toBe("done");
  });
});

describe("отмена 6 секунд", () => {
  const done = (at: number) =>
    captureReducer(captureReducer(run(voiceToReview), { type: "confirm" }), {
      type: "created",
      entities: [{ kind: "report", id: "fr-1", title: "Отчёт" }],
      at,
    });

  test("в окне отмена возвращает к проверке без созданного", () => {
    const flow = done(10_000);
    expect(canUndo(flow, 10_000 + UNDO_WINDOW_MS - 1)).toBe(true);
    const undone = captureReducer(flow, { type: "undo", at: 15_000 });
    expect(undone.step).toBe("review");
    expect(undone.created).toEqual([]);
  });

  test("после окна отмена не принимается", () => {
    const flow = done(10_000);
    const late = captureReducer(flow, { type: "undo", at: 10_000 + UNDO_WINDOW_MS });
    expect(late).toBe(flow);
    expect(undoSecondsLeft(flow, 10_000 + UNDO_WINDOW_MS)).toBe(0);
  });

  test("секунды на кнопке идут от 6 к 1", () => {
    const flow = done(0);
    expect(undoSecondsLeft(flow, 0)).toBe(6);
    expect(undoSecondsLeft(flow, 5_500)).toBe(1);
  });

  test("«Уточнить голосом» из проверки начинает новую запись", () => {
    expect(captureReducer(run(voiceToReview), { type: "clarify" }).step).toBe("recording");
  });

  test("сброс сохраняет выбранный сценарий", () => {
    const flow = captureReducer(done(0), { type: "reset" });
    expect(flow).toEqual(initialFlow(null));
    const picked = captureReducer(initialFlow(), { type: "pick", scenario: "demo-supply" });
    expect(captureReducer(picked, { type: "reset" }).scenario).toBe("demo-supply");
  });

  test("сценарий не меняется посреди записи", () => {
    const recording = run([{ type: "start" }]);
    expect(captureReducer(recording, { type: "pick", scenario: "demo-supply" })).toBe(recording);
  });
});
