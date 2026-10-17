import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * «Сдвиньте, чтобы подтвердить» (дизайн-система, раздел 7) — только для необратимого:
 * выпуск сводки, отправка наружу. Обратимое выполняется сразу и отменяется тостом.
 *
 * Клавиатура подтверждает так же сознательно, как палец: стрелка вправо ведёт ручку,
 * End доводит до конца. Одного нажатия Enter недостаточно, иначе смысл жеста пропадает.
 */
export function SlideToConfirm({
  label,
  confirmedLabel = "Подтверждено",
  disabled = false,
  onConfirm,
  className,
}: {
  label: string;
  confirmedLabel?: string;
  disabled?: boolean;
  onConfirm: () => void;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(0);
  const [done, setDone] = useState(false);

  const finish = () => {
    setDone(true);
    setRatio(1);
    onConfirm();
  };

  const move = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const next = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    setRatio(next);
    if (next > 0.92) finish();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || done) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    move(event.clientX);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || done || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    move(event.clientX);
  };
  const onPointerUp = () => {
    if (done) return;
    setRatio(0);
  };

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuetext={done ? confirmedLabel : label}
      aria-disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(event) => {
        if (disabled || done) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setRatio((value) => {
            const next = Math.min(1, value + 0.25);
            if (next > 0.92) finish();
            return next;
          });
        }
        if (event.key === "End") {
          event.preventDefault();
          finish();
        }
        if (event.key === "ArrowLeft" || event.key === "Escape") {
          event.preventDefault();
          setRatio(0);
        }
      }}
      className={cn(
        "focus-ring relative flex h-14 touch-none items-center overflow-hidden rounded-[var(--r-pill)] select-none",
        done ? "bg-ok-bg" : "bg-surface-2",
        disabled && "cursor-not-allowed opacity-45",
        className,
      )}
    >
      <span
        aria-hidden="true"
        style={{ width: `${ratio * 100}%` }}
        className={cn("absolute inset-y-0 left-0", done ? "bg-ok-bg" : "bg-ember-soft")}
      />
      <span
        aria-hidden="true"
        style={{ left: `calc(${ratio * 100}% - ${ratio * 56}px)` }}
        className={cn(
          "absolute grid size-14 place-items-center rounded-full",
          done ? "bg-ok text-pill-text" : "bg-pill text-pill-text glow-ember",
        )}
      >
        {done ? <Check className="size-5" /> : <ArrowRight className="size-5" />}
      </span>
      <span className="text-list text-text-2 pointer-events-none w-full pl-20 pr-5">
        {done ? confirmedLabel : label}
      </span>
    </div>
  );
}
