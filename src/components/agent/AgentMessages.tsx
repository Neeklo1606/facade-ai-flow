import { useState } from "react";
import { Copy, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { StatList, sourceKindIcon } from "@/components/common";
import { Button } from "@/components/ui/button";
import type { AgentReply, AgentSource } from "@/api/types";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[70%] rounded-[var(--r-md)] rounded-br-[6px] bg-surface-2 px-[18px] py-[14px] text-[15px] leading-[1.5] break-words whitespace-pre-wrap text-text">
        {text}
      </p>
    </div>
  );
}

function SystemHeader({ time }: { time?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-6 place-items-center rounded-[var(--r-sm)] bg-surface-3">
        <Sparkles className="size-[13px] text-text-2" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="text-[12px] text-text-3">Система</span>
      {time && <span className="text-[12px] text-text-3 tabular-nums">{time}</span>}
    </div>
  );
}

export function SourceChip({
  source,
  onOpen,
}: {
  source: AgentSource;
  onOpen: (source: AgentSource) => void;
}) {
  const Icon = sourceKindIcon(source.kind);
  return (
    <button
      type="button"
      onClick={() => onOpen(source)}
      title={`${source.title} · ${source.location}`}
      className="focus-ring inline-flex h-8 max-w-full items-center gap-2 rounded-full border border-line bg-surface-2 px-3 text-[12px] text-text-2 transition-fast is-hover:border-line-2 is-hover:bg-surface-3 is-hover:text-text"
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
      <span className="max-w-[240px] truncate">{source.title}</span>
    </button>
  );
}

/**
 * Ответ системы: без плашки, текст 15/1.6, показатели, источники и действия при наведении.
 * Ответ без источника не показывается — это правило ADR-006, а не оформление.
 */
export function AgentAnswer({
  reply,
  time,
  onOpenSource,
}: {
  reply: AgentReply;
  time: string;
  onOpenSource: (source: AgentSource) => void;
}) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  if (!reply.sources.length) return null;

  const copy = async () => {
    const text = [
      ...reply.text,
      ...reply.facts.map((fact) => `${fact.label}: ${fact.value}`),
      "",
      "Источники:",
      ...reply.sources.map((source) => `— ${source.title}, ${source.location}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Ответ скопирован");
    } catch {
      toast.error("Не получилось скопировать — браузер не дал доступ к буферу обмена");
    }
  };

  return (
    <article className="group">
      <SystemHeader time={time} />
      {reply.scopeNote && (
        <p className="mt-2 text-[13px] leading-[1.45] text-text-3">{reply.scopeNote}</p>
      )}
      <div className="mt-2.5 space-y-2 text-[15px] leading-[1.6] text-text">
        {reply.text.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      {reply.facts.length > 0 && <StatList leader="dots" items={reply.facts} className="mt-3" />}
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Источники ответа">
        {reply.sources.map((source) => (
          <SourceChip key={source.sourceId} source={source} onOpen={onOpenSource} />
        ))}
      </div>
      <div className="mt-2 flex gap-1 opacity-0 transition-fast group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <ActionButton label="Копировать" onClick={copy}>
          <Copy />
        </ActionButton>
        <ActionButton
          label="Полезно"
          pressed={rating === "up"}
          onClick={() => setRating((value) => (value === "up" ? null : "up"))}
        >
          <ThumbsUp />
        </ActionButton>
        <ActionButton
          label="Неточно"
          pressed={rating === "down"}
          onClick={() => setRating((value) => (value === "down" ? null : "down"))}
        >
          <ThumbsDown />
        </ActionButton>
      </div>
    </article>
  );
}

function ActionButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn("size-8 lg:size-8 [&_svg]:size-[15px]", pressed && "bg-surface-2 text-text")}
    >
      {children}
    </Button>
  );
}

export function TypingIndicator() {
  return (
    <div role="status" aria-label="Система готовит ответ">
      <SystemHeader />
      <div className="mt-3 flex h-6 items-center gap-1.5">
        <span className="typing-dot" />
        <span className="typing-dot [animation-delay:0.2s]" />
        <span className="typing-dot [animation-delay:0.4s]" />
      </div>
    </div>
  );
}

/** Не ответ: вопрос вне сценариев или сбой связи. Источника у такого сообщения быть не может */
export function AgentNotice({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[var(--r-md)] border border-line px-[18px] py-[14px]">
      <p className="text-[14px] leading-[1.5] text-text-2">{text}</p>
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
