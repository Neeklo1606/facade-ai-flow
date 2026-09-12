import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Inbox as InboxIcon, Mail, MessageSquare, Phone, Upload, Globe, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import {
  StatusBadge,
  channelLabels,
  eventTypeLabels,
  processingStatusMeta,
} from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { events } from "@/mock/events";
import { siteName } from "@/mock/sites";
import { fmtDateTime } from "@/lib/format";
import { inScope, useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";
import type { EventChannel, EventType } from "@/types";

export const Route = createFileRoute("/inbox")({
  validateSearch: (search: Record<string, unknown>) => ({
    status: typeof search['status'] === "string" ? (search['status'] as string) : undefined,
    channel: typeof search['channel'] === "string" ? (search['channel'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Входящие — neeklo FieldOps" },
      {
        name: "description",
        content: "Единая лента всего, что пришло с площадки и от поставщиков, до обработки: голос, письма, файлы, звонки.",
      },
      { property: "og:title", content: "Входящие — neeklo FieldOps" },
      { property: "og:description", content: "Лента сырых событий с фильтрами и массовыми действиями." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InboxPage,
});

const channelIcons: Record<EventChannel, typeof Mail> = {
  telegram: MessageSquare,
  email: Mail,
  upload: Upload,
  web: Globe,
  telephony: Phone,
};

const channelFilters: (EventChannel | "all")[] = ["all", "telegram", "email", "upload", "web", "telephony"];
const typeFilters: (EventType | "all")[] = ["all", "field_report", "supplier_reply", "contract", "checklist", "invoice", "other"];

function InboxPage() {
  const { siteId } = useApp();
  const search = Route.useSearch();
  const initialChannel = channelFilters.includes((search.channel ?? "all") as EventChannel)
    ? ((search.channel ?? "all") as EventChannel)
    : "all";
  const [channel, setChannel] = useState<EventChannel | "all">(initialChannel);
  const [type, setType] = useState<EventType | "all">("all");
  const [onlyUnprocessed, setOnlyUnprocessed] = useState(search.status === "review");
  const [selected, setSelected] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const list = useMemo(
    () =>
      inScope(events, siteId)
        .filter((e) => !dismissed.includes(e.id))
        .filter((e) => channel === "all" || e.channel === channel)
        .filter((e) => type === "all" || e.type === type)
        .filter((e) => !onlyUnprocessed || e.status === "received" || e.status === "recognizing" || e.status === "extracted"),
    [siteId, channel, type, onlyUnprocessed, dismissed],
  );

  const allSelected = list.length > 0 && selected.length === list.length;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <PageHeader
        title="Входящие"
        description="Сырой поток до обработки. Ничего не попадает в объёмы и документы, пока человек не подтвердит извлечённые данные."
        actions={
          <Button size="sm" variant="secondary" asChild>
            <Link to="/verification">Открыть проверку</Link>
          </Button>
        }
      />

      <Panel bodyClassName="p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {channelFilters.map((c) => (
            <FilterChip key={c} active={channel === c} onClick={() => setChannel(c)}>
              {c === "all" ? "Все каналы" : channelLabels[c]}
            </FilterChip>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
          {typeFilters.map((t) => (
            <FilterChip key={t} active={type === t} onClick={() => setType(t)}>
              {t === "all" ? "Все типы" : eventTypeLabels[t]}
            </FilterChip>
          ))}
          <FilterChip active={onlyUnprocessed} onClick={() => setOnlyUnprocessed((v) => !v)}>
            Только необработанные
          </FilterChip>
        </div>
      </Panel>

      <div className="mt-4">
        <Panel
          bodyClassName="p-0"
          title={
            <div className="flex items-center gap-3">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v ? list.map((e) => e.id) : [])}
                aria-label="Выбрать все"
              />
              <span className="text-card-title">Событий: {list.length}</span>
            </div>
          }
          action={
            selected.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <span className="hidden text-caption text-text-muted sm:inline">Выбрано {selected.length}</span>
                <Button size="sm" variant="secondary" className="h-8" onClick={() => setSelected([])}>
                  <Check className="size-4" /> Отправить на проверку
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => {
                    setDismissed((d) => [...d, ...selected]);
                    setSelected([]);
                  }}
                >
                  <X className="size-4" /> Скрыть
                </Button>
              </div>
            ) : null
          }
        >
          {list.length === 0 ? (
            <EmptyState
              icon={InboxIcon}
              title="Входящих нет"
              description="По выбранным фильтрам ничего не осталось. Снимите фильтры или выберите другой объект."
            />
          ) : (
            <ul className="divide-y divide-border">
              {list.map((e) => {
                const Icon = channelIcons[e.channel];
                return (
                  <li key={e.id} className={cn("flex gap-3 px-4 py-3 transition-fast hover:bg-subtle", selected.includes(e.id) && "bg-accent-subtle")}>
                    <Checkbox
                      className="mt-1"
                      checked={selected.includes(e.id)}
                      onCheckedChange={() => toggle(e.id)}
                      aria-label={`Выбрать событие ${e.id}`}
                    />
                    <Icon className="mt-0.5 size-4 shrink-0 text-text-muted" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted">
                        <span className="text-text-secondary">{e.authorName}</span>
                        <span>·</span>
                        <span>{channelLabels[e.channel]}</span>
                        <span>·</span>
                        <span className="truncate">{siteName(e.siteId)}</span>
                        <time className="sm:ml-auto">{fmtDateTime(e.at)}</time>
                      </div>
                      <p className="mt-1 text-[13px] break-words">{e.preview}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <StatusBadge tone="neutral">{eventTypeLabels[e.type]}</StatusBadge>
                        <StatusBadge tone={processingStatusMeta[e.status]!.tone}>{processingStatusMeta[e.status]!.label}</StatusBadge>
                        {e.confidence > 0 && <ConfidenceIndicator value={e.confidence} />}
                        <Link
                          to="/verification"
                          className="text-caption text-info transition-fast hover:underline"
                        >
                          Проверить
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-md border px-3 text-caption transition-fast",
        active ? "border-accent bg-accent-subtle text-accent" : "border-border text-text-secondary hover:bg-subtle",
      )}
    >
      {children}
    </button>
  );
}
