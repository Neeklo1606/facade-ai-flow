import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarRange, Flag, Layers, TrendingUp, Upload } from "lucide-react";
import {
  EmptyState,
  EntityDrawer,
  ExplainPopover,
  MetricStrip,
  MetricStripSkeleton,
  ProgressBar,
  SourceRef,
  StatusBadge,
  WidgetCard,
  WidgetCardHeader,
  CountPill,
} from "@/components/common";
import { SkeletonLine } from "@/components/common/Skeletons";
import { Button } from "@/components/ui/button";
import { useWorkProgress } from "@/api/work-progress";
import type { MilestonePoint, ZoneRow } from "@/api/types";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Project } from "@/contracts";

const metricIcon = {
  done: Layers,
  deviation: TrendingUp,
  next: Flag,
  days: CalendarRange,
} as const;

const milestoneTone = {
  planned: "info",
  at_risk: "warn",
  done: "ok",
  overdue: "danger",
} as const;

/**
 * Вкладка «Ход работ»: объёмы по захваткам с плановой риской, отклонение и контрольные точки
 * договора на линии времени. Каждая цифра либо кликабельна, либо объясняет, как получена.
 */
export function ProgressTab({
  project,
  onSource,
}: {
  project: Project;
  onSource: (sourceId: string) => void;
}) {
  const progress = useWorkProgress(project.id);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "behind">("all");

  const zone = progress.zones.find((row) => row.id === zoneId) ?? null;
  const milestone = progress.timeline.points.find((point) => point.id === milestoneId) ?? null;
  const zones =
    filter === "behind"
      ? progress.zones.filter((row) => (row.deviationPp ?? 0) < 0)
      : progress.zones;

  if (progress.pending)
    return (
      <div className="space-y-4">
        <MetricStripSkeleton count={4} />
        <div className="widget-card space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <SkeletonLine className="w-1/3" />
              <SkeletonLine className="h-1.5 w-full" />
            </div>
          ))}
        </div>
      </div>
    );

  if (!progress.zones.length)
    return (
      <WidgetCard>
        <EmptyState
          icon={Layers}
          title="Захватки не заведены"
          description="Объёмы работ берутся из захваток объекта: оси, этажи, план в м². Они извлекаются из проектной документации — загрузите её, и ход работ появится здесь."
        />
        <div className="flex justify-center">
          <Button variant="secondary" asChild>
            <Link to="/projects/$id/documents" params={{ id: project.id }}>
              <Upload className="size-4" /> Загрузить документацию
            </Link>
          </Button>
        </div>
      </WidgetCard>
    );

  return (
    <div className="space-y-4">
      <MetricStrip
        label="Показатели хода работ"
        items={progress.metrics.map((metric) => ({
          icon: metricIcon[metric.key as keyof typeof metricIcon] ?? Layers,
          label: metric.label,
          value: metric.value,
          ...(metric.note ? { note: metric.note } : {}),
          explain: (
            <ExplainPopover
              title={metric.explain.title}
              formula={metric.explain.formula}
              sources={metric.explain.sources}
              onOpenSource={onSource}
            />
          ),
          onSelect: () => {
            if (metric.filter) setFilter(metric.filter === "behind" ? "behind" : "all");
            if (metric.milestoneId) setMilestoneId(metric.milestoneId);
          },
          selected: metric.filter === "behind" ? filter === "behind" : undefined,
        }))}
      />

      <WidgetCard>
        <WidgetCardHeader
          level={2}
          icon={Layers}
          title="Захватки"
          hint={filter === "behind" ? "отстают от срока" : "план, факт и отклонение"}
          aside={
            <>
              <CountPill>{fmtNum(zones.length)}</CountPill>
              {filter === "behind" && (
                <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>
                  Показать все
                </Button>
              )}
            </>
          }
        />
        {zones.length === 0 ? (
          <EmptyState
            variant="filtered"
            title="Отстающих захваток нет"
            description="По выбранному условию ни одна захватка не отстаёт от доли прошедшего срока договора."
            actionLabel="Показать все захватки"
            onAction={() => setFilter("all")}
          />
        ) : (
          <ul className="-mx-6 divide-y divide-line">
            {zones.map((row) => (
              <ZoneItem
                key={row.id}
                row={row}
                onOpen={() => setZoneId(row.id)}
                onSource={onSource}
              />
            ))}
          </ul>
        )}
      </WidgetCard>

      <WidgetCard>
        <WidgetCardHeader
          level={2}
          icon={Flag}
          title="Контрольные точки договора"
          hint="линия времени, вертикаль — сегодня"
          aside={<CountPill>{fmtNum(progress.timeline.points.length)}</CountPill>}
        />
        <MilestoneTimeline
          points={progress.timeline.points}
          todayOffset={progress.timeline.todayOffset}
          onOpen={setMilestoneId}
        />
      </WidgetCard>

      {zone && (
        <EntityDrawer
          open
          onOpenChange={() => setZoneId(null)}
          title={zone.name}
          subtitle={[zone.axes && `оси ${zone.axes}`, zone.floors && `этажи ${zone.floors}`]
            .filter(Boolean)
            .join(" · ")}
          badges={
            <>
              <StatusBadge tone={zone.donePct >= 100 ? "ok" : "info"}>
                Готовность {zone.donePct}%
              </StatusBadge>
              {zone.workType && <StatusBadge tone="neutral">{zone.workType}</StatusBadge>}
            </>
          }
        >
          <div className="space-y-5">
            <ProgressBar
              value={zone.donePct}
              tone={deviationTone(zone.deviationPp)}
              {...(zone.planPct === null ? {} : { reference: zone.planPct })}
              label={`${zone.name}: выполнено ${zone.donePct}%`}
            />
            <div className="grid grid-cols-2 gap-4">
              <Fact label="Выполнено">
                <span className="tnum">
                  {fmtNum(zone.factQty)} {zone.unit}
                </span>
              </Fact>
              <Fact label="План">
                <span className="tnum">
                  {fmtNum(zone.planQty)} {zone.unit}
                </span>
              </Fact>
              <Fact label="Осталось">
                <span className="tnum">
                  {fmtNum(Math.max(0, zone.planQty - zone.factQty))} {zone.unit}
                </span>
              </Fact>
              <Fact label="Отклонение от срока">
                <span className={cn("tnum", deviationText(zone.deviationPp))}>
                  {deviationLabel(zone.deviationPp)}
                </span>
              </Fact>
            </div>
            {zone.lastFact ? (
              <div className="rounded-[var(--r-md)] border border-line bg-surface-2 px-4 py-3">
                <p className="text-[12px] text-text-3">Последний принятый объём</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-text">
                  <span className="tnum font-medium">
                    {fmtNum(zone.lastFact.qty)} {zone.unit}
                  </span>
                  <span className="text-text-3">· {fmtDateTime(zone.lastFact.at)}</span>
                  <SourceRef
                    sourceId={zone.lastFact.sourceId}
                    onOpen={() => zone.lastFact?.sourceId && onSource(zone.lastFact.sourceId)}
                  />
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-text-3">
                Принятых отчётов по захватке ещё не было: факт равен объёму, зафиксированному при
                заведении захватки.
              </p>
            )}
            <Button variant="secondary" asChild className="w-full">
              <Link
                to="/projects/$id/field-reports"
                params={{ id: project.id }}
                search={{ zone: zone.id }}
              >
                Отчёты по этой захватке <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </EntityDrawer>
      )}

      {milestone && (
        <EntityDrawer
          open
          onOpenChange={() => setMilestoneId(null)}
          title={milestone.name}
          subtitle={`срок ${fmtDate(milestone.dueDate)}`}
          badges={
            <StatusBadge tone={milestoneTone[milestone.status]}>
              {milestone.statusLabel}
            </StatusBadge>
          }
        >
          <div className="space-y-4">
            <Fact label="Требование договора">{milestone.requirement}</Fact>
            {milestone.location && <Fact label="Где в договоре">{milestone.location}</Fact>}
            <div className="flex items-center gap-2">
              <SourceRef
                sourceId={milestone.sourceId}
                onOpen={() => milestone.sourceId && onSource(milestone.sourceId)}
              />
              <span className="text-[13px] text-text-3">
                {milestone.sourceId ? "Открыть пункт договора" : "Пункт договора не привязан"}
              </span>
            </div>
          </div>
        </EntityDrawer>
      )}
    </div>
  );
}

/** Подпись и значение в панели деталей: только чтение, без полей ввода */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] leading-[1.4] text-text-3">{label}</p>
      <p className="mt-0.5 text-[14px] leading-[1.45] text-text">{children}</p>
    </div>
  );
}

function ZoneItem({
  row,
  onOpen,
  onSource,
}: {
  row: ZoneRow;
  onOpen: () => void;
  onSource: (sourceId: string) => void;
}) {
  return (
    <li className="group relative px-6 py-3.5 transition-fast is-hover:bg-surface-2">
      {/* Кнопка растянута на строку: источник факта остаётся отдельным действием поверх неё */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Открыть захватку: ${row.name}`}
        className="focus-ring absolute inset-0 rounded-none"
      />
      <div className="pointer-events-none relative">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 text-[15px] leading-[1.35] font-medium text-text">
            {row.name}
          </span>
          <span className="tnum shrink-0 text-[14px] text-text-2">
            {fmtNum(row.factQty)} / {fmtNum(row.planQty)} {row.unit}
            <span className="ml-2 font-semibold text-text">{row.donePct}%</span>
          </span>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] leading-[1.45] text-text-3">
          <span className="min-w-0">
            {[row.axes && `оси ${row.axes}`, row.floors && `этажи ${row.floors}`, row.workType]
              .filter(Boolean)
              .join(" · ") || "Вид работ появится с первым отчётом"}
          </span>
          {row.lastFact?.sourceId && (
            <span className="pointer-events-auto relative z-[2] inline-flex">
              <SourceRef
                sourceId={row.lastFact.sourceId}
                onOpen={() => row.lastFact?.sourceId && onSource(row.lastFact.sourceId)}
              />
            </span>
          )}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <ProgressBar
            value={row.donePct}
            tone={deviationTone(row.deviationPp)}
            {...(row.planPct === null ? {} : { reference: row.planPct })}
            label={`${row.name}: выполнено ${row.donePct}% при плане ${row.planPct ?? 0}%`}
            className="flex-1"
          />
          <span className={cn("tnum shrink-0 text-[12px]", deviationText(row.deviationPp))}>
            {deviationLabel(row.deviationPp)}
          </span>
        </div>
      </div>
    </li>
  );
}

/** Линия времени: ромбы контрольных точек, вертикаль «сегодня». На телефоне — вертикальная лента */
function MilestoneTimeline({
  points,
  todayOffset,
  onOpen,
}: {
  points: MilestonePoint[];
  todayOffset: number | null;
  onOpen: (id: string) => void;
}) {
  if (!points.length)
    return (
      <EmptyState
        title="Контрольные точки не извлечены"
        description="Они появятся, когда в договоре объекта будут распознаны этапы со сроками и требованиями."
      />
    );

  return (
    <>
      {/* Телефон: вертикальная лента, ничего не прокручивается вбок */}
      <ol className="space-y-3 md:hidden">
        {points.map((point) => (
          <li key={point.id}>
            <button
              type="button"
              onClick={() => onOpen(point.id)}
              className="focus-ring flex w-full items-start gap-3 rounded-[var(--r-md)] border border-line bg-surface-2 px-4 py-3 text-left transition-fast"
            >
              <span
                aria-hidden
                className={cn("mt-1 size-2.5 shrink-0 rotate-45", diamondClass(point))}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-text">{point.name}</span>
                <span className="mt-0.5 block text-[12px] text-text-3">
                  {fmtDate(point.dueDate)} · {point.statusLabel}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {/* Планшет и шире: горизонтальная линия с прокруткой */}
      <div className="hidden overflow-x-auto pb-2 md:block">
        <div className="relative min-w-[560px] px-4 pt-8 pb-2">
          <span aria-hidden className="absolute inset-x-4 top-[38px] h-px bg-line-2" />
          {todayOffset !== null && (
            <span
              aria-hidden
              className="absolute top-4 bottom-8 w-px bg-sand/60"
              style={{ left: `calc(1rem + ${todayOffset * 100}% - ${todayOffset * 2}rem)` }}
            >
              <span className="absolute -top-4 -left-6 text-[11px] whitespace-nowrap text-text-3">
                сегодня
              </span>
            </span>
          )}
          <ol className="relative flex items-start justify-between gap-4">
            {points.map((point) => (
              <li key={point.id} className="flex min-w-0 flex-1 flex-col items-center">
                <button
                  type="button"
                  onClick={() => onOpen(point.id)}
                  className="focus-ring flex min-h-11 flex-col items-center gap-2 rounded-[var(--r-sm)] px-2 py-1 text-center transition-fast is-hover:bg-surface-2"
                >
                  <span aria-hidden className={cn("size-3 rotate-45", diamondClass(point))} />
                  <span className="tnum text-[12px] text-text-2">{fmtDate(point.dueDate)}</span>
                  <span className="line-clamp-2 max-w-[160px] text-[13px] leading-[1.35] text-text">
                    {point.name}
                  </span>
                  <StatusBadge tone={milestoneTone[point.status]}>{point.statusLabel}</StatusBadge>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}

/** Пройденные точки заполнены, будущие контурные, просроченные красные */
function diamondClass(point: MilestonePoint) {
  if (point.status === "overdue") return "bg-danger";
  if (point.status === "done") return "bg-ok";
  if (point.past) return "bg-warn";
  return "border border-line-2 bg-surface";
}

function deviationTone(pp: number | null) {
  if (pp === null) return "info" as const;
  if (pp >= 0) return "ok" as const;
  return pp <= -10 ? ("danger" as const) : ("warn" as const);
}

function deviationText(pp: number | null) {
  if (pp === null) return "text-text-3";
  if (pp >= 0) return "text-ok";
  return pp <= -10 ? "text-danger" : "text-warn";
}

function deviationLabel(pp: number | null) {
  if (pp === null) return "нет срока";
  if (pp === 0) return "по графику";
  return `${pp > 0 ? "+" : "−"}${Math.abs(pp)} п. п.`;
}
