import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useWorkProgress } from "@/api/work-progress";
import type { ProjectListItem } from "@/api/types";
import { SegTabs, ToneDot } from "@/components/v3";
import { healthField, type V3Tone } from "@/components/v3/classes";
import { fmtNum, plural, shortName } from "@/lib/format";
import { projectStatusMeta } from "@/lib/project-meta";
import { cn } from "@/lib/utils";

/**
 * Объекты ГАЙКИ (ADR-041): что сделано на объекте и где не пришёл отчёт. Без строк
 * спецификации, ответов поставщиков и ревизий — это модуль прежнего контура за флагом.
 * Цифры хода работ считает слой данных по захваткам и принятым отчётам.
 *
 * Визуал v3 (ADR-044): объект — крупная плитка-виджет с полем цвета здоровья сверху,
 * подпись с названием под плиткой. Фильтры — капсулы.
 */
type Filter = "all" | "risk" | "missing";

export function ObjectsList({ items }: { items: ProjectListItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const atRisk = items.filter((item) => item.project.status === "at_risk");
  const missingItems = items.filter((item) => item.overview.missingReports > 0);
  const missing = items.reduce((sum, item) => sum + item.overview.missingReports, 0);
  const shown = filter === "risk" ? atRisk : filter === "missing" ? missingItems : items;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[20px] leading-[1.3] font-semibold tracking-[-0.015em] text-balance text-text sm:text-[24px]">
        {fmtNum(items.length)} {plural(items.length, "объект", "объекта", "объектов")} в работе.{" "}
        <span className="tone-2">
          {atRisk.length > 0 ? `${fmtNum(atRisk.length)} под риском` : "Под риском ни одного"}
          {missing > 0
            ? `, ${fmtNum(missing)} ${plural(missing, "отчёт не пришёл", "отчёта не пришли", "отчётов не пришли")}.`
            : ", все отчёты пришли."}
        </span>
      </p>
      <SegTabs
        label="Какие объекты показать"
        stretch
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: "all", label: "Все", count: items.length },
          { value: "risk", label: "Под риском", count: atRisk.length },
          { value: "missing", label: "Нет отчёта", count: missingItems.length },
        ]}
      />
      {shown.length ? (
        <ul className="grid gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((item) => (
            <ObjectTile key={item.project.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="card-v3 px-5 py-8 text-center text-[15px] text-text-2">
          По этому условию объектов нет.
        </p>
      )}
    </div>
  );
}

/** Цвет здоровья объекта: под риском красный, пропуск отчёта янтарный, иначе зелёный */
function healthOf(item: ProjectListItem): V3Tone {
  if (item.project.status === "at_risk") return "danger";
  if (item.project.status === "paused" || item.overview.missingReports > 0) return "warn";
  if (item.project.status === "done") return "neutral";
  return "ok";
}

function ObjectTile({ item }: { item: ProjectListItem }) {
  const progress = useWorkProgress(item.project.id);
  const metric = (key: string) => progress.metrics.find((entry) => entry.key === key) ?? null;
  const done = metric("done");
  const deviation = metric("deviation");
  const next = metric("next");
  const pct = done ? Number.parseInt(done.value, 10) : null;
  const status = projectStatusMeta[item.project.status];
  const missing = item.overview.missingReports;
  const tone = healthOf(item);
  return (
    <li className="min-w-0">
      <Link
        to="/projects/$id"
        params={{ id: item.project.id }}
        className="focus-ring press group flex h-full flex-col gap-3 rounded-[var(--r-2xl)]"
      >
        <div className="card-v3 relative flex flex-1 flex-col overflow-hidden rounded-[var(--r-2xl)] p-5 transition-fast group-hover:shadow-[var(--lift-2)]">
          <span aria-hidden className={cn("absolute inset-x-0 top-0 h-36", healthField[tone])} />
          <div className="relative flex items-center justify-between gap-3">
            <span className="glass inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-text">
              <ToneDot tone={tone} />
              {status.label}
            </span>
            <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-text-2 transition-fast group-hover:text-text">
              <ArrowUpRight className="size-4" aria-hidden />
            </span>
          </div>
          <div className="relative mt-6 flex items-baseline gap-2">
            <span className="tnum text-[48px] leading-none font-semibold tracking-[-0.03em] text-text">
              {pct === null ? "—" : `${pct}%`}
            </span>
            <span className="text-[14px] text-text-3">выполнено</span>
          </div>
          <div
            className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3"
            aria-hidden
          >
            <div className="h-full rounded-full bg-text-2" style={{ width: `${pct ?? 0}%` }} />
          </div>
          <dl className="relative mt-5 grid grid-cols-3 gap-3">
            <Indicator label="Объём" value={done?.note ?? "считается"} wide />
            <Indicator label="План-факт" value={deviation?.value ?? "—"} />
            <Indicator label="Точка" value={next?.value ?? "нет"} />
            <Indicator
              label="Нет отчёта"
              value={fmtNum(missing)}
              tone={missing > 0 ? "warn" : undefined}
            />
          </dl>
        </div>
        <span className="block px-1 text-center">
          <span className="block truncate text-[15px] leading-[1.3] font-medium text-text">
            {shortName(item.project.name)}
          </span>
          <span className="mt-0.5 block truncate text-[13px] leading-[1.35] text-text-3">
            {item.overview.region} · {item.overview.stage}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Indicator({
  label,
  value,
  tone,
  wide,
}: {
  label: string;
  value: string;
  tone?: "warn" | undefined;
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0", wide && "col-span-3")}>
      <dt className="text-[12px] leading-4 text-text-3">{label}</dt>
      <dd
        className={cn(
          "tnum mt-0.5 truncate text-[14px] leading-5 font-medium text-text",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
