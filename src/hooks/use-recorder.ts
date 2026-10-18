import { useCallback, useEffect, useRef, useState } from "react";
import { atLimit, type RecorderState } from "@/lib/capture";

/**
 * Запись голоса в браузере (ADR-036): пуск, пауза, таймер, громкость и предел длины.
 * Правила живут в `lib/capture`, здесь только микрофон и его состояния.
 *
 * Отказ в доступе не бросает исключение наверх: он становится состоянием `denied`, потому что
 * экран обязан продолжать работать текстом (правило «не добавлять рабочему новых действий»).
 */

export interface Recorder {
  state: RecorderState;
  /** Длительность записи в миллисекундах, обновляется раз в 200 мс */
  elapsedMs: number;
  /** Громкость 0…1 для живой волны; в паузе и покое — 0 */
  level: number;
  /** Записанное: отправляется расшифровкой, а не файлом — файлы продукт не хранит */
  blob: Blob | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
}

const TICK_MS = 200;

export function useRecorder(): Recorder {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<{ context: AudioContext; analyser: AnalyserNode } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const carried = useRef(0);

  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void audio.current?.context.close().catch(() => undefined);
    audio.current = null;
    setLevel(0);
  }, []);

  useEffect(() => release, [release]);

  const measure = useCallback(() => {
    const node = audio.current?.analyser;
    if (!node) return 0;
    const data = new Uint8Array(node.frequencyBinCount);
    node.getByteTimeDomainData(data);
    let peak = 0;
    for (const sample of data) peak = Math.max(peak, Math.abs(sample - 128) / 128);
    return Math.min(1, peak * 1.6);
  }, []);

  const tick = useCallback(() => {
    const total = carried.current + (Date.now() - startedAt.current);
    setElapsed(total);
    setLevel(measure());
    // Предел длины: запись останавливается сама и говорит об этом таймером (ADR-036, п. 5)
    if (atLimit(total)) recorder.current?.stop();
  }, [measure]);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setState("asking");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(media).connect(analyser);
      audio.current = { context, analyser };

      const instance = new MediaRecorder(media);
      chunks.current = [];
      instance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      instance.onstop = () => {
        setBlob(new Blob(chunks.current, { type: instance.mimeType || "audio/webm" }));
        carried.current += Date.now() - startedAt.current;
        setElapsed(carried.current);
        release();
        setState("stopped");
      };
      recorder.current = instance;
      carried.current = 0;
      startedAt.current = Date.now();
      setElapsed(0);
      setBlob(null);
      instance.start();
      setState("recording");
      timer.current = setInterval(tick, TICK_MS);
    } catch (error) {
      release();
      /*
       * Отказ в доступе и отсутствие микрофона — разные вещи для человека: в первом случае
       * доступ возвращают в настройках браузера, во втором нужен другой телефон.
       */
      const name = error instanceof DOMException ? error.name : "";
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
    }
  }, [release, tick]);

  const pause = useCallback(() => {
    if (recorder.current?.state !== "recording") return;
    recorder.current.pause();
    carried.current += Date.now() - startedAt.current;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setLevel(0);
    setState("paused");
  }, []);

  const resume = useCallback(() => {
    if (recorder.current?.state !== "paused") return;
    recorder.current.resume();
    startedAt.current = Date.now();
    timer.current = setInterval(tick, TICK_MS);
    setState("recording");
  }, [tick]);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    else {
      release();
      setState("stopped");
    }
  }, [release]);

  const reset = useCallback(() => {
    release();
    recorder.current = null;
    chunks.current = [];
    carried.current = 0;
    setElapsed(0);
    setBlob(null);
    setState("idle");
  }, [release]);

  return { state, elapsedMs, level, blob, start, pause, resume, stop, reset };
}
