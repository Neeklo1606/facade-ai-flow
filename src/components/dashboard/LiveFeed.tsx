import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronDown, PenLine, Radio } from "lucide-react";
import { queries } from "@/api/queries";
import { useDirectory } from "@/api/directory";
import { ConfidenceLabel } from "@/components/common/ConfidenceIndicator";
import { ListRowSkeleton } from "@/components/common/Skeletons";
import { EmptyState, sourceKindIcon, sourceKindLabel } from "@/components/common";
import type { TimelineEvent } from "@/contracts";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface FeedItem {
  event: TimelineEvent;
  projectName: string;
}

/**
 * «Живой поток»: последние события всех объектов одной лентой. У каждого — канал иконкой,
 * автор, время и метка уверенности распознавания. Нажатие открывает оригинал в панели деталей.
 * На телефоне лента складывается в аккордеон: первым экраном остаются метрики и решения.
 */
export function LiveFeed({
  items,
  pending,
  onSource,
}: {
  items: FeedItem[];
  pending: boolean;
  onSource: (sourceId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const body = pending ? (
    <div className="-mx-6 divide-y divide-line">
      {Array.from({ length: 4 }).map((_, index) => (
        <ListRowSkeleton key={index} />
      ))}
    </div>
  ) : items.length === 0 ? (
    <EmptyState
      icon={Radio}
      title="Событий пока нет"
      description="Здесь появятся загрузки документации, ответы поставщиков и отчёты с площадки."
    />
  ) : (
    <ul className="-mx-6 divide-y divide-line">
      {items.map((item) => (
        <FeedRow key={item.event.id} item={item} onSource={onSource} />
      ))}
    </ul>
  );

  return (
    <>
      {/* Телефон и планшет: аккордеон с числом событий в заголовке */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="focus-ring -mx-6 flex min-h-11 w-[calc(100%+48px)] items-center gap-2 border-t border-line px-6 pt-3 text-[13px] font-medium text-text-2 md:hidden"
      >
        {open ? "Скрыть события" : `Показать события: ${items.length}`}
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-fast", open && "rotate-180")}
          strokeWidth={1.75}
        />
      </button>
      <div className={cn(open ? "block" : "hidden", "md:block")}>{body}</div>
    </>
  );
}

/** События, содержимое которых записала обработка, а не человек своим действием */
const recognizedTypes = new Set<string>(["spec_extracted", "offer_received", "report_added"]);

function FeedRow({ item, onSource }: { item: FeedItem; onSource: (sourceId: string) => void }) {
  const { event, projectName } = item;
  const { employeeById } = useDirectory();
  const card = useQuery({
    ...queries.source(event.sourceId ?? ""),
    enabled: !!event.sourceId,
  }).data;
  const source = card?.source ?? null;
  const Icon = source ? sourceKindIcon(source.kind) : PenLine;
  const person = employeeById(event.actorId);
  const author = source?.author ?? person?.name ?? "Автоматическая обработка";
  // Уверенность источника — самое слабое из распознанных полей (глоссарий, §3).
  // Она относится к распознаванию, а не к человеку: метка стоит у событий, содержимое
  // которых разобрала обработка — спецификация, предложение поставщика, отчёт с площадки,
  // включая голосовой (у него есть автор, но цифры в нём распознаны). У правок и решений
  // распознавать нечего, и метка рядом с ручной цифрой читалась как сомнение в ней
  // (находки ревью MEDIUM и повторного ревью LOW).
  const recognized = !event.actorId || recognizedTypes.has(event.type);
  const confidence =
    recognized && card?.extractions.length
      ? Math.min(...card.extractions.map((field) => field.confidence))
      : null;

  const row = (
    <>
      <span
        className="grid size-8 shrink-0 place-items-center rounded-[var(--r-sm)] bg-surface-2 text-text-3"
        title={source ? sourceKindLabel[source.kind] : "Без оригинала"}
      >
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] leading-[1.4] font-medium text-text">
          {event.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-[1.4] text-text-3">
          <span className="inline-flex min-w-0 items-center gap-1">
            {!person && !source && (
              <Bot className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
            )}
            <span className="truncate">{author}</span>
          </span>
          <span aria-hidden>·</span>
          <span className="truncate">{projectName}</span>
          <span aria-hidden>·</span>
          <span className="tnum">{fmtTime(event.at)}</span>
          {confidence !== null && <ConfidenceLabel value={confidence} />}
        </span>
      </span>
    </>
  );

  const rowClass =
    "flex w-full items-start gap-3 px-6 py-3 text-left transition-fast is-hover:bg-surface-2";

  return (
    <li>
      {event.sourceId ? (
        <button
          type="button"
          onClick={() => event.sourceId && onSource(event.sourceId)}
          aria-label={`Открыть оригинал: ${event.title}`}
          className={cn(rowClass, "focus-ring")}
        >
          {row}
        </button>
      ) : (
        <div className={rowClass}>{row}</div>
      )}
    </li>
  );
}
