/**
 * Запись факта с площадки (ADR-036): состояния записи, черновик во вкладке и ключ отправки.
 *
 * Здесь нет ни микрофона, ни сети — только правила. Браузерная часть живёт в `use-recorder`,
 * отправка в `api/ai`, поэтому эти правила проверяются тестами без браузера.
 */

/** Предел длины записи: столько же, сколько AI_MAX_AUDIO_SEC по умолчанию на сервере */
export const CAPTURE_LIMIT_SEC = 180;

/** За сколько секунд до предела предупреждаем: таймер меняет вид, запись не обрывается молча */
export const CAPTURE_WARN_SEC = 15;

export type RecorderState =
  "idle" | "asking" | "recording" | "paused" | "stopped" | "denied" | "unsupported" | "error";

/** Статус отправки черновика (ADR-036, п. 6). «Сохранено» ставится по ответу сервера */
export type SubmitStatus = "draft" | "sending" | "saved" | "failed";

export const submitLabel: Record<SubmitStatus, string> = {
  draft: "Не отправлено",
  sending: "Отправляется",
  saved: "Сохранено",
  failed: "Не отправлено",
};

export interface CapturePhotoMark {
  /** Подпись, которую человек может не писать: тогда это «Фото N» */
  caption: string;
  takenAt: string;
  /** Отметка времени записи, когда фото снято во время записи */
  atMs: number | null;
}

export interface CaptureDraft {
  /** Ключ отправки: один на черновик, поэтому повтор не создаёт дубль */
  captureKey: string;
  projectId: string;
  text: string;
  durationMs: number | null;
  photos: CapturePhotoMark[];
  status: SubmitStatus;
  /** Почему последняя отправка не прошла */
  error: string | null;
}

/** Ключ отправки: `crypto.randomUUID` там, где он есть, иначе время и случайное число */
export function newCaptureKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyDraft(projectId: string): CaptureDraft {
  return {
    captureKey: newCaptureKey(),
    projectId,
    text: "",
    durationMs: null,
    photos: [],
    status: "draft",
    error: null,
  };
}

/** Можно ли отправлять: нужен хоть какой-то текст и объект */
export function readyToSend(draft: CaptureDraft) {
  return draft.projectId.length > 0 && draft.text.trim().length > 0 && draft.status !== "sending";
}

/** Таймер записи: мм:сс, цифры одной ширины */
export function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Сколько осталось до предела; отрицательное — предел пройден */
export const remainingSec = (ms: number) => CAPTURE_LIMIT_SEC - Math.floor(ms / 1000);

/** Пора ли предупредить о пределе */
export const nearLimit = (ms: number) => remainingSec(ms) <= CAPTURE_WARN_SEC;

/** Достигнут ли предел: запись останавливается сама */
export const atLimit = (ms: number) => remainingSec(ms) <= 0;

/* ---------- Переходы статуса отправки ---------- */

/**
 * Статус черновика при отправке (ADR-036, п. 6). Вынесено из экрана, потому что именно здесь
 * теряются записи: «сохранено» раньше ответа сервера или потерянный текст после ошибки.
 *
 * Ключ отправки не меняется ни на одном переходе: повтор обязан прийти с тем же ключом,
 * иначе дубль появится ровно в тот момент, когда сеть оборвалась.
 */
export function markSending(draft: CaptureDraft, durationMs: number | null): CaptureDraft {
  return { ...draft, status: "sending", error: null, durationMs: durationMs ?? draft.durationMs };
}

export function markSaved(draft: CaptureDraft): CaptureDraft {
  return { ...draft, status: "saved", error: null };
}

export function markFailed(draft: CaptureDraft, error: string): CaptureDraft {
  // Текст, фото и ключ остаются: человек нажмёт «Повторить», а не наберёт всё заново
  return { ...draft, status: "failed", error };
}

/* ---------- Черновик во вкладке ---------- */

const KEY = "neeklo-fieldops-capture";

/**
 * Черновик переживает перезагрузку вкладки: текст, метки фото и ключ отправки. Самой записи
 * здесь нет — аудио во вкладку не помещается, и это сказано на экране (ADR-036, «Отвергнуто»).
 */
export function readDraft(): CaptureDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CaptureDraft;
    if (typeof parsed?.captureKey !== "string" || typeof parsed.projectId !== "string") return null;
    // Отправку, прерванную закрытием вкладки, показываем как неотправленную, а не «в пути»
    return { ...parsed, status: parsed.status === "sending" ? "draft" : parsed.status };
  } catch {
    return null;
  }
}

export function writeDraft(draft: CaptureDraft | null) {
  try {
    if (!draft) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Приватный режим: черновик проживёт до перезагрузки
  }
}
