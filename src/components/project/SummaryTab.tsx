import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ChevronRight,
  FileDiff,
  FilePlus2,
  FileSearch,
  HardHat,
  ListChecks,
  MailQuestion,
  PackageCheck,
  PencilLine,
  Send,
  type LucideIcon,
} from "lucide-react";
import { SourceRef } from "@/components/common/SourceRef";
import {
  activityKindLabel,
  activityOf,
  docVersionsOf,
  employeeName,
  type ActivityKind,
  type ProjectOverview,
} from "@/mock/repository";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Bar, Block, BlockEmpty } from "./parts";

interface Props {
  projectId: string;
  overview: ProjectOverview;
  /** Переключает селектор объекта, чтобы реестр открылся уже отфильтрованным */
  scope: () => void;
  onSource: (sourceId: string | null) => void;
  onTab: (tab: string) => void;
}

export function SummaryTab(props: Props) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <AttentionBlock {...props} />
      <DocumentationBlock {...props} />
      <MaterialsBlock {...props} />
      <ActivityBlock {...props} />
    </div>
  );
}

/* ---------- 1. Требует внимания ---------- */

interface AttentionRow {
  key: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  value: number;
  tone: "danger" | "warn";
  to: string;
  search?: Record<string, string> | undefined;
}

function AttentionBlock({ projectId, overview, scope }: Props) {
  const rows: AttentionRow[] = [
    {
      key: "unverified",
      icon: ListChecks,
      label: "Непроверенные позиции",
      hint: "Без проверки позиции не уходят в запросы поставщикам",
      value: overview.specUnverified,
      tone: "warn",
      to: `/projects/${projectId}/materials`,
      search: { review: "pending" },
    },
    {
      key: "overdue",
      icon: MailQuestion,
      label: "Просроченные ответы поставщиков",
      hint: "Поставщик не прислал предложение в срок",
      value: overview.overdueRequests,
      tone: "danger",
      to: "/requests",
      search: { status: "collecting" },
    },
    {
      key: "changes",
      icon: FileDiff,
      label: "Изменения документации без разбора",
      hint: `Расхождения ${overview.docVersion} с предыдущей ревизией`,
      value: overview.openChanges,
      tone: "warn",
      to: `/projects/${projectId}/documents`,
    },
    {
      key: "reports",
      icon: HardHat,
      label: "Отсутствующие отчёты с площадки",
      hint: "Смены за неделю без отчёта прораба",
      value: overview.missingReports,
      tone: "warn",
      to: "/field-reports",
    },
  ];
  const open = rows.filter((row) => row.value > 0);

  return (
    <Block
      title="Требует внимания"
      count={open.length ? `${open.length} из ${rows.length}` : undefined}
    >
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const active = row.value > 0;
          return (
            <li key={row.key}>
              <Link
                to={row.to}
                {...(row.search ? { search: row.search } : {})}
                onClick={scope}
                className="focus-ring group relative flex min-h-[64px] items-center gap-3 px-4 py-2.5 transition-fast hover:bg-hover"
              >
                {active && (
                  <span
                    className={cn(
                      "absolute inset-y-3 left-0 w-[3px] rounded-r-full",
                      row.tone === "danger" ? "bg-danger" : "bg-warn",
                    )}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-[var(--r-sm)]",
                    !active && "bg-subtle text-text-muted",
                    active && row.tone === "danger" && "bg-danger-bg text-danger",
                    active && row.tone === "warn" && "bg-warn-bg text-warn",
                  )}
                >
                  <row.icon className="size-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[13px] font-medium sm:truncate",
                      !active && "text-text-secondary",
                    )}
                  >
                    {row.label}
                  </span>
                  <span className="block text-caption text-text-muted sm:truncate">
                    {active ? row.hint : "Нет, всё в порядке"}
                  </span>
                </span>
                <span
                  className={cn(
                    "tnum shrink-0 text-[22px] leading-none font-semibold tracking-[-0.02em]",
                    !active && "text-text-muted",
                    active && row.tone === "danger" && "text-danger",
                    active && row.tone === "warn" && "text-text-primary",
                  )}
                >
                  {active ? fmtNum(row.value) : "0"}
                </span>
                <ChevronRight className="size-4 shrink-0 text-text-muted transition-fast group-hover:translate-x-0.5 group-hover:text-accent" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

/* ---------- 2. Документация ---------- */

function DocumentationBlock({ projectId, overview, scope, onSource }: Props) {
  const versions = docVersionsOf(projectId);
  // Цифры актуальной ревизии берутся из живой сводки: подтверждения на экране извлечения видны сразу
  const latest = versions[0]
    ? {
        ...versions[0],
        extracted: overview.specTotal,
        verified: overview.specTotal - overview.specUnverified,
      }
    : undefined;

  return (
    <Block
      title="Документация"
      to={`/projects/${projectId}/documents`}
      linkLabel="Открыть документацию"
      onLinkClick={scope}
    >
      {!latest ? (
        <BlockEmpty>Документация ещё не загружена</BlockEmpty>
      ) : (
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-caption text-text-muted">Последняя версия</p>
              <p className="mt-0.5 flex items-center gap-2 text-[20px] leading-tight font-semibold">
                {latest.version}
                {latest.sourceId && (
                  <SourceRef sourceId={latest.sourceId} onOpen={() => onSource(latest.sourceId)} />
                )}
              </p>
              <p className="mt-1 text-caption text-text-secondary">
                {fmtDateTime(latest.uploadedAt)} · загрузил(а) {employeeName(latest.uploadedBy)}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-caption font-medium",
                latest.verified < latest.extracted ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok",
              )}
            >
              {latest.verified < latest.extracted ? "Идёт проверка" : "Проверена"}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[var(--r-md)] border border-border bg-border">
            {[
              { label: "Листов", value: latest.sheets },
              { label: "Позиций извлечено", value: latest.extracted },
              { label: "Проверено", value: latest.verified },
            ].map((item) => (
              <div key={item.label} className="bg-surface px-3 py-2.5">
                <dt className="truncate text-[11px] text-text-muted">{item.label}</dt>
                <dd className="tnum mt-0.5 text-[18px] font-semibold">{fmtNum(item.value)}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-3">
            <div className="mb-1.5 flex justify-between text-caption">
              <span className="text-text-secondary">Проверено позиций</span>
              <span className="tnum text-text-primary">
                {Math.round((latest.verified / Math.max(1, latest.extracted)) * 100)}%
              </span>
            </div>
            <Bar
              value={latest.verified}
              total={latest.extracted}
              tone={latest.verified < latest.extracted ? "warn" : "ok"}
            />
          </div>

          {versions.length > 1 && (
            <ul className="mt-4 space-y-1 border-t border-border pt-3">
              {versions.slice(1, 3).map((version) => (
                <li
                  key={version.id}
                  className="flex items-center justify-between gap-3 text-caption text-text-muted"
                >
                  <span>
                    {version.version} · {fmtDate(version.uploadedAt)}
                  </span>
                  <span className="tnum">
                    {fmtNum(version.extracted)} поз. · {version.sheets} л.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Block>
  );
}

/* ---------- 3. Материалы и закупки ---------- */

function MaterialsBlock({ projectId, overview, scope }: Props) {
  const total = overview.specTotal;
  const verified = total - overview.specUnverified;
  const stages = [
    { label: "Всего позиций", value: total, tone: "info" as const },
    {
      label: "Проверено",
      value: verified,
      tone: overview.specUnverified ? ("warn" as const) : ("ok" as const),
    },
    { label: "В запросах", value: overview.inRequests, tone: "accent" as const },
    { label: "Получено предложений", value: overview.offersReceived, tone: "accent" as const },
    { label: "Заказано", value: overview.ordered, tone: "accent" as const },
    { label: "Поставлено", value: overview.delivered, tone: "ok" as const },
  ];

  return (
    <Block
      title="Материалы и закупки"
      to={`/projects/${projectId}/materials`}
      linkLabel="Открыть материалы"
      onLinkClick={scope}
    >
      <ol className="space-y-3 p-4">
        {stages.map((stage, index) => {
          const pct = total ? Math.round((stage.value / total) * 100) : 0;
          return (
            <li
              key={stage.label}
              className="grid grid-cols-[minmax(0,172px)_minmax(0,1fr)_88px] items-center gap-3"
            >
              <span className="flex min-w-0 items-center gap-2 text-[13px] text-text-secondary">
                <span className="mono w-3 shrink-0 text-[11px] text-text-muted">{index + 1}</span>
                <span className="truncate">{stage.label}</span>
              </span>
              <div className="h-5 overflow-hidden rounded-[var(--r-xs)] bg-subtle">
                <div
                  className={cn(
                    "h-full rounded-[var(--r-xs)]",
                    { info: "bg-info", ok: "bg-ok", warn: "bg-warn", accent: "bg-accent" }[
                      stage.tone
                    ],
                    index > 1 && "opacity-80",
                  )}
                  style={{ width: `${Math.max(pct, stage.value ? 1 : 0)}%` }}
                />
              </div>
              <span className="text-right">
                <span className="tnum text-[13px] font-semibold">{fmtNum(stage.value)}</span>
                <span className="tnum ml-1.5 text-caption text-text-muted">{pct}%</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="border-t border-border px-4 py-2.5 text-caption text-text-muted">
        В пути <span className="tnum text-text-primary">{fmtNum(overview.inTransit)}</span> поз. ·
        не запрошено{" "}
        <span className="tnum text-text-primary">
          {fmtNum(Math.max(0, verified - overview.inRequests))}
        </span>{" "}
        проверенных поз.
      </p>
    </Block>
  );
}

/* ---------- 4. Последние события ---------- */

const activityIcon: Record<ActivityKind, LucideIcon> = {
  version_uploaded: FilePlus2,
  spec_extracted: FileSearch,
  qty_corrected: PencilLine,
  request_sent: Send,
  offer_received: PackageCheck,
  replacement_agreed: ArrowLeftRight,
  report_added: HardHat,
};

function ActivityBlock({ projectId, onSource, onTab }: Props) {
  const items = activityOf(projectId).slice(0, 7);

  return (
    <Block title="Последние события" linkLabel="Вся история" onLinkClick={() => onTab("history")}>
      {items.length === 0 ? (
        <BlockEmpty>Событий по объекту пока нет</BlockEmpty>
      ) : (
        <ol className="relative px-4 py-2">
          {items.map((item, index) => {
            const Icon = activityIcon[item.kind];
            return (
              <li key={item.id} className="relative flex gap-3 py-2">
                {index < items.length - 1 && (
                  <span
                    className="absolute top-9 bottom-[-8px] left-[13px] w-px bg-border"
                    aria-hidden
                  />
                )}
                <span className="relative z-[1] grid size-7 shrink-0 place-items-center rounded-full border border-border bg-surface text-text-secondary">
                  <Icon className="size-3.5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug">{item.title}</p>
                  <p className="mt-0.5 text-caption text-text-muted">
                    {activityKindLabel[item.kind]} · {employeeName(item.actorId)} ·{" "}
                    {fmtDateTime(item.at)}
                  </p>
                </div>
                <SourceRef
                  sourceId={item.sourceId}
                  onOpen={() => onSource(item.sourceId)}
                  className="mt-0.5"
                />
              </li>
            );
          })}
        </ol>
      )}
    </Block>
  );
}
