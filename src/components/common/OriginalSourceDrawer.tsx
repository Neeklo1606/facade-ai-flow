import { Mail, MessageSquare, Upload, Globe, Phone, FileText, Image as ImageIcon, Play } from "lucide-react";
import { EntityDrawer } from "./EntityDrawer";
import { ConfidenceIndicator } from "./ConfidenceIndicator";
import { fmtDateTime, fmtSec } from "@/lib/format";
import { siteName } from "@/mock/sites";
import type { EventChannel, FieldEvent } from "@/types";

const channelIcons: Record<EventChannel, typeof Mail> = {
  telegram: MessageSquare,
  email: Mail,
  upload: Upload,
  web: Globe,
  telephony: Phone,
};

const channelNames: Record<EventChannel, string> = {
  telegram: "Телеграм",
  email: "Почта",
  upload: "Загрузка файла",
  web: "Веб-форма",
  telephony: "Звонок",
};

export function channelIcon(channel: EventChannel) {
  return channelIcons[channel];
}

export function channelName(channel: EventChannel) {
  return channelNames[channel];
}

/**
 * Оригинал входящего факта: запись голоса с расшифровкой, письмо или страница документа.
 * Показывает извлечённые поля с уверенностью и цитатой из источника.
 */
export function OriginalSourceDrawer({
  event,
  onOpenChange,
}: {
  event: FieldEvent | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!event) return null;
  const original = event.original;

  return (
    <EntityDrawer
      open
      onOpenChange={onOpenChange}
      title={`Оригинал: ${channelNames[event.channel]}`}
      subtitle={`${event.authorName} · ${fmtDateTime(event.at)} · ${siteName(event.siteId)}`}
      badges={<ConfidenceIndicator value={event.confidence} />}
    >
      <div className="space-y-5">
        {original.kind === "audio" && (
          <section className="rounded-[var(--r-md)] border border-border bg-subtle p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-accent">
                <Play className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-medium">Голосовое сообщение</p>
                <p className="text-[12px] text-text-muted">Длительность {fmtSec(original.durationSec ?? 0)}</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-border">
              <div className="h-1.5 w-0 rounded-full bg-accent" />
            </div>
            {original.transcript && (
              <>
                <p className="mt-4 text-[12px] text-text-muted">Расшифровка</p>
                <p className="mt-1 text-[14px] leading-relaxed text-text-secondary">{original.transcript}</p>
              </>
            )}
          </section>
        )}

        {original.kind === "text" && original.text && (
          <section className="rounded-[var(--r-md)] border border-border bg-subtle p-4">
            <p className="text-[12px] text-text-muted">Текст письма</p>
            <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-line text-text-secondary">{original.text}</p>
          </section>
        )}

        {original.kind === "file" && (
          <section className="flex items-center gap-3 rounded-[var(--r-md)] border border-border bg-subtle p-4">
            <FileText className="size-5 shrink-0 text-text-muted" />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium">{original.fileName ?? "Документ"}</p>
              <p className="text-[12px] text-text-muted">Страниц: {original.pages ?? 1}</p>
            </div>
          </section>
        )}

        {original.photos && original.photos.length > 0 && (
          <section>
            <p className="text-[12px] text-text-muted">Фотографии с площадки</p>
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {original.photos.map((photo) => (
                <li key={photo.id} className="rounded-[var(--r-md)] border border-border p-3">
                  <ImageIcon className="size-4 text-text-muted" />
                  <p className="mt-2 text-[12px] text-text-secondary">{photo.caption}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {event.fields.length > 0 && (
          <section>
            <p className="text-[12px] text-text-muted">Извлечённые данные</p>
            <ul className="mt-2 divide-y divide-border rounded-[var(--r-md)] border border-border">
              {event.fields.map((field) => (
                <li key={field.id} className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] text-text-muted">{field.label}</p>
                      <p className="text-[14px] font-medium">{field.value}</p>
                    </div>
                    <ConfidenceIndicator value={field.confidence} />
                  </div>
                  {field.quote && (
                    <p className="mt-1 border-l-2 border-border pl-2 text-[12px] text-text-muted">
                      «{field.quote}»{field.location ? ` · ${field.location}` : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </EntityDrawer>
  );
}
