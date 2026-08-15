import { Link } from "@tanstack/react-router";
import { projects, type Project } from "@/mock/projects";
import { daysLeft, fmtDate, fmtMln, fmtNum, fmtPct } from "@/lib/format";
import { projectStatusLabel, projectStatusTone, StatusBadge } from "@/components/common/StatusBadge";
import { cn } from "@/lib/utils";

function Bar({ value, tone }: { value: number; tone: Project["status"] }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-sm bg-subtle">
      <div
        className={cn(
          "h-full rounded-sm",
          tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-accent",
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  const left = daysLeft(project.deadline);
  return (
    <Link
      to="/objects"
      className="card-surface flex h-full flex-col p-5 transition-fast hover:bg-subtle"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-card-title">{project.name}</div>
          <div className="truncate text-caption text-text-muted">{project.address}</div>
        </div>
        <StatusBadge tone={projectStatusTone[project.status]} dot>
          {projectStatusLabel[project.status]}
        </StatusBadge>
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="tnum text-[20px] leading-none font-semibold">{project.progress}%</span>
        <span className="text-caption text-text-secondary">
          срок {fmtDate(project.deadline)} · {left} дн.
        </span>
      </div>
      <div className="mt-2">
        <Bar value={project.progress} tone={project.status} />
      </div>

      <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-border pt-3 pt-4">
        <div>
          <dt className="text-caption text-text-muted">Объем</dt>
          <dd className="tnum text-table font-medium">
            {fmtNum(project.areaDone)} / {fmtNum(project.areaTotal)} м²
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Договор</dt>
          <dd className="tnum text-table font-medium">{fmtMln(project.contractSum)}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">План-факт</dt>
          <dd
            className={cn(
              "tnum text-table font-medium",
              project.planFactDeviation < -5
                ? "text-danger"
                : project.planFactDeviation < 0
                  ? "text-warn"
                  : "text-ok",
            )}
          >
            {fmtPct(project.planFactDeviation)}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

export function ProjectCards({ items = projects }: { items?: Project[] }) {
  return (
    <div className="grid auto-rows-fr gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {items.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  );
}
