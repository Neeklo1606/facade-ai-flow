import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { useAccess } from "@/api/access";
import { useNow } from "@/api/clock";
import { useDirectory } from "@/api/directory";
import { queries } from "@/api/queries";
import { useWorkProgress } from "@/api/work-progress";
import { EmptyState } from "@/components/common";
import { ListRowSkeleton } from "@/components/common/Skeletons";
import { EventCard, SectionTitle, TipContent, ToneDot } from "@/components/v3";
import { stretchedLink, tipCapsule, type V3Tone } from "@/components/v3/classes";
import type { Project } from "@/contracts";
import { fmtDayTitle, fmtNum, fmtTime, plural } from "@/lib/format";

const statusTone: Record<"review" | "accepted" | "returned", V3Tone> = {
  review: "warn",
  accepted: "ok",
  returned: "danger",
};

const statusLabel: Record<"review" | "accepted" | "returned", string> = {
  review: "Ожидает проверки",
  accepted: "Принят",
  returned: "Возвращён на уточнение",
};

/** Сколько событий показывает лента: остальные — в «Отчётах с площадки» */
const LIMIT = 12;

/**
 * Лента объекта (продукт, раздел 7: «В ленте события, а не сообщения»): отчёты с площадки
 * по дням, новые сверху. Карточка события с цветной полосой статуса открывает отчёты объекта.
 */
export function ProjectFeed({ project }: { project: Project }) {
  const { can } = useAccess();
  const now = useNow();
  const { employeeName } = useDirectory();
  const progress = useWorkProgress(project.id);
  const query = useQuery(queries.reports(project.id));
  const cards = (query.data ?? []).slice(0, LIMIT);
  const review = (query.data ?? []).filter((card) => card.report.status === "review").length;

  if (query.isPending)
    return (
      <div aria-busy="true" className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <ListRowSkeleton key={index} />
        ))}
      </div>
    );

  if (!cards.length)
    return (
      <div className="card-v3 px-5 py-6">
        <EmptyState
          icon={Radio}
          title="Событий пока нет"
          description="Здесь появятся отчёты с площадки: объём по захватке, люди, фото и проблемы."
        />
      </div>
    );

  const days = new Map<string, typeof cards>();
  for (const card of cards) {
    const day = card.report.date.slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), card]);
  }

  return (
    <div className="max-w-[960px] space-y-6">
      {review > 0 && can("field-reports", "write") ? (
        <Link to="/check" className={tipCapsule}>
          <TipContent>
            {fmtNum(review)} {plural(review, "отчёт ждёт", "отчёта ждут", "отчётов ждут")} вашей
            проверки. <span className="text-text-3">Открыть очередь</span>
          </TipContent>
        </Link>
      ) : null}

      {[...days.entries()].map(([day, list]) => (
        <section key={day} aria-label={fmtDayTitle(day, now)}>
          <SectionTitle
            className="mb-2"
            hint={`${fmtNum(list.length)} ${plural(list.length, "событие", "события", "событий")}`}
          >
            <span className="text-body-strong font-medium">{fmtDayTitle(day, now)}</span>
          </SectionTitle>
          <ul className="space-y-2.5">
            {list.map(({ report }) => {
              const zone = progress.raw.find((item) => item.id === report.zoneId)?.name ?? "";
              return (
                <li key={report.id}>
                  <EventCard
                    tone={statusTone[report.status]}
                    title={report.workType}
                    meta={[zone, employeeName(report.authorId)].filter(Boolean).join(" · ")}
                    aside={
                      <>
                        <span className="block font-medium text-text">
                          {fmtTime(report.sentAt)}
                        </span>
                        <span className="text-meta block text-text-3">
                          {fmtNum(report.acceptedQty ?? report.declaredQty)} {report.unit}
                        </span>
                      </>
                    }
                    footer={
                      <span className="text-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-text-2">
                        <span className="inline-flex items-center gap-2">
                          <ToneDot tone={statusTone[report.status]} />
                          {statusLabel[report.status]}
                        </span>
                        {report.headcount > 0 ? (
                          <span className="text-text-3">
                            · {fmtNum(report.headcount)}{" "}
                            {plural(report.headcount, "человек", "человека", "человек")}
                          </span>
                        ) : null}
                      </span>
                    }
                    action={
                      <Link
                        to="/projects/$id/field-reports"
                        params={{ id: project.id }}
                        search={{ status: report.status }}
                        aria-label={`Открыть отчёт: ${report.workType}`}
                        className={stretchedLink}
                      />
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {(query.data ?? []).length > LIMIT ? (
        <Link
          to="/projects/$id/field-reports"
          params={{ id: project.id }}
          className="text-body-strong focus-ring inline-flex min-h-12 items-center rounded-full bg-surface-2 px-5 font-medium text-text transition-fast is-hover:bg-surface-3"
        >
          Все отчёты объекта
        </Link>
      ) : null}
    </div>
  );
}
