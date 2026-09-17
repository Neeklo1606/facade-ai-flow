import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { type Evidence, type Extraction } from "@/contracts";

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Фото с площадки. В моках нет файлов, поэтому снимок рисуется схемой фасада:
 * облицовка, подконструкция или стройплощадка — по подписи.
 */
export function PhotoArt({ caption, className }: { caption: string; className?: string }) {
  const h = hash(caption);
  const sky = ["#b9c7d1", "#c9d3da", "#aebdca"][h % 3];
  const facade = /утепл|вата|мембран/i.test(caption)
    ? "#d8cf9c"
    : /кронштейн|подконструк|разметк|анкер/i.test(caption)
      ? "#a3a9ad"
      : "#3b4146";
  const cols = 4 + (h % 3);
  const rows = 5 + (h % 4);
  return (
    <svg
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block h-full w-full", className)}
      role="img"
      aria-label={caption}
    >
      <rect width="160" height="120" fill={sky} />
      <rect x={10 + (h % 12)} y="14" width="118" height="106" fill={facade} />
      {Array.from({ length: cols }).map((_, c) =>
        Array.from({ length: rows }).map((__, r) => (
          <rect
            key={`${c}-${r}`}
            x={14 + (h % 12) + c * (112 / cols)}
            y={18 + r * (100 / rows)}
            width={112 / cols - 3}
            height={100 / rows - 3}
            fill={/утепл|вата/i.test(caption) ? "#e8e1b8" : "#4a5157"}
            opacity={(c + r + h) % 5 === 0 ? 0.35 : 0.85}
          />
        )),
      )}
      {/строительн|леса|захватк|общий/i.test(caption) &&
        Array.from({ length: 6 }).map((_, i) => (
          <line
            key={i}
            x1={8 + i * 26}
            y1="10"
            x2={8 + i * 26}
            y2="120"
            stroke="#c46a2b"
            strokeWidth="1.2"
          />
        ))}
      <rect y="104" width="160" height="16" fill="#6f6a60" opacity="0.55" />
    </svg>
  );
}

export function PhotoGallery({ photos }: { photos: Evidence[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  const current = open != null ? photos[open] : null;

  return (
    <>
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:px-0">
        {photos.map((photo, index) => (
          <li key={photo.id} className="w-[42%] shrink-0 snap-start md:w-auto">
            <button
              type="button"
              onClick={() => setOpen(index)}
              className="focus-ring group relative block aspect-4/3 w-full overflow-hidden rounded-[var(--r-md)] bg-subtle"
              aria-label={`Открыть фото: ${photo.caption}`}
            >
              <PhotoArt
                caption={photo.caption}
                className="transition-opacity duration-150 group-hover:opacity-90"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-2 pt-5 pb-1.5 text-left text-[11px] leading-tight text-white">
                {photo.caption}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={open != null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-[min(960px,100vw)] gap-0 overflow-hidden border-0 bg-black p-0 text-white sm:rounded-[var(--r-lg)] [&>button]:hidden">
          <DialogTitle className="sr-only">{current?.caption}</DialogTitle>
          {current && (
            <div className="relative">
              <div className="aspect-4/3 w-full">
                <PhotoArt caption={current.caption} />
              </div>
              <div className="flex items-center gap-2 px-3 py-2">
                <p className="min-w-0 flex-1 text-[13px]">
                  {current.caption}
                  <span className="ml-2 text-white/60">
                    {open! + 1} из {photos.length}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  aria-label="Закрыть"
                  className="grid size-11 place-items-center rounded-full hover:bg-white/10"
                >
                  <X className="size-5" />
                </button>
              </div>
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Предыдущее фото"
                    onClick={() => setOpen((open! - 1 + photos.length) % photos.length)}
                    className="absolute top-1/2 left-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Следующее фото"
                    onClick={() => setOpen((open! + 1) % photos.length)}
                    className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 hover:bg-black/70"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function toSec(location: string) {
  const [m, s] = location.split("–")[0]!.split(":").map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
}

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

/**
 * Плеер голосового отчёта рядом с разобранными полями. Поле подсвечивается,
 * когда воспроизведение доходит до его таймкода; нажатие на поле перематывает к нему.
 */
export function VoiceReport({
  duration,
  transcript,
  fields,
}: {
  duration: number;
  transcript: string;
  fields: Extraction[];
}) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setTime((t) => {
        if (t + 0.25 >= duration) {
          setPlaying(false);
          return duration;
        }
        return t + 0.25;
      });
    }, 250);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, duration]);

  const sorted = [...fields].sort((a, b) => toSec(a.location) - toSec(b.location));
  const activeField = [...sorted].reverse().find((f) => toSec(f.location) <= time && time > 0);
  const bars = 48;

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="rounded-[var(--r-md)] border border-border bg-raised p-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (time >= duration) setTime(0);
              setPlaying((p) => !p);
            }}
            aria-label={playing ? "Пауза" : "Воспроизвести оригинал"}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-[var(--shadow-xs)] active:scale-95"
          >
            {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <div
              className="flex h-10 cursor-pointer items-center gap-[2px]"
              role="slider"
              aria-label="Позиция воспроизведения"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={Math.round(time)}
              tabIndex={0}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTime(((e.clientX - rect.left) / rect.width) * duration);
              }}
            >
              {Array.from({ length: bars }).map((_, i) => {
                const height = 20 + (Math.sin(i * 1.7) * 0.5 + 0.5) * 60 + ((i * 37) % 20);
                const played = (i / bars) * duration <= time;
                return (
                  <span
                    key={i}
                    className={cn("flex-1 rounded-full", played ? "bg-accent" : "bg-border-strong")}
                    // Округление: браузер сокращает длинную дробь в style, и SSR-разметка не совпала бы с клиентом
                    style={{ height: `${Math.min(100, Math.round(height))}%` }}
                  />
                );
              })}
            </div>
            <p className="tnum mt-0.5 flex justify-between text-caption text-text-muted">
              <span>{fmt(time)}</span>
              <span>Оригинал из Telegram · {fmt(duration)}</span>
            </p>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-text-secondary">
          «{highlight(transcript, activeField?.quote ?? null)}»
        </p>
      </div>

      <ul className="divide-y divide-border rounded-[var(--r-md)] border border-border">
        {sorted.map((field) => {
          const low = field.confidence < 0.7;
          const active = field.id === activeField?.id;
          return (
            <li key={field.id}>
              <button
                type="button"
                onClick={() => {
                  setTime(toSec(field.location));
                  setPlaying(true);
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-fast hover:bg-hover",
                  active && "bg-accent-subtle",
                )}
              >
                <span className="tnum w-10 shrink-0 text-caption text-text-muted">
                  {field.location}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-caption text-text-muted">{field.label}</span>
                  <span className={cn("block text-[14px] font-medium", low && "text-warn")}>
                    {field.value}
                  </span>
                </span>
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    field.confidence >= 0.85
                      ? "bg-conf-high"
                      : field.confidence >= 0.7
                        ? "bg-conf-mid"
                        : "bg-conf-low",
                  )}
                  title={`Уверенность ${Math.round(field.confidence * 100)}%`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function highlight(text: string, quote: string | null) {
  if (!quote) return text;
  const idx = text.toLowerCase().indexOf(quote.toLowerCase().slice(0, 18));
  if (idx < 0) return text;
  const end = Math.min(text.length, idx + quote.length);
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[3px] bg-accent-subtle px-0.5 text-accent">
        {text.slice(idx, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}
