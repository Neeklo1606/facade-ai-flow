import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useWorkProgress } from "@/api/work-progress";
import type { ProjectListItem } from "@/api/types";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Marker } from "@/components/gaika";
import { fmtNum, metaLine, plural, shortName } from "@/lib/format";
import { projectStatusMeta } from "@/lib/project-meta";

/**
 * Объекты ГАЙКИ (ADR-041): что сделано на объекте и где не пришёл отчёт. Без строк
 * спецификации, ответов поставщиков и ревизий — это модуль прежнего контура за флагом.
 * Цифры хода работ считает слой данных по захваткам и принятым отчётам.
 */
export function ObjectsList({ items }: { items: ProjectListItem[] }) {
  const atRisk = items.filter((item) => item.project.status === "at_risk").length;
  const missing = items.reduce((sum, item) => sum + item.overview.missingReports, 0);
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-3 gap-3 border-y border-line bg-surface py-5">
        <Figure label="Объекты" value={fmtNum(items.length)} />
        <Figure label="Под риском" value={fmtNum(atRisk)} tone={atRisk > 0 ? "warn" : undefined} />
        <Figure
          label="Нет отчёта"
          value={fmtNum(missing)}
          tone={missing > 0 ? "warn" : undefined}
        />
      </dl>
      <ul className="grid gap-3 xl:grid-cols-2">
        {items.map((item) => (
          <ObjectRow key={item.project.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | undefined;
}) {
  return (
    <div className="min-w-0 border-r border-line px-4 last:border-r-0">
      <dt>
        <Marker>{label}</Marker>
      </dt>
      <dd
        className={`tnum mt-2 text-[28px] leading-none font-semibold ${tone === "warn" ? "text-warn" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function ObjectRow({ item }: { item: ProjectListItem }) {
  const progress = useWorkProgress(item.project.id);
  const done = progress.metrics.find((metric) => metric.key === "done") ?? null;
  const pct = done ? Number.parseInt(done.value, 10) : null;
  const status = projectStatusMeta[item.project.status];
  const missing = item.overview.missingReports;
  return (
    <li>
      <Link
        to="/projects/$id"
        params={{ id: item.project.id }}
        className="focus-ring press bg-surface flex h-full flex-col gap-4 rounded-[var(--r-lg)] border border-line px-5 py-5 transition-fast hover:border-line-2"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-card-title block">{shortName(item.project.name)}</span>
            <span className="text-caption text-text-2 block">
              {metaLine(item.overview.region, item.overview.stage)}
            </span>
          </div>
          <ChevronRight className="text-text-3 mt-1 size-4 shrink-0" />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <Marker>Выполнено</Marker>
            <span className="tnum text-list">
              {pct === null ? "считается" : `${pct}%`}
              {done?.note ? <span className="text-caption text-text-3"> · {done.note}</span> : null}
            </span>
          </div>
          <div className="bg-surface-2 mt-2 h-1.5 overflow-hidden rounded-full" aria-hidden="true">
            <div className="bg-text-2 h-full rounded-full" style={{ width: `${pct ?? 0}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {missing > 0 ? (
            <span className="text-caption text-warn">
              {fmtNum(missing)}{" "}
              {plural(missing, "отчёт не пришёл", "отчёта не пришли", "отчётов не пришли")}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
