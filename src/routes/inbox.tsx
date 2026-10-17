import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, Inbox, Undo2 } from "lucide-react";
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
import { useInbox } from "@/api/inbox";
import { prefetch } from "@/api/prefetch";
import { queries } from "@/api/queries";
import { fmtNum, plural } from "@/lib/format";
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
  const screen = useScreenState({
    pending: inbox.pending,
    error: inbox.error,
    empty: !inbox.pending && inbox.count === 0,
  });

  return (
    <>
      <PageHeader title="Входящие" />
      <PageCaption>
        <span className="truncate">
          {inbox.count > 0
            ? `${fmtNum(inbox.count)} ${plural(inbox.count, "запись", "записи", "записей")} ждут вас`
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
