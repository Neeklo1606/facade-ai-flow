import { useState } from "react";
import {
  Check,
  FileText,
  Image as ImageIcon,
  Mail,
  Pause,
  Pencil,
  Play,
  Quote,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfidenceIndicator, confidenceLevel } from "./ConfidenceIndicator";
import { SourceBadge } from "./SourceBadge";
import { StatusBadge } from "./StatusBadge";
import { agentName } from "@/mock/agents";
import { fmtSec } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ExtractedField, FieldEvent } from "@/types";

/** Слева оригинал, справа извлечённые поля. Один компонент на все типы событий. */
export function VerificationPanel({
  event,
  fields,
  onFieldChange,
  onConfirmField,
  activeQuote,
  onFocusSource,
  footer,
}: {
  event: FieldEvent;
  fields: ExtractedField[];
  onFieldChange: (id: string, value: string) => void;
  onConfirmField: (id: string) => void;
  activeQuote: string | null;
  onFocusSource: (field: ExtractedField) => void;
  footer?: React.ReactNode;
}) {
  return (
    <>
      {/* Десктоп: две панели */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <OriginalPane event={event} activeQuote={activeQuote} />
        <FieldsPane
          fields={fields}
          event={event}
          onFieldChange={onFieldChange}
          onConfirmField={onConfirmField}
          onFocusSource={onFocusSource}
          footer={footer}
        />
      </div>

      {/* Мобильный: вкладки */}
      <Tabs defaultValue="fields" className="lg:hidden">
        <TabsList className="w-full">
          <TabsTrigger value="original" className="flex-1">
            Оригинал
          </TabsTrigger>
          <TabsTrigger value="fields" className="flex-1">
            Поля ({fields.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="original" className="mt-3">
          <OriginalPane event={event} activeQuote={activeQuote} />
        </TabsContent>
        <TabsContent value="fields" className="mt-3">
          <FieldsPane
            fields={fields}
            event={event}
            onFieldChange={onFieldChange}
            onConfirmField={onConfirmField}
            onFocusSource={onFocusSource}
            footer={footer}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function OriginalPane({ event, activeQuote }: { event: FieldEvent; activeQuote: string | null }) {
  const [playing, setPlaying] = useState(false);
  const o = event.original;

  return (
    <section className="card-surface flex min-w-0 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-card-title">Оригинал</h2>
        <StatusBadge tone="neutral">
          {o.kind === "audio" && <Volume2 className="size-3" />}
          {o.kind === "file" && <FileText className="size-3" />}
          {o.kind === "photo" && <ImageIcon className="size-3" />}
          {o.kind === "text" && <Mail className="size-3" />}
          сохранён без изменений
        </StatusBadge>
      </header>

      <div className="space-y-4 p-5">
        {o.kind === "audio" && (
          <div className="rounded-md border border-border bg-subtle p-4">
            <div className="flex items-center gap-3">
              <Button size="icon" variant="secondary" onClick={() => setPlaying((p) => !p)} aria-label="Воспроизвести">
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              <div className="h-1.5 flex-1 rounded-full bg-border-strong">
                <div className={cn("h-full rounded-full bg-accent transition-fast", playing ? "w-1/3" : "w-0")} />
              </div>
              <span className="text-caption tnum text-text-secondary">{fmtSec(o.durationSec ?? 0)}</span>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed">
              {highlight(o.transcript ?? "", activeQuote)}
            </p>
          </div>
        )}

        {o.kind === "text" && (
          <div className="rounded-md border border-border bg-subtle p-4 text-[13px] leading-relaxed whitespace-pre-line">
            {highlight(o.text ?? "", activeQuote)}
          </div>
        )}

        {o.kind === "file" && (
          <div className="rounded-md border border-border bg-subtle">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-caption text-text-secondary">
              <span className="truncate">{o.fileName}</span>
              <span className="tnum">{o.pages} стр.</span>
            </div>
            <div className="space-y-3 p-4">
              {Array.from({ length: Math.min(o.pages ?? 1, 3) }, (_, i) => (
                <div key={i} className="rounded-md border border-border bg-surface p-4">
                  <div className="text-[11px] text-text-muted">Страница {i + 1}</div>
                  <div className="mt-2 space-y-1.5">
                    {Array.from({ length: 7 }, (_, l) => (
                      <div
                        key={l}
                        className={cn(
                          "h-2 rounded-sm bg-border",
                          l === 3 && i === 0 && activeQuote ? "bg-accent-subtle" : "",
                        )}
                        style={{ width: `${60 + ((l * 37) % 40)}%` }}
                      />
                    ))}
                  </div>
                  {activeQuote && i === 0 && (
                    <p className="mt-3 rounded-sm bg-accent-subtle px-2 py-1 text-caption text-accent">«{activeQuote}»</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {o.photos && o.photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {o.photos.map((p) => (
              <figure key={p.id} className="overflow-hidden rounded-md border border-border">
                <div className="flex aspect-4/3 items-center justify-center bg-subtle">
                  <ImageIcon className="size-5 text-text-muted" strokeWidth={1.5} />
                </div>
                <figcaption className="px-2 py-1.5 text-[11px] text-text-muted">{p.caption}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FieldsPane({
  event,
  fields,
  onFieldChange,
  onConfirmField,
  onFocusSource,
  footer,
}: {
  event: FieldEvent;
  fields: ExtractedField[];
  onFieldChange: (id: string, value: string) => void;
  onConfirmField: (id: string) => void;
  onFocusSource: (field: ExtractedField) => void;
  footer?: React.ReactNode;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const agent = event.log.at(-1)?.agentId ?? "a-extract";

  return (
    <section className="card-surface flex min-w-0 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-card-title">Извлечённые поля</h2>
        <span className="text-caption text-text-muted tnum">
          подтверждено {fields.filter((f) => f.confirmed).length} из {fields.length}
        </span>
      </header>

      <div className="divide-y divide-border">
        {fields.map((f) => {
          const low = confidenceLevel(f.confidence) === "low";
          return (
            <div key={f.id} className={cn("px-5 py-3", low && !f.confirmed && "bg-danger-bg/40")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-caption text-text-muted">{f.label}</span>
                <div className="flex items-center gap-2">
                  <ConfidenceIndicator value={f.confidence} />
                  <SourceBadge
                    agent={agentName(agent)}
                    at={event.at}
                    source={`${f.location}: «${f.quote}»`}
                    confidence={f.confidence}
                    onOpen={() => onFocusSource(f)}
                  />
                </div>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {editing === f.id ? (
                  <Input
                    autoFocus
                    value={f.value}
                    onChange={(e) => onFieldChange(f.id, e.target.value)}
                    onBlur={() => setEditing(null)}
                    className="h-9 max-w-sm"
                  />
                ) : (
                  <span className="text-[14px] font-medium">{f.value}</span>
                )}
                {f.confirmed && (
                  <StatusBadge tone="ok">
                    <Check className="size-3" /> подтверждено
                  </StatusBadge>
                )}
                {f.edited && <StatusBadge tone="info">исправлено человеком</StatusBadge>}
              </div>

              <button
                type="button"
                onClick={() => onFocusSource(f)}
                className="mt-1.5 inline-flex max-w-full items-center gap-1.5 text-left text-caption text-text-secondary transition-fast hover:text-accent"
              >
                <Quote className="size-3 shrink-0" />
                <span className="truncate">
                  {f.location} — «{f.quote}»
                </span>
              </button>

              {!f.confirmed && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" className="h-8" onClick={() => onConfirmField(f.id)}>
                    <Check className="size-3.5" /> Подтвердить
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(f.id)}>
                    <Pencil className="size-3.5" /> Исправить
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {footer && <div className="mt-auto border-t border-border p-5">{footer}</div>}
    </section>
  );
}

function highlight(text: string, quote: string | null) {
  if (!quote) return text;
  const idx = text.toLowerCase().indexOf(quote.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-accent-subtle px-0.5 text-accent">{text.slice(idx, idx + quote.length)}</mark>
      {text.slice(idx + quote.length)}
    </>
  );
}
