import { FileText, Mail, MessageSquare, Phone, PenLine } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EntityDrawer } from "./EntityDrawer";
import { ConfidenceIndicator } from "./ConfidenceIndicator";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/api/queries";
import { sourceKindLabel, type SourceKind } from "@/contracts";
import { useDirectory } from "@/api/directory";

const kindIcon: Record<SourceKind, typeof Mail> = {
  telegram: MessageSquare,
  email: Mail,
  upload: FileText,
  call: Phone,
  manual: PenLine,
};

export { sourceKindLabel } from "@/contracts";

export function sourceKindIcon(kind: SourceKind) {
  return kindIcon[kind];
}

/**
 * Значок происхождения значения: откуда взято, страница или письмо, кто подтвердил и когда.
 * Нажатие открывает оригинал с подсветкой области.
 */
export function SourceRef({
  sourceId,
  approvedBy,
  approvedAt,
  onOpen,
  className,
}: {
  sourceId: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  onOpen?: () => void;
  className?: string;
}) {
  const { employeeById } = useDirectory();
  const source = useQuery({ ...queries.source(sourceId ?? ""), enabled: !!sourceId }).data?.source;
  if (!source) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex size-11 items-center justify-center text-text-muted lg:size-6",
              className,
            )}
          >
            <PenLine className="size-3.5" strokeWidth={1.5} />
          </span>
        </TooltipTrigger>
        <TooltipContent>Значение введено вручную, оригинала нет</TooltipContent>
      </Tooltip>
    );
  }
  const Icon = kindIcon[source.kind];
  const approver = approvedBy ? employeeById(approvedBy) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Источник: ${source.title}, ${source.location}`}
          className={cn(
            "focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-surface-2 text-text-3 transition-fast is-hover:bg-info-bg is-hover:text-info lg:size-6",
            className,
          )}
        >
          <Icon className="size-[13px]" strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 space-y-1">
        <div className="text-[12px] font-medium">{source.title}</div>
        <div className="text-[12px] text-text-secondary">
          {sourceKindLabel[source.kind]} · {source.location}
        </div>
        <div className="text-[12px] text-text-secondary">
          {source.author} · {fmtDateTime(source.receivedAt)}
        </div>
        <div className="text-[12px] text-text-secondary">
          {approver && approvedAt
            ? `Подтвердил: ${approver.name}, ${fmtDateTime(approvedAt)}`
            : "Пока никто не подтвердил"}
        </div>
        <div className="text-[12px] text-text-muted">Нажмите, чтобы открыть оригинал</div>
      </TooltipContent>
    </Tooltip>
  );
}

function highlight(text: string, fragment?: string | null) {
  if (!fragment) return text;
  const idx = text.toLowerCase().indexOf(fragment.toLowerCase().slice(0, 24));
  if (idx === -1) return text;
  const end = Math.min(text.length, idx + fragment.length);
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[3px] bg-info-bg px-0.5 text-info">{text.slice(idx, end)}</mark>
      {text.slice(end)}
    </>
  );
}

/** Оригинал источника: письмо, страница документации или сообщение с площадки. */
export function SourceDrawer({
  sourceId,
  fragment,
  onOpenChange,
}: {
  sourceId: string | null;
  fragment?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { employeeById } = useDirectory();
  const card = useQuery({ ...queries.source(sourceId ?? ""), enabled: !!sourceId }).data;
  if (!card) return null;
  const { source, extractions: fields, decisions } = card;

  return (
    <EntityDrawer
      open
      onOpenChange={onOpenChange}
      title={source.title}
      subtitle={`${source.author} · ${fmtDateTime(source.receivedAt)}`}
      badges={
        <>
          <StatusBadge tone="info">{sourceKindLabel[source.kind]}</StatusBadge>
          <StatusBadge tone="neutral">{source.location}</StatusBadge>
        </>
      }
    >
      <div className="space-y-5">
        <section className="rounded-[var(--r-md)] border border-border bg-subtle p-4">
          <p className="text-[12px] text-text-muted">Оригинал, {source.location}</p>
          <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
            {highlight(source.excerpt, fragment)}
          </p>
        </section>

        {fields.length > 0 && (
          <section>
            <p className="text-[12px] text-text-muted">Что извлечено из этого источника</p>
            <ul className="mt-2 divide-y divide-border rounded-[var(--r-md)] border border-border">
              {fields.map((field) => (
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
                      «{field.quote}» · {field.location}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {decisions.length > 0 && (
          <section>
            <p className="text-[12px] text-text-muted">Решения на основании источника</p>
            <ul className="mt-2 space-y-2">
              {decisions.map((item) => (
                <li
                  key={item.id}
                  className="rounded-[var(--r-md)] border border-border px-3 py-2.5"
                >
                  <p className="text-[13px] font-medium">{item.title}</p>
                  <p className="mt-1 text-[12px] text-text-muted">
                    {employeeById(item.approvedBy)?.name ?? "—"} · {fmtDateTime(item.approvedAt)}
                  </p>
                  <p className="mt-1 text-[12px] text-text-secondary">{item.reason}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </EntityDrawer>
  );
}
