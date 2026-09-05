import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { VerificationPanel } from "@/components/common/VerificationPanel";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { StatusBadge, eventTypeLabels } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { verificationQueue } from "@/mock/events";
import { siteName } from "@/mock/sites";
import { fmtDateTime } from "@/lib/format";
import { inScope, useApp } from "@/lib/app-context";
import { cn } from "@/lib/utils";
import type { ExtractedField } from "@/types";

export const Route = createFileRoute("/verification")({
  head: () => ({
    meta: [
      { title: "Проверка данных — neeklo FieldOps" },
      {
        name: "description",
        content: "Оригинал слева, извлечённые поля справа: человек подтверждает каждое значение, у каждого — цитата-источник.",
      },
      { property: "og:title", content: "Проверка данных — neeklo FieldOps" },
      { property: "og:description", content: "Подтверждение извлечённых данных с указанием источника." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VerificationPage,
});

function VerificationPage() {
  const { siteId } = useApp();
  const queue = useMemo(() => inScope(verificationQueue, siteId), [siteId]);

  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(queue[0]?.id ?? null);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [confirmed, setConfirmed] = useState<Record<string, string[]>>({});
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const pending = queue.filter((e) => !doneIds.includes(e.id));
  const event = pending.find((e) => e.id === activeId) ?? pending[0] ?? null;

  if (!event) {
    return (
      <>
        <PageHeader title="Проверка данных" description="Очередь пуста — всё подтверждено." />
        <Panel bodyClassName="p-0">
          <EmptyState
            icon={CheckCircle2}
            title="Очередь проверки пуста"
            description="Новые события появятся здесь сразу после распознавания. Ничего не уходит в объёмы без подтверждения."
          />
        </Panel>
      </>
    );
  }

  const fields: ExtractedField[] = event.fields.map((f) => ({
    ...f,
    value: edits[event.id]?.[f.id] ?? f.value,
  }));
  const confirmedIds = confirmed[event.id] ?? [];
  const lowCount = fields.filter((f) => f.confidence < 0.7).length;

  const finish = (id: string) => {
    setDoneIds((d) => [...d, id]);
    setActiveId(pending.find((e) => e.id !== id)?.id ?? null);
    setComment("");
    setActiveQuote(null);
  };

  return (
    <>
      <PageHeader
        title="Проверка данных"
        description="Модель извлекает и предлагает, человек подтверждает. Каждое значение раскрывается до цитаты в оригинале."
        meta={
          <>
            <StatusBadge tone="warn">В очереди: {pending.length}</StatusBadge>
            {lowCount > 0 && <StatusBadge tone="danger">Полей с низкой уверенностью: {lowCount}</StatusBadge>}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Panel title="Очередь" bodyClassName="p-0" className="order-2 xl:order-1">
          <ul className="divide-y divide-border">
            {pending.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(e.id);
                    setActiveQuote(null);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 px-4 py-3 text-left transition-fast hover:bg-subtle",
                    e.id === event.id && "bg-accent-subtle",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-caption text-text-muted">
                      <span className="truncate">{eventTypeLabels[e.type]}</span>
                      <time className="ml-auto shrink-0">{fmtDateTime(e.at)}</time>
                    </div>
                    <p className="mt-0.5 truncate text-[13px]">{siteName(e.siteId)}</p>
                    <p className="mt-0.5 line-clamp-2 text-caption text-text-secondary">{e.preview}</p>
                    <div className="mt-1.5">
                      <ConfidenceIndicator value={e.confidence} />
                    </div>
                  </div>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="order-1 min-w-0 xl:order-2">
          <VerificationPanel
            event={event}
            fields={fields}
            activeQuote={activeQuote}
            onFocusSource={(f) => setActiveQuote(f.quote ?? null)}
            onFieldChange={(id, value) =>
              setEdits((prev) => ({ ...prev, [event.id]: { ...(prev[event.id] ?? {}), [id]: value } }))
            }
            onConfirmField={(id) =>
              setConfirmed((prev) => {
                const cur = prev[event.id] ?? [];
                return { ...prev, [event.id]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
              })
            }
            footer={
              <div className="space-y-3">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Комментарий при возврате автору: что уточнить"
                  className="min-h-20"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => finish(event.id)}>
                    <CheckCircle2 className="size-4" /> Подтвердить и провести
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => finish(event.id)}>
                    <Undo2 className="size-4" /> Вернуть автору
                  </Button>
                  <span className="text-caption text-text-muted">
                    Подтверждено полей: {confirmedIds.length} из {fields.length}
                  </span>
                </div>
              </div>
            }
          />
        </div>
      </div>
    </>
  );
}
