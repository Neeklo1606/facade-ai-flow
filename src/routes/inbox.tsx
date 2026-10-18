import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, Inbox, PackageSearch, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const requestRows = requests.data ?? [];
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
  const [reason, setReason] = useState<Record<string, string>>({});
  if (rows.length === 0) return null;

  const next: Record<string, { to: MaterialRequestStatus; label: string }[]> = {
    new: [
      { to: "accepted", label: "Принять" },
      { to: "declined", label: "Отклонить" },
    ],
    accepted: [
      { to: "ordered", label: "Заказано" },
      { to: "declined", label: "Отклонить" },
    ],
    ordered: [{ to: "closed", label: "Закрыть" }],
    closed: [],
    declined: [],
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
      <ul className="divide-line mt-2 divide-y">
        {rows.map((row) => (
          <li key={row.id} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-card-title">{row.name}</span>
              <span className="tnum text-text-2 text-[13px]">
                {fmtNum(row.qty)} {row.unit} · к {fmtDate(row.neededBy)}
              </span>
            </div>
            <p className="text-text-2 mt-1 text-[13px]">{row.note}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
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
              {row.decision ? (
                <span className="text-text-3 text-[13px]">{row.decision}</span>
              ) : null}
            </div>
            {mayDecide && next[row.status]!.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {next[row.status]!.map((step) => (
                  <Button
                    key={step.to}
                    variant={step.to === "declined" ? "ghost" : "secondary"}
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate(
                        {
                          id: row.id,
                          status: step.to,
                          decision:
                            step.to === "declined"
                              ? (reason[row.id] ?? "").trim() || "Отклонено без пояснения"
                              : (reason[row.id] ?? "").trim(),
                        },
                        {
                          onError: (error: Error) =>
                            toast.error("Решение не записано", { description: error.message }),
                        },
                      )
                    }
                  >
                    {step.label}
                  </Button>
                ))}
                <input
                  value={reason[row.id] ?? ""}
                  onChange={(event) =>
                    setReason((prev) => ({ ...prev, [row.id]: event.target.value }))
                  }
                  placeholder="Что решили и почему"
                  aria-label={`Решение по заявке «${row.name}»`}
                  /* На телефоне поле решения уходит на свою строку: в ряд с кнопками оно
                     сжималось так, что подсказка обрезалась (находка показа 18.10.2026) */
                  className="focus-ring bg-surface-2 text-list min-h-12 w-full min-w-0 rounded-[var(--r-sm)] px-3 sm:w-auto sm:flex-1"
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-caption text-text-3 mt-2">
        Ничего не заказывается автоматически: статус меняет человек, и решение записывается с
        автором.
      </p>
    </WidgetCard>
  );
}
