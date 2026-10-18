import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, Inbox, PackageSearch, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/common/BottomSheet";
import { SlideToConfirm } from "@/components/gaika";
import {
  CountPill,
  EmptyState,
  PageHeader,
  StatusBadge,
  WidgetCard,
  WidgetCardHeader,
} from "@/components/common";
import { ScreenGate, ScreenSkeleton } from "@/components/common/ScreenStates";
import { PageCaption } from "@/components/layout/PageActions";
import { useState } from "react";
import { useInbox } from "@/api/inbox";
import { useMaterialRequests, useDecideMaterialRequest } from "@/api/capture";
import { useAccess } from "@/api/access";
import { useGuide } from "@/lib/guide/store";
import {
  materialRequestStatusLabel,
  type MaterialRequest,
  type MaterialRequestStatus,
} from "@/contracts";
import { toast } from "@/lib/toast";
import { prefetch } from "@/api/prefetch";
import { queries } from "@/api/queries";
import { fmtDate, fmtNum, plural } from "@/lib/format";
import { useProjectId } from "@/lib/project-scope";
import { useScreenState } from "@/lib/screen-state";
import { cn } from "@/lib/utils";

/**
 * «Входящие» (ADR-034, п. 3; раздел 6 GAIKA_PRODUCT_UX) — четвёртая позиция панели.
 * Здесь то, что ждёт этого человека: возвраты автору, очередь проверки и решения.
 * Каждый блок стоит на работающих данных; пустые блоки не показываются.
 */
export const Route = createFileRoute("/inbox")({
  loader: async ({ context }) => {
    await prefetch(context.queryClient, queries.projects());
  },
  head: () => ({
    meta: [
      { title: "Входящие — гайка" },
      {
        name: "description",
        content: "Что ждёт вас: вернули на доработку, очередь проверки и решения.",
      },
      { property: "og:title", content: "Входящие — гайка" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: InboxPage,
});

function InboxPage() {
  const projectId = useProjectId();
  const inbox = useInbox(projectId);
  /* Заявки считаются вместе с остальным: иначе экран говорил бы «пусто» над очередью заявок */
  const requests = useMaterialRequests(projectId);
  const guide = useGuide();
  // Заявка, созданная записью в этой вкладке, стоит первой: снабжение видит именно её (ADR-038)
  const requestRows = [...(requests.data ?? [])].sort(
    (a, b) => Number(b.id === guide.chain.requestId) - Number(a.id === guide.chain.requestId),
  );
  const screen = useScreenState({
    pending: inbox.pending || requests.isPending,
    error: inbox.error || requests.isError,
    empty: !inbox.pending && inbox.count === 0 && requestRows.length === 0,
  });

  return (
    <>
      <PageHeader title="Входящие" />
      <PageCaption>
        <span className="truncate">
          {inbox.count + requestRows.length > 0
            ? `${fmtNum(inbox.count + requestRows.length)} ${plural(inbox.count + requestRows.length, "запись", "записи", "записей")} ждут вас`
            : "Ничего не ждёт"}
        </span>
      </PageCaption>

      <ScreenGate
        state={screen}
        onRetry={inbox.refetch}
        skeleton={<ScreenSkeleton kind="feed" />}
        copy={{
          section: "Входящие",
          roles: "всем, кто ведёт площадку",
          errorTitle: "Не удалось загрузить входящие",
          empty: {
            icon: Inbox,
            title: "Входящих нет",
            description: "Возвраты, очередь проверки и решения появятся здесь, когда будут.",
          },
        }}
      >
        <div className="flex flex-col gap-3">
          {/* Заявки на материал: очередь снабжения и движение статуса (ADR-037, сценарий 3) */}
          <MaterialRequests rows={requestRows} />

          {inbox.queue.length > 0 && (
            <WidgetCard>
              <WidgetCardHeader
                level={2}
                icon={ClipboardCheck}
                title="Ждут вашей проверки"
                hint="факты с площадки"
                aside={<CountPill>{fmtNum(inbox.queue.length)}</CountPill>}
              />
              <ul className="mt-2 divide-line divide-y">
                {inbox.queue.slice(0, 6).map((row) => (
                  <li key={row.card.report.id} className="py-3">
                    <Link
                      to="/check"
                      className="focus-ring transition-fast is-hover:bg-surface-2 -mx-2 block rounded-[var(--r-sm)] px-2 py-1"
                    >
                      <div className="text-card-title">{row.card.report.workType}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Chip>{row.zoneName}</Chip>
                        <Chip>{row.projectName}</Chip>
                      </div>
                      <div className="mt-2">
                        <StatusBadge tone="warn">На проверке</StatusBadge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </WidgetCard>
          )}

          {inbox.returned.length > 0 && (
            <WidgetCard>
              <WidgetCardHeader
                level={2}
                icon={Undo2}
                title="Вернули на доработку"
                hint="ждут вашего уточнения"
                aside={<CountPill>{fmtNum(inbox.returned.length)}</CountPill>}
              />
              <ul className="mt-2 divide-line divide-y">
                {inbox.returned.map((row) => (
                  <li key={row.id} className="py-3">
                    <Link
                      to="/projects/$id/field-reports"
                      params={{ id: row.projectId }}
                      className="focus-ring transition-fast is-hover:bg-surface-2 -mx-2 block rounded-[var(--r-sm)] px-2 py-1"
                    >
                      <div className="text-card-title">{row.workType}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Chip>{row.zoneName}</Chip>
                        <Chip>{row.projectName}</Chip>
                      </div>
                      <p className="text-text-2 mt-2 line-clamp-2 text-[13px]">{row.summary}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </WidgetCard>
          )}

          {inbox.decisions.length > 0 && (
            <WidgetCard>
              <WidgetCardHeader
                level={2}
                icon={Inbox}
                title="Ждут вашего решения"
                hint="с переходом к источнику"
                aside={<CountPill>{fmtNum(inbox.decisions.length)}</CountPill>}
              />
              <ul className="mt-2 divide-line divide-y">
                {inbox.decisions.map((row) => (
                  <li key={row.id} className="py-3">
                    <Link
                      to={row.to}
                      className="focus-ring transition-fast is-hover:bg-surface-2 -mx-2 block rounded-[var(--r-sm)] px-2 py-1"
                    >
                      <div className="text-card-title">{row.title}</div>
                      <p className="text-text-2 mt-1 text-[13px]">{row.reason}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Chip>{row.projectName}</Chip>
                        {row.due && (
                          <StatusBadge tone={row.severity === "danger" ? "danger" : "warn"}>
                            {row.due}
                          </StatusBadge>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </WidgetCard>
          )}
        </div>
      </ScreenGate>
    </>
  );
}

/** Метаданные строки чипами, как на «Сегодня» (ADR-028, п. 5) */
function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "bg-surface-2 text-text-2 text-badge inline-flex items-center rounded-[var(--r-xs)] px-2 py-0.5",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Заявки на материал (ADR-037, сценарий 3). Снабжение видит очередь и меняет статус руками:
 * принять, заказать, закрыть, отклонить с причиной. Автор видит, что с его заявкой стало.
 *
 * Ничего не заказывается автоматически — это правило продукта, а не ограничение демонстрации.
 */
function MaterialRequests({ rows }: { rows: MaterialRequest[] }) {
  const decide = useDecideMaterialRequest();
  const { can } = useAccess();
  const mayDecide = can("procurement", "write");
  const [declining, setDeclining] = useState<MaterialRequest | null>(null);
  const [reason, setReason] = useState("");
  if (rows.length === 0) return null;

  const run = (row: MaterialRequest, status: MaterialRequestStatus, decision: string) =>
    decide.mutate(
      { id: row.id, status, decision },
      {
        onError: (error: Error) =>
          toast.error("Решение не записано", { description: error.message }),
      },
    );

  /* Следующий шаг после принятия: заказ и закрытие — обычными кнопками, решение уже есть */
  const after: Partial<
    Record<MaterialRequestStatus, { to: MaterialRequestStatus; label: string }>
  > = {
    accepted: { to: "ordered", label: "Отметить заказанной" },
    ordered: { to: "closed", label: "Закрыть" },
  };

  return (
    <WidgetCard>
      <WidgetCardHeader
        level={2}
        icon={PackageSearch}
        title="Заявки на материал"
        hint={mayDecide ? "решение за снабжением" : "что с вашими заявками"}
        aside={<CountPill>{fmtNum(rows.length)}</CountPill>}
      />
      <ul className="mt-3 flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id} className="bg-surface-2 rounded-[var(--r-lg)] px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <span className="text-card-title min-w-0">{row.name}</span>
              <StatusBadge
                tone={
                  row.status === "closed"
                    ? "ok"
                    : row.status === "declined"
                      ? "danger"
                      : row.status === "new"
                        ? "warn"
                        : "neutral"
                }
              >
                {materialRequestStatusLabel[row.status]}
              </StatusBadge>
            </div>
            <p className="tnum text-caption text-text-2 mt-1">
              {fmtNum(row.qty)} {row.unit} · к {fmtDate(row.neededBy)}
            </p>
            {row.note ? <p className="text-body text-text-2 mt-2">{row.note}</p> : null}
            {row.decision ? (
              <p className="text-caption text-text-3 mt-2">Решение: {row.decision}</p>
            ) : null}
            {mayDecide && row.status === "new" ? (
              <div className="mt-4 flex flex-col gap-2">
                {/* Решение снабжения необратимо: сдвиг, а не случайное касание (правило 9) */}
                <SlideToConfirm
                  label="Сдвиньте, чтобы принять"
                  confirmedLabel="Принята"
                  disabled={decide.isPending}
                  onConfirm={() => run(row, "accepted", "")}
                />
                <Button
                  variant="ghost"
                  className="self-start"
                  onClick={() => {
                    setReason("");
                    setDeclining(row);
                  }}
                >
                  Отклонить с причиной
                </Button>
              </div>
            ) : null}
            {mayDecide && after[row.status] ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={decide.isPending}
                  onClick={() => run(row, after[row.status]!.to, row.decision ?? "")}
                >
                  {after[row.status]!.label}
                </Button>
                {row.status === "accepted" ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setReason("");
                      setDeclining(row);
                    }}
                  >
                    Отклонить
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-caption text-text-3 mt-3">
        Ничего не заказывается автоматически: статус меняет человек, и решение записывается с
        автором.
      </p>

      <BottomSheet
        open={!!declining}
        onOpenChange={(open) => !open && setDeclining(null)}
        title={`Отклонить: ${declining?.name ?? ""}`}
        description="Причина уйдёт прорабу вместе со статусом"
      >
        <div className="flex flex-col gap-3 pb-2">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Например: есть на складе объекта, заберите у кладовщика"
            aria-label="Причина отказа"
            rows={3}
          />
          <Button
            variant="accent"
            disabled={reason.trim().length < 3 || decide.isPending}
            onClick={() => {
              if (!declining) return;
              run(declining, "declined", reason.trim());
              setDeclining(null);
            }}
          >
            Отклонить заявку
          </Button>
        </div>
      </BottomSheet>
    </WidgetCard>
  );
}
