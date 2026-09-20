import { useState } from "react";
import { recordAction } from "@/lib/guide/telemetry";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  FileSpreadsheet,
  HardHat,
  MessageSquare,
  Phone,
  Users,
  UsersRound,
} from "lucide-react";
import {
  CountPill,
  EmptyState,
  EntityDrawer,
  ExplainPopover,
  InitialsAvatar,
  MetricStrip,
  MetricStripSkeleton,
  StatusBadge,
  WidgetCard,
  WidgetCardHeader,
} from "@/components/common";
import { SkeletonLine } from "@/components/common/Skeletons";
import { Button } from "@/components/ui/button";
import { useTeam } from "@/api/work-progress";
import { useNow } from "@/api/clock";
import { exportTeam, teamFileName } from "@/api/team-export";
import { saveFile } from "@/lib/download";
import { useAccess } from "@/api/access";
import { toast } from "@/lib/toast";
import type { TeamCrew, TeamPerson } from "@/api/types";
import { fmtAgoFrom, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { reportsGapLine, reportsGapNote, type ReportsGap } from "@/lib/reports-gap";
import type { Project } from "@/contracts";

const metricIcon = { people: Users, crews: UsersRound, silent: HardHat } as const;

/**
 * Вкладка «Команда»: люди объекта с контактами и последней активностью, бригады с захваткой
 * последнего отчёта. Выгрузка в Excel повторяет то, что видно на экране.
 */
export function TeamTab({ project }: { project: Project }) {
  const { can } = useAccess();
  const team = useTeam(project.id);
  // Пропуск в отчётах с площадки: на нём держатся все значения вкладки, что считаются по отчётам
  const gap = team.reportsGap;
  const now = useNow();
  const [personId, setPersonId] = useState<string | null>(null);
  const [onlySilent, setOnlySilent] = useState(false);
  const [exporting, setExporting] = useState(false);

  const person = team.people.find((row) => row.id === personId) ?? null;
  const silentIds = new Set(team.silent.map((crew) => crew.id));
  const crews = onlySilent ? team.crews.filter((crew) => silentIds.has(crew.id)) : team.crews;

  async function handleExport() {
    setExporting(true);
    try {
      saveFile(await exportTeam(project.name, team.people), teamFileName(project.code));
      recordAction("exportExcel");
      toast.success("Команда выгружена", {
        description: `${fmtNum(team.people.length)} ${team.people.length === 1 ? "сотрудник" : "сотрудников"} в файле Excel`,
      });
    } catch {
      toast.error("Не удалось сформировать файл Excel");
    } finally {
      setExporting(false);
    }
  }

  if (team.pending)
    return (
      <div className="space-y-4">
        <MetricStripSkeleton count={3} />
        <div className="widget-card space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonLine key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );

  if (!team.people.length)
    return (
      <WidgetCard>
        <EmptyState
          icon={Users}
          title="На объекте пока никого нет"
          description="Люди появляются здесь, когда их закрепляют за объектом: руководитель, ПТО, снабжение и прорабы бригад."
        />
      </WidgetCard>
    );

  return (
    <div className="space-y-4">
      <MetricStrip
        label="Показатели команды"
        items={team.metrics.map((metric) => ({
          icon: metricIcon[metric.key as keyof typeof metricIcon] ?? Users,
          label: metric.label,
          // Показатель считается по отчётам: без них он не показывается (`lib/reports-gap`)
          value: metric.key === "silent" && gap ? "—" : metric.value,
          ...(metric.key === "silent" && gap
            ? { note: reportsGapNote[gap] }
            : metric.note
              ? { note: metric.note }
              : {}),
          explain: (
            <ExplainPopover
              title={metric.explain.title}
              formula={metric.explain.formula}
              // Разбор считается по тем же отчётам: без них он перечислял бы все бригады молчащими
              sources={
                metric.key === "silent" && gap
                  ? [{ label: reportsGapNote[gap] }]
                  : metric.explain.sources
              }
            />
          ),
          // Ячейка кликабельна, только если её нажатие что-то меняет (находка ревью LOW)
          ...(metric.key === "silent" && gap
            ? {}
            : metric.filter === "silent"
              ? { onSelect: () => setOnlySilent((value) => !value), selected: onlySilent }
              : metric.filter === "all" && onlySilent
                ? { onSelect: () => setOnlySilent(false) }
                : {}),
        }))}
      />

      <WidgetCard>
        <WidgetCardHeader
          level={2}
          icon={Users}
          title="Люди на объекте"
          hint="контакты и последняя активность"
          aside={
            <>
              <CountPill>{fmtNum(team.people.length)}</CountPill>
              {can("export") && (
                <Button variant="secondary" size="sm" onClick={handleExport} loading={exporting}>
                  {!exporting && <FileSpreadsheet className="size-4" />} Excel
                </Button>
              )}
            </>
          }
        />
        <ul className="-mx-6 divide-y divide-line">
          {team.people.map((row) => (
            <PersonRow
              key={row.id}
              row={row}
              now={now}
              gap={gap}
              onOpen={() => setPersonId(row.id)}
            />
          ))}
        </ul>
      </WidgetCard>

      <WidgetCard>
        <WidgetCardHeader
          level={2}
          icon={UsersRound}
          title="Бригады"
          hint={onlySilent ? "без отчёта за 7 дней" : "состав и последняя захватка"}
          aside={
            <>
              <CountPill>{fmtNum(crews.length)}</CountPill>
              {onlySilent && (
                <Button variant="ghost" size="sm" onClick={() => setOnlySilent(false)}>
                  Показать все
                </Button>
              )}
            </>
          }
        />
        {crews.length === 0 ? (
          <EmptyState
            variant="filtered"
            title="Все бригады отчитались"
            description="За последние семь дней отчёт пришёл от каждой бригады объекта."
            actionLabel="Показать все бригады"
            onAction={() => setOnlySilent(false)}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {crews.map((crew) => (
              <CrewCard
                key={crew.id}
                crew={crew}
                projectId={project.id}
                gap={gap}
                silent={!gap && silentIds.has(crew.id)}
              />
            ))}
          </ul>
        )}
      </WidgetCard>

      {person && (
        <EntityDrawer
          open
          onOpenChange={() => setPersonId(null)}
          title={person.name}
          subtitle={person.position}
          badges={
            person.crewName ? <StatusBadge tone="info">{person.crewName}</StatusBadge> : undefined
          }
        >
          <div className="space-y-5">
            <div className="grid gap-2">
              <ContactButton icon={Phone} href={`tel:${person.phone.replace(/[^+\d]/g, "")}`}>
                {person.phone}
              </ContactButton>
              {person.telegram ? (
                <ContactButton
                  icon={MessageSquare}
                  href={`https://t.me/${person.telegram.replace("@", "")}`}
                >
                  {person.telegram}
                </ContactButton>
              ) : (
                <p className="text-[13px] text-text-3">Telegram не указан</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[12px] text-text-3">Объектов в работе</p>
                <p className="tnum mt-0.5 text-[14px] text-text">{fmtNum(person.projectCount)}</p>
              </div>
              <div>
                <p className="text-[12px] text-text-3">Последний отчёт</p>
                <p className="mt-0.5 text-[14px] text-text">
                  {person.lastReport
                    ? `${fmtAgoFrom(person.lastReport.at, now)} · ${person.lastReport.zoneName}`
                    : gap
                      ? reportsGapNote[gap]
                      : "Отчётов не было"}
                </p>
              </div>
            </div>
            <p className="text-[13px] leading-[1.5] text-text-3">
              Допуски и удостоверения появятся в карточке после загрузки кадровых документов — в
              модели данных их пока нет.
            </p>
            {can("field-reports") && (
              <Button variant="secondary" asChild className="w-full">
                <Link to="/projects/$id/field-reports" params={{ id: project.id }} search={{}}>
                  Отчёты с площадки <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        </EntityDrawer>
      )}
    </div>
  );
}

function PersonRow({
  row,
  now,
  gap,
  onOpen,
}: {
  row: TeamPerson;
  now: string;
  /** Отчётов нет на руках: «без отчётов» было бы неправдой (`lib/reports-gap`) */
  gap: ReportsGap | null;
  onOpen: () => void;
}) {
  return (
    <li className="group relative flex items-center gap-3 px-6 py-3 transition-fast is-hover:bg-surface-2">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Открыть карточку: ${row.name}`}
        className="focus-ring flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left after:absolute after:inset-0 after:content-['']"
      >
        <InitialsAvatar name={row.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] leading-[1.35] font-medium text-text">
            {row.name}
          </span>
          <span className="block truncate text-[13px] leading-[1.4] text-text-3">
            {row.position}
            {row.crewName ? ` · ${row.crewName}` : ""}
          </span>
        </span>
        <span className="hidden shrink-0 text-right text-[12px] text-text-3 lg:block">
          {row.lastReport ? fmtAgoFrom(row.lastReport.at, now) : gap ? "—" : "без отчётов"}
        </span>
      </button>
      {/* Звонок и сообщение — поверх строки: это отдельные действия, а не открытие карточки */}
      <span className="relative z-[2] flex shrink-0 items-center gap-1.5">
        <IconLink
          href={`tel:${row.phone.replace(/[^+\d]/g, "")}`}
          label={`Позвонить: ${row.name}, ${row.phone}`}
        >
          <Phone className="size-4" strokeWidth={1.75} aria-hidden />
        </IconLink>
        {row.telegram && (
          <IconLink
            href={`https://t.me/${row.telegram.replace("@", "")}`}
            label={`Написать в Telegram: ${row.name}, ${row.telegram}`}
          >
            <MessageSquare className="size-4" strokeWidth={1.75} aria-hidden />
          </IconLink>
        )}
      </span>
    </li>
  );
}

/** Кнопка связи: 48px на телефоне, компактнее на десктопе */
function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="focus-ring grid size-12 place-items-center rounded-[var(--r-sm)] bg-surface-2 text-text-2 transition-fast is-hover:bg-surface-3 is-hover:text-text lg:size-9"
    >
      {children}
    </a>
  );
}

function ContactButton({
  icon: Icon,
  href,
  children,
}: {
  icon: typeof Phone;
  href: string;
  children: React.ReactNode;
}) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="focus-ring flex min-h-12 items-center gap-3 rounded-[var(--r-sm)] border border-line bg-surface-2 px-4 text-[14px] text-text transition-fast is-hover:border-line-2"
    >
      <Icon className="size-4 shrink-0 text-text-3" strokeWidth={1.75} aria-hidden />
      {children}
    </a>
  );
}

function CrewCard({
  crew,
  projectId,
  gap,
  silent,
}: {
  crew: TeamCrew;
  projectId: string;
  /** Отчётов нет на руках: захватка бригады из них и считается (`lib/reports-gap`) */
  gap: ReportsGap | null;
  silent: boolean;
}) {
  return (
    <li
      className={cn(
        // min-w-0: иначе ячейка сетки растягивается по самому длинному слову внутри
        "min-w-0 rounded-[var(--r-md)] border border-line bg-surface-2 px-4 py-3",
        silent && "border-warn/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-text">{crew.name}</p>
          <p className="mt-0.5 truncate text-[13px] text-text-3">
            {crew.specialization} · прораб {crew.foremanName}
          </p>
        </div>
        <span className="tnum shrink-0 text-[13px] text-text-2">{crew.headcount} чел.</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* Захватка приходит из отчётов, поэтому со ссылкой на них: без них ветка недостижима */}
        {crew.lastZone ? (
          <Link
            to="/projects/$id/field-reports"
            params={{ id: projectId }}
            search={{ zone: crew.lastZone.id }}
            className="focus-ring inline-flex min-h-11 min-w-0 items-center gap-1.5 text-[13px] font-medium text-text-2 transition-fast is-hover:text-text lg:min-h-0"
          >
            <span className="truncate">{crew.lastZone.name}</span>
            <ArrowRight className="size-3.5 shrink-0" aria-hidden />
          </Link>
        ) : (
          <span className="text-[13px] text-text-3">
            {gap ? reportsGapLine("Последняя захватка", gap) : "Отчётов от бригады не было"}
          </span>
        )}
        {silent && <StatusBadge tone="warn">Без отчёта 7 дней</StatusBadge>}
      </div>
    </li>
  );
}
