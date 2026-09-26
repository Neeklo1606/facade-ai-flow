import { useState } from "react";
import { recordAction } from "@/lib/guide/telemetry";
import { ChevronLeft, ChevronRight, MessageSquare, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ConfidenceLabel } from "@/components/common/ConfidenceIndicator";
import { note } from "@/lib/contour-copy";
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
              <span className="absolute inset-x-0 bottom-0 bg-black/65 px-2 pt-1.5 pb-1.5 text-left text-[11px] leading-tight text-white">
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
 * Голосовой отчёт рядом с разобранными полями: расшифровка и распознанные значения.
 * Звука в демонстрации нет — вместо проигрывателя стоит прямая оговорка (TASK-A2, п. 1),
 * а нажатие на поле подсвечивает цитату, из которой это значение взято.
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const sorted = [...fields].sort((a, b) => toSec(a.location) - toSec(b.location));
  const activeField = sorted.find((field) => field.id === activeId) ?? null;

  return (
    <div data-tour="voice-report" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="rounded-[var(--r-md)] border border-border bg-raised p-3">
        <p className="flex items-center gap-2 text-caption text-text-muted">
          <MessageSquare className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          Голосовое сообщение прораба · {fmt(duration)}
        </p>
        <p className="mt-1 text-caption text-text-muted">{note("audio")}</p>
        <p className="mt-3 text-[13px] leading-relaxed text-text-secondary">
          «{highlight(transcript, activeField?.quote ?? null)}»
        </p>
      </div>

      <ul
        data-extracted-fields
        className="divide-y divide-border rounded-[var(--r-md)] border border-border"
      >
        {sorted.map((field) => {
          const low = field.confidence < 0.7;
          const active = field.id === activeId;
          return (
            <li key={field.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setActiveId((value) => (value === field.id ? null : field.id));
                  recordAction("inspectVoiceField");
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-fast hover:bg-hover",
                  active && "bg-surface-2",
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
                {/* Уверенность словом, как у позиций; процент — в подсказке (ADR-015, п. 4) */}
                <ConfidenceLabel value={field.confidence} className="shrink-0" />
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
      <mark className="rounded-[3px] bg-info-bg px-0.5 text-info">{text.slice(idx, end)}</mark>
      {text.slice(end)}
    </>
  );
}
