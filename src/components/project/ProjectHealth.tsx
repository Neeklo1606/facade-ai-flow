import { useQuery } from "@tanstack/react-query";
import { useAccess } from "@/api/access";
import { queries } from "@/api/queries";
import { useWorkProgress } from "@/api/work-progress";
import { ToneDot } from "@/components/v3";
import { type V3Tone } from "@/components/v3/classes";
import type { Project, ProjectOverview } from "@/contracts";
import { fmtNum, plural } from "@/lib/format";
import { projectStatusMeta } from "@/lib/project-meta";
import { cn } from "@/lib/utils";

/**
 * Карточка здоровья объекта (продукт, раздел 7: «Объект»): главная цифра — доля выполненного
 * объёма на тёплом поле с шаром, рядом четыре показателя. Только чтение: цифры те же, что
 * во вкладке «Ход работ», их считает слой данных.
 */
export function ProjectHealth({
  project,
  overview,
}: {
  project: Project;
  overview: ProjectOverview;
}) {
  const progress = useWorkProgress(project.id);
  const { can } = useAccess();
  const reports = useQuery({ ...queries.reports(project.id), enabled: can("field-reports") });
  const metric = (key: string) => progress.metrics.find((entry) => entry.key === key) ?? null;
  const done = metric("done");
  const deviation = metric("deviation");
  const next = metric("next");
  const days = metric("days");
  const review = (reports.data ?? []).filter((card) => card.report.status === "review").length;
  const missing = overview.missingReports;
  const status = projectStatusMeta[project.status];
  const tone: V3Tone =
    project.status === "at_risk"
      ? "danger"
      : project.status === "paused" || missing > 0
        ? "warn"
        : project.status === "done"
          ? "neutral"
          : "ok";
  const pending = progress.pending && !done;

  return (
    <section
      aria-labelledby="project-health-title"
      className="hero-field mb-5 px-5 pt-5 pb-5 sm:px-8 sm:pt-7 sm:pb-7"
    >
      <span
        aria-hidden
        className="orb -top-20 -left-16 size-[240px] sm:-top-24 sm:-left-10 sm:size-[340px]"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="project-health-title" className="text-[14px] font-medium text-text-2">
          Здоровье объекта
        </h2>
        <span className="glass inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-text">
          <ToneDot tone={tone} />
          {status.label}
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-6 lg:mt-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <div className="min-w-0">
          <p className="flex items-baseline gap-3">
            <span className="text-hero-num text-text">{pending ? "—" : (done?.value ?? "—")}</span>
            <span className="text-[16px] leading-6 text-text-2">выполнено</span>
          </p>
          <p className="tnum mt-2 text-[14px] leading-5 text-text-3">
            {pending ? "Считаем по захваткам…" : (done?.note ?? "Захватки не заведены")}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[560px]">
          <Indicator label="План-факт" value={deviation?.value ?? "—"} />
          <Indicator
            label="Контрольная точка"
            value={next?.value ?? "нет"}
            note={
              days && days.value !== "—"
                ? `через ${days.value} ${plural(Number(days.value.replace(/\D/gu, "")) || 0, "день", "дня", "дней")}`
                : undefined
            }
          />
          <Indicator
            label="Нет отчёта"
            value={fmtNum(missing)}
            note={
              missing > 0 ? plural(missing, "не пришёл", "не пришли", "не пришли") : "все пришли"
            }
            tone={missing > 0 ? "warn" : undefined}
          />
          <Indicator
            label="Ждут проверки"
            value={fmtNum(review)}
            note={plural(review, "отчёт", "отчёта", "отчётов")}
          />
        </dl>
      </div>
    </section>
  );
}

function Indicator({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string | undefined;
  tone?: "warn" | undefined;
}) {
  return (
    <div className="glass min-w-0 rounded-[var(--r-lg)] px-4 py-3">
      <dt className="truncate text-[12px] leading-4 text-text-3">{label}</dt>
      <dd
        className={cn(
          "tnum mt-1 truncate text-[20px] leading-6 font-semibold tracking-[-0.01em] text-text",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </dd>
      {note ? <dd className="mt-0.5 truncate text-[12px] leading-4 text-text-3">{note}</dd> : null}
    </div>
  );
}
