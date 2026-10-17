import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, ClipboardCheck, FileSearch, Image, Undo2 } from "lucide-react";
import {
  CountPill,
  EmptyState,
  PageHeader,
  PillTabs,
  WidgetCard,
  WidgetCardHeader,
} from "@/components/common";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ScreenGate, ScreenSkeleton } from "@/components/common/ScreenStates";
import { PageCaption } from "@/components/layout/PageActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCheckQueue } from "@/api/check";
import { useDirectory } from "@/api/directory";
import { useReviewReport } from "@/api/mutations";
import { queries } from "@/api/queries";
import { prefetch } from "@/api/prefetch";
import { useAccess } from "@/api/access";
import type { ReportCard } from "@/api/types";
import { sourceKindLabel } from "@/contracts";
import { fmtNum, plural } from "@/lib/format";
import { useScreenState } from "@/lib/screen-state";
import { useProjectId } from "@/lib/project-scope";
import { useSwipe } from "@/hooks/use-swipe";
import { toast, toastRetry, toastUndo } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Tab = "facts" | "positions";

/**
 * «Проверка» — рабочий экран ПТО (ADR-028, п. 3): очередь фактов с площадки и объекты,
 * где ждут проверки позиции спецификации.
 *
 * Решение применяется сразу, отмена живёт 6 секунд: отчёт возвращается в очередь, а принятый
 * объём снимается из «Хода работ» той же операцией.
 */
export const Route = createFileRoute("/check")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: search["tab"] === "positions" ? "positions" : undefined,
  }),
  loader: async ({ context }) => {
    await prefetch(context.queryClient, queries.projects());
  },
  head: () => ({
    meta: [
      { title: "Проверка — гайка" },
      {
        name: "description",
        content: "Очередь проверки: факты с площадки и позиции спецификации, ждущие решения.",
      },
    ],
  }),
  component: CheckPage,
});

function CheckPage() {
  const { tab = "facts" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const projectId = useProjectId();
  const data = useCheckQueue(projectId);
  const { can } = useAccess();
  const screen = useScreenState({
    pending: data.pending,
    error: data.error,
    empty: !data.pending && data.queue.length === 0 && data.positions.length === 0,
  });

  return (
    <>
      <PageHeader title="Проверка" />
      <PageCaption>
        <span className="truncate">
          {data.queue.length > 0
            ? `Осталось ${fmtNum(data.queue.length)} ${plural(data.queue.length, "факт", "факта", "фактов")}`
            : "Очередь фактов пуста"}
        </span>
      </PageCaption>

      {can("documents") && (
        <div className="mb-4">
          <PillTabs
            label="Что проверяем"
            value={tab}
            onChange={(next) =>
              navigate({
                search: () => ({ tab: next === "positions" ? "positions" : undefined }),
                replace: true,
                resetScroll: false,
              })
            }
            tabs={[
              { value: "facts", label: `Факты · ${fmtNum(data.queue.length)}` },
              { value: "positions", label: `Позиции · ${fmtNum(data.positions.length)}` },
            ]}
          />
        </div>
      )}

      <ScreenGate
        state={screen}
        onRetry={data.refetch}
        skeleton={<ScreenSkeleton kind="feed" />}
        copy={{
          section: "Проверка",
          roles: "ПТО, руководителю проекта и директору",
          errorTitle: "Не удалось загрузить очередь",
          empty: {
            icon: ClipboardCheck,
            title: "Проверять нечего",
            description:
              "Факты с площадки и позиции спецификации, ждущие решения, появятся здесь сразу после поступления.",
          },
        }}
      >
        {tab === "positions" ? (
          <PositionsTab rows={data.positions} />
        ) : (
          <FactsTab rows={data.queue} />
        )}
      </ScreenGate>
    </>
  );
}

/** Очередь фактов: карточка за карточкой, свайп и кнопки делают одно и то же */
function FactsTab({
  rows,
}: {
  rows: { card: ReportCard; projectName: string; zoneName: string }[];
}) {
  if (!rows.length) {
    return (
      <WidgetCard>
        <EmptyState
          icon={ClipboardCheck}
          title="Фактов на проверке нет"
          description="Как только прораб сдаст смену, отчёт появится здесь."
        />
      </WidgetCard>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((row, index) => (
        // Главное действие на экране одно: его несёт карточка, до которой очередь дошла.
        // У остальных «Принять» вторичная — иначе на экране столько акцентов, сколько карточек
        <FactCard key={row.card.report.id} current={index === 0} {...row} />
      ))}
    </ul>
  );
}

function FactCard({
  card,
  projectName,
  zoneName,
  current,
}: {
  card: ReportCard;
  projectName: string;
  zoneName: string;
  /** Карточка, до которой дошла очередь: только у неё главное действие акцентное */
  current: boolean;
}) {
  const { report, source, evidence } = card;
  const { employeeName } = useDirectory();
  const { can } = useAccess();
  const [qtyOpen, setQtyOpen] = useState(false);
  const [qty, setQty] = useState(String(report.declaredQty ?? ""));
  const review = useReviewReport({
    onFailed: () => toastRetry("Решение не сохранилось", () => undefined),
  });
  // Директор видит очередь, но решений не принимает (ADR-012)
  const mayDecide = can("field-reports", "write");

  const undo = () => review.mutate({ id: report.id, status: "review", acceptedQty: null });

  const accept = (value: number) => {
    review.mutate(
      { id: report.id, status: "accepted", acceptedQty: value },
      {
        onSuccess: () =>
          toastUndo(
            `Принято ${fmtNum(value)} ${report.unit}`,
            undo,
            `${report.workType} · ${zoneName}`,
          ),
      },
    );
  };

  const back = () => {
    review.mutate(
      { id: report.id, status: "returned", acceptedQty: null },
      {
        onSuccess: () =>
          toastUndo("Возвращено на уточнение", undo, `${report.workType} · ${zoneName}`),
      },
    );
  };

  const swipe = useSwipe({
    ...(mayDecide ? { onRight: () => accept(report.declaredQty ?? 0), onLeft: back } : {}),
  });

  return (
    <li>
      <article
        {...(mayDecide ? swipe.handlers : {})}
        style={swipe.shift ? { transform: `translateX(${swipe.shift}px)` } : undefined}
        className={cn(
          "rounded-[var(--r-md)] border border-line bg-surface p-4 shadow-[var(--lift-1)]",
          !swipe.shift && "transition-fast",
          // Пока палец ведёт карточку, подсказываем, что произойдёт при отпускании
          swipe.shift > 0 && "border-ok",
          swipe.shift < 0 && "border-danger",
        )}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-card-title">{report.workType}</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip>{zoneName}</Chip>
              <Chip>{projectName}</Chip>
              <Chip>{employeeName(report.authorId)}</Chip>
              {evidence.length > 0 && (
                <Chip>
                  <Image className="mr-1 size-3.5" strokeWidth={1.5} aria-hidden />
                  {fmtNum(evidence.length)}
                </Chip>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tnum text-[24px] leading-none font-semibold">
              {fmtNum(report.declaredQty ?? 0)}
            </div>
            <div className="mt-1 text-[12px] text-text-3">{report.unit}</div>
          </div>
        </div>

        <p className="mt-3 text-[14px] leading-[1.45] text-text-2">{report.summary}</p>

        {source && (
          <div className="mt-3">
            <Chip>{sourceKindLabel[source.kind]}</Chip>
          </div>
        )}

        {mayDecide ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant={current ? "accent" : "secondary"}
              onClick={() => accept(report.declaredQty ?? 0)}
            >
              <Check className="size-4" /> Принять
            </Button>
            <Button variant="secondary" onClick={() => setQtyOpen(true)}>
              Исправить объём
            </Button>
            <Button variant="ghost" onClick={back}>
              <Undo2 className="size-4" /> Вернуть
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-text-3">
            Решение принимают ПТО и руководитель проекта.
          </p>
        )}
      </article>

      {qtyOpen && (
        <BottomSheet
          open
          onOpenChange={setQtyOpen}
          title="Принятый объём"
          description={`${report.workType} · ${zoneName}`}
        >
          <div className="space-y-4 p-4 pt-0">
            <label className="block">
              <span className="text-[12px] text-text-3">Объём, {report.unit}</span>
              <Input
                autoFocus
                inputMode="decimal"
                value={qty}
                onChange={(event) => setQty(event.target.value)}
                className="mt-1.5"
              />
            </label>
            <Button
              variant="accent"
              className="w-full"
              onClick={() => {
                const value = Number(qty.replace(",", "."));
                if (!Number.isFinite(value) || value < 0) {
                  toast.error("Объём — положительное число");
                  return;
                }
                setQtyOpen(false);
                accept(value);
              }}
            >
              Принять {qty || "—"} {report.unit}
            </Button>
          </div>
        </BottomSheet>
      )}
    </li>
  );
}

/** Вторая вкладка: где ждут проверки позиции спецификации */
function PositionsTab({
  rows,
}: {
  rows: { projectId: string; projectName: string; unverified: number; total: number }[];
}) {
  if (!rows.length) {
    return (
      <WidgetCard>
        <EmptyState
          icon={FileSearch}
          title="Позиций на проверке нет"
          description="Загруженная спецификация попадает сюда, пока её позиции не сверены с номенклатурой."
        />
      </WidgetCard>
    );
  }
  return (
    <WidgetCard>
      <WidgetCardHeader
        level={2}
        icon={FileSearch}
        title="Позиции спецификации"
        hint="сверка с номенклатурой"
        aside={<CountPill>{fmtNum(rows.length)}</CountPill>}
      />
      <ul className="mt-2 divide-y divide-line">
        {rows.map((row) => (
          <li key={row.projectId} className="py-3">
            <Link
              to="/projects/$id/documents"
              params={{ id: row.projectId }}
              className="focus-ring -mx-2 flex items-center justify-between gap-3 rounded-[var(--r-sm)] px-2 py-1 transition-fast is-hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-card-title">{row.projectName}</span>
                <span className="mt-1 block text-[12px] text-text-3">
                  из {fmtNum(row.total)} {plural(row.total, "позиции", "позиций", "позиций")}
                </span>
              </span>
              <span className="tnum shrink-0 text-[20px] leading-none font-semibold">
                {fmtNum(row.unverified)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center truncate rounded-[var(--r-xs)] bg-surface-2 px-2 text-[12px] leading-none text-text-2">
      {children}
    </span>
  );
}
