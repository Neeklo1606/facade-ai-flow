import { useEffect, useRef, useState } from "react";
import { Check, Square, X } from "lucide-react";
import { LiveWave } from "@/components/gaika/LiveWave";
import { StageList } from "@/components/ui/kit/states";
import { cn } from "@/lib/utils";

/**
 * Голосовой ввод в боте бригадира (ADR-049, 01_SPEC 8): волна, таймер, «Готово».
 * Запись начинается сразу по «Сказать голосом»: бюджет пути три касания (сказать, готово,
 * отправить). Микрофон спрашивается, если он есть; без него волна рисуется сама, и путь
 * тот же: в демо речь не распознаётся, после «Готово» подставляется подготовленная фраза.
 */
export function VoiceRecorder({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [level, setLevel] = useState(0.2);
  const [seconds, setSeconds] = useState(0);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    let frame = 0;
    let analyser: AnalyserNode | null = null;
    let context: AudioContext | null = null;
    let alive = true;
    const started = performance.now();
    const tick = () => {
      if (!alive) return;
      setSeconds(Math.floor((performance.now() - started) / 1000));
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length / 255;
        setLevel(Math.min(1, 0.15 + avg * 2.4));
      } else {
        // Без микрофона волна дышит сама: видно, что идёт запись
        const t = (performance.now() - started) / 1000;
        setLevel(0.35 + 0.25 * Math.sin(t * 5.3) * Math.sin(t * 1.7));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Микрофон необязателен: отказ, отсутствие или долгий ответ не ломают путь
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      void navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((media) => {
          if (!alive) {
            media.getTracks().forEach((track) => track.stop());
            return;
          }
          stream.current = media;
          context = new AudioContext();
          analyser = context.createAnalyser();
          analyser.fftSize = 64;
          context.createMediaStreamSource(media).connect(analyser);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      stream.current?.getTracks().forEach((track) => track.stop());
      void context?.close();
    };
  }, []);

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="flex w-full flex-col gap-2" data-testid="bot-voice">
      <div className="flex items-center gap-3 rounded-bubble border border-line bg-surface px-3 py-2">
        <span className="flex items-center gap-1.5 text-meta-strong text-record tnum">
          <Square className="size-2.5 fill-current" aria-hidden />
          {clock}
        </span>
        <LiveWave level={level} active className="h-12 min-w-0 flex-1 gap-1" />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={onDone}
          className="inline-flex min-h-field items-center justify-center gap-2 rounded-control bg-orange-strong px-4 text-body-strong text-on-orange focus-ring press-98"
        >
          <Check className="size-5" aria-hidden />
          Готово
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Отменить запись"
          className="grid min-h-field min-w-field place-items-center rounded-control border border-line-2 bg-surface text-text-2 focus-ring press-98"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

const STAGES = ["Расшифровала", "Нашла объект", "Посчитала время"] as const;
/** Текст набран руками: расшифровывать нечего */
const TEXT_STAGES = STAGES.slice(1);

/**
 * Этапы разбора текстом (ADR-045, 4.18), без спиннера. При reduced-motion этапы сразу готовы.
 * Когда все этапы пройдены, зовёт `onFinish`: бот переходит к сводке или к недостающему шагу.
 */
export function ParseStages({ onFinish, voice }: { onFinish: () => void; voice: boolean }) {
  const stages = voice ? STAGES : TEXT_STAGES;
  const [done, setDone] = useState(0);
  const finish = useRef(onFinish);
  finish.current = onFinish;
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDone(stages.length);
      const id = window.setTimeout(() => finish.current(), 50);
      return () => window.clearTimeout(id);
    }
    const timers = stages.map((_, index) =>
      window.setTimeout(() => setDone(index + 1), 450 * (index + 1)),
    );
    timers.push(window.setTimeout(() => finish.current(), 450 * stages.length + 250));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [stages]);
  return (
    <div className={cn("rounded-bubble border border-line bg-surface px-3 py-3")}>
      <StageList
        label="Разбор фразы"
        stages={stages.map((label, index) => ({
          label,
          state: index < done ? "done" : index === done ? "current" : "wait",
        }))}
      />
    </div>
  );
}
