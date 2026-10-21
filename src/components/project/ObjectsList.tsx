import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useWorkProgress } from "@/api/work-progress";
import type { ProjectListItem } from "@/api/types";
import { SegTabs, ToneDot } from "@/components/v3";
import type { V3Tone } from "@/components/v3/classes";
import { fmtNum, plural, shortName } from "@/lib/format";
import { projectStatusMeta } from "@/lib/project-meta";
import { cn } from "@/lib/utils";

/**
 * Объекты ГАЙКИ (ADR-041): что сделано на объекте и где не пришёл отчёт. Без строк
 * спецификации, ответов поставщиков и ревизий — это модуль прежнего контура за флагом.
 * Цифры хода работ считает слой данных по захваткам и принятым отчётам.
 *
 * Вид ADR-045, 5.16: карточка не выше 200 на 390, без градиента: название text-heading,
 * город и этап, процент выполнения, полоса 6 и три показателя. Статус точкой и словом.
 */
type Filter = "all" | "risk" | "missing";

export function ObjectsList({ items }: { items: ProjectListItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const atRisk = items.filter((item) => item.project.status === "at_risk");
  const missingItems = items.filter((item) => item.overview.missingReports > 0);
  const missing = items.reduce((sum, item) => sum + item.overview.missingReports, 0);
  const shown = filter === "risk" ? atRisk : filter === "missing" ? missingItems : items;
  return (
    <div className="flex flex-col gap-block">
      <p className="text-body-strong text-balance text-text">
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
        <ul className="grid gap-block sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((item) => (
            <ObjectTile key={item.project.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="text-body card-v3 px-5 py-8 text-center text-text-2">
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
        className="surface-1 focus-ring flex h-full flex-col gap-3 p-card transition-fast is-hover:bg-surface-2"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-heading text-text">
              {shortName(item.project.name)}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-text-3">
              <ToneDot tone={tone} />
              <span className="truncate">
                {status.label} · {item.overview.region} · {item.overview.stage}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-heading tnum text-text">
            {pct === null ? "—" : `${pct}%`}
          </span>
        </span>
        <span className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className="block h-full rounded-full bg-text-2" style={{ width: `${pct ?? 0}%` }} />
        </span>
        <dl className="grid grid-cols-3 gap-3">
          <Indicator label="План-факт" value={deviation?.value ?? "—"} />
          <Indicator label="Точка" value={next?.value ?? "нет"} />
          <Indicator
            label="Нет отчёта"
            value={fmtNum(missing)}
            tone={missing > 0 ? "warn" : undefined}
          />
        </dl>
        {done?.note ? <p className="text-meta text-text-3 tnum">{done.note}</p> : null}
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
      <dt className="text-meta text-text-3">{label}</dt>
      <dd
        className={cn(
          "text-body-strong tnum mt-0.5 truncate font-medium text-text",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
