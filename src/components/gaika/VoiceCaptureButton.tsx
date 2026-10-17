import { AlertTriangle, Loader2, Mic, MicOff, Pause, Square, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Голосовая кнопка (дизайн-система, раздел 8) — главный вход продукта. Касание открывает ввод,
 * удержание сразу пишет. Компонент отвечает только за вид и состояние: запись, отправку
 * и разбор делает экран записи, иначе кнопку нельзя показать на витрине без микрофона.
 *
 * «Нет доступа к микрофону» не блокирует работу: экран оставляет рядом текстовый ввод,
 * сама кнопка в этом состоянии выключена и говорит причину.
 */
export type VoiceState =
  "idle" | "recording" | "paused" | "uploading" | "processing" | "offline" | "error" | "denied";

const view: Record<
  VoiceState,
  { label: string; icon: typeof Mic; glow: boolean; breathe: boolean; disabled: boolean }
> = {
  idle: { label: "Говорить", icon: Mic, glow: true, breathe: false, disabled: false },
  recording: { label: "Идёт запись", icon: Square, glow: true, breathe: true, disabled: false },
  paused: { label: "Пауза", icon: Pause, glow: false, breathe: false, disabled: false },
  uploading: {
    label: "Отправляется",
    icon: Loader2,
    glow: false,
    breathe: false,
    disabled: true,
  },
  processing: { label: "Разбираю", icon: Loader2, glow: false, breathe: false, disabled: true },
  offline: {
    label: "Нет сети: запись сохранится",
    icon: WifiOff,
    glow: false,
    breathe: false,
    disabled: false,
  },
  error: {
    label: "Не удалось записать",
    icon: AlertTriangle,
    glow: false,
    breathe: false,
    disabled: false,
  },
  denied: {
    label: "Нет доступа к микрофону",
    icon: MicOff,
    glow: false,
    breathe: false,
    disabled: true,
  },
};

/** Таймер записи: мм:сс, цифры одной ширины */
function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(value / 60)).padStart(2, "0");
  const ss = String(value % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function VoiceCaptureButton({
  state = "idle",
  seconds,
  onPress,
  onHoldStart,
  onHoldEnd,
  className,
}: {
  state?: VoiceState;
  /** Длительность записи; показывается в состояниях записи и паузы */
  seconds?: number;
  onPress?: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
  className?: string;
}) {
  const { label, icon: Icon, glow, breathe, disabled } = view[state];
  const spin = state === "uploading" || state === "processing";
  const timer = state === "recording" || state === "paused";
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-pressed={state === "recording"}
        onClick={onPress}
        onPointerDown={onHoldStart}
        onPointerUp={onHoldEnd}
        onPointerCancel={onHoldEnd}
        className={cn(
          "focus-ring press grid size-16 place-items-center rounded-full",
          "bg-pill text-pill-text",
          glow && "glow-ember",
          breathe && "breathe",
          state === "error" && "glow-risk",
          "disabled:cursor-not-allowed disabled:opacity-45",
        )}
      >
        <Icon className={cn("size-6", spin && "animate-spin")} />
      </button>
      <span className="text-caption text-text-2 flex items-center gap-2">
        {timer && seconds !== undefined ? <span className="tnum">{clock(seconds)}</span> : null}
        {label}
      </span>
    </div>
  );
}
