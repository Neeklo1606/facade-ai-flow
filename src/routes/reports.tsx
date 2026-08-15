import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  HardHat,
  ImageIcon,
  Mic,
  Pause,
  Pencil,
  Play,
  Send,
  Undo2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import { ConfidenceIndicator } from "@/components/common/ConfidenceIndicator";
import { AgentSourceBadge } from "@/components/common/AgentSourceBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ProgressBar } from "@/components/common/ProgressBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useData } from "@/lib/data-context";
import { useAuth } from "@/lib/auth-context";
import { projects } from "@/mock/projects";
import {
  foremanDiscipline,
  reportStatusLabels,
  yesterdaySubmission,
  type ReportField,
  type SiteReport,
} from "@/mock/reports";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Отчёты с объектов — ФАСАД-РП" },
      { name: "description", content: "Отчёты прорабов из Telegram: объемы, фото, проблемы и проверка РП." },
      { property: "og:title", content: "Отчёты с объектов — ФАСАД-РП" },
      { property: "og:description", content: "Отчёты прорабов из Telegram: объемы, фото, проблемы и проверка РП." },
    ],
  }),
  component: ReportsPage,
});

const statusTone: Record<string, StatusTone> = {
  pending: "info",
  accepted: "ok",
  returned: "warn",
};

const projectName = (id: string) => projects.find((p) => p.id === id)?.shortName ?? id;

function ReportsPage() {
  const { reports } = useData();
  const { account } = useAuth();
  const isForeman = account?.role === "foreman";

  const [project, setProject] = useState("all");
  const [author, setAuthor] = useState("all");
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("week");

  const authors = useMemo(() => Array.from(new Set(reports.map((r) => r.author))), [reports]);

  const rows = reports.filter((r) => {
    if (isForeman && r.author !== account?.user.name) return false;
    if (project !== "all" && r.projectId !== project) return false;
    if (author !== "all" && r.author !== author) return false;
    if (status !== "all" && r.status !== status) return false;
    if (period === "yesterday" && !r.createdAt.startsWith("2026-08-11")) return false;
    if (period === "today" && !r.createdAt.startsWith("2026-08-12")) return false;
    return true;
  });

  return (
    <>
      <PageHeader
        title="Отчёты с объектов"
        description="Отчёты прорабов приходят из Telegram. Данные синтетические."
        actions={
          isForeman ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => toast.success("Отчёт отправлен (демо)", { description: "В проде уходит РП на проверку." })}
            >
              <Send className="size-4" /> Отправить отчёт
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Сдача отчётов за вчера">
          <div className="flex items-baseline gap-2">
            <span className="tnum text-[28px] leading-none font-semibold">
              {yesterdaySubmission.submitted}
            </span>
            <span className="text-caption text-text-muted">
              из {yesterdaySubmission.expected} ожидавшихся
            </span>
          </div>
          <ProgressBar
            className="mt-3"
            value={Math.round((yesterdaySubmission.submitted / yesterdaySubmission.expected) * 100)}
            tone="warn"
          />
        </Panel>
        <Panel title="Дисциплина прорабов">
          <ul className="space-y-2.5">
            {foremanDiscipline.map((d) => (
              <li key={d.name} className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-center gap-3">
                <span className="truncate text-table">{d.name}</span>
                <ProgressBar
                  value={Math.round((d.submitted / d.expected) * 100)}
                  tone={d.submitted / d.expected > 0.85 ? "ok" : "warn"}
                />
                <span className="tnum text-caption text-text-muted">
                  {d.submitted}/{d.expected}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger className="h-9 w-52"><SelectValue placeholder="Объект" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все объекты</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.shortName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isForeman && (
          <Select value={author} onValueChange={setAuthor}>
            <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Прораб" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все прорабы</SelectItem>
              {authors.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Проверка" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой статус</SelectItem>
            <SelectItem value="pending">Не проверен</SelectItem>
            <SelectItem value="accepted">Принят</SelectItem>
            <SelectItem value="returned">Возвращен</SelectItem>
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Период" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="week">За неделю</SelectItem>
            <SelectItem value="today">Сегодня</SelectItem>
            <SelectItem value="yesterday">Вчера</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <Panel bodyClassName="p-0">
          <EmptyState icon={HardHat} title="Отчётов нет" description="Под выбранные фильтры отчёты не нашлись." />
        </Panel>
      ) : (
        <div className="columns-1 gap-3 xl:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid">
          {rows.map((r) => (
            <ReportCard key={r.id} report={r} readOnly={isForeman} />
          ))}
        </div>
      )}
    </>
  );
}

function ReportCard({ report: r, readOnly }: { report: SiteReport; readOnly: boolean }) {
  const { acceptReport, returnReport, updateReportFields } = useData();
  const [playing, setPlaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<ReportField[]>(r.fields ?? []);
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [comment, setComment] = useState("");

  return (
    <article className="card-surface inline-flex w-full flex-col p-4">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-subtle text-caption font-medium">
          {r.authorInitials}
        </span>
        <div className="min-w-0">
          <div className="truncate text-table font-medium">{r.author}</div>
          <div className="truncate text-caption text-text-muted">
            {projectName(r.projectId)} · {r.zone} · {r.floors}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge tone={statusTone[r.status]!}>{reportStatusLabels[r.status]}</StatusBadge>
          <span className="tnum text-caption text-text-muted">{fmtDateTime(r.createdAt)}</span>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="text-table">{r.workType},</span>
        <span className="tnum text-[20px] leading-none font-semibold">
          {fmtNum(r.volume)} {r.unit}
        </span>
      </div>

      {/* Галерея: на мобильных — свайп по горизонтали */}
      <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {Array.from({ length: r.photos }).map((_, i) => (
          <span
            key={i}
            className="relative flex h-20 w-28 shrink-0 snap-start items-center justify-center overflow-hidden rounded-md border border-border bg-subtle"
          >
            <ImageIcon className="size-4 text-text-muted" strokeWidth={1.5} />
            <span className="absolute inset-x-0 bottom-0 truncate bg-[color:var(--bg-surface)]/85 px-1 py-0.5 text-[11px] leading-[14px] text-text-secondary">
              {r.workType}
            </span>
          </span>
        ))}
      </div>

      {r.source === "voice" && (
        <div className="mt-3 rounded-md border border-border p-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              aria-label={playing ? "Пауза" : "Воспроизвести"}
              onClick={() => setPlaying((v) => !v)}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
              <span className={cn("block h-full rounded-full bg-accent", playing ? "w-1/2" : "w-0")} />
            </span>
            <span className="tnum inline-flex items-center gap-1 text-caption text-text-muted">
              <Mic className="size-3.5" /> {r.voiceDurationSec}с
            </span>
          </div>
          {r.transcript && <p className="mt-2 text-caption text-text-secondary">«{r.transcript}»</p>}

          {fields.length > 0 && (
            <div className="mt-3">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-overline text-text-muted">Разобрано агентом</span>
                <AgentSourceBadge
                  agent="Разбор голосовых отчётов"
                  at={fmtDateTime(r.createdAt)}
                  source="голосовое сообщение из Telegram"
                />
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                {fields.map((f, i) => (
                  <div key={f.key} className="min-w-0">
                    <dt className="flex items-center gap-1.5 text-caption text-text-muted">
                      {f.label}
                      <ConfidenceIndicator level={f.confidence} />
                    </dt>
                    <dd className="mt-0.5">
                      {editing ? (
                        <Input
                          value={f.value}
                          className="h-9"
                          onChange={(e) =>
                            setFields((prev) =>
                              prev.map((x, xi) => (xi === i ? { ...x, value: e.target.value } : x)),
                            )
                          }
                        />
                      ) : (
                        <span className="text-table">{f.value}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {r.issues.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {r.issues.map((issue) => (
            <li key={issue} className="rounded-md bg-warn-bg px-2.5 py-1.5 text-caption text-text-primary">
              {issue}
            </li>
          ))}
        </ul>
      )}

      {r.returnComment && (
        <p className="mt-3 rounded-md bg-subtle px-2.5 py-1.5 text-caption text-text-secondary">
          Возвращен прорабу: {r.returnComment}
        </p>
      )}

      {!readOnly && (
        <footer className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" className="gap-1.5" disabled={r.status === "accepted"} onClick={() => setConfirmAccept(true)}>
            <Check className="size-4" /> Принять
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              if (editing) {
                updateReportFields(r.id, fields);
                toast.success("Поля отчёта обновлены (демо)");
              }
              setEditing((v) => !v);
            }}
          >
            <Pencil className="size-4" /> {editing ? "Сохранить" : "Редактировать"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReturnOpen(true)}>
            <Undo2 className="size-4" /> Вернуть прорабу
          </Button>
        </footer>
      )}

      <Dialog open={confirmAccept} onOpenChange={setConfirmAccept}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Принять отчёт {r.id}?</DialogTitle>
            <DialogDescription>
              {r.workType}, {fmtNum(r.volume)} {r.unit} — объем попадет в план-факт объекта «{projectName(r.projectId)}».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAccept(false)}>Отмена</Button>
            <Button
              onClick={() => {
                acceptReport(r.id);
                setConfirmAccept(false);
                toast.success("План-факт обновлён (демо)", {
                  description: `+${fmtNum(r.volume)} ${r.unit} к факту объекта.`,
                });
              }}
            >
              Принять
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Вернуть отчёт прорабу</DialogTitle>
            <DialogDescription>Комментарий уйдет автору отчёта в Telegram (демо-имитация).</DialogDescription>
          </DialogHeader>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Что исправить в отчёте"
          />
          <div className="rounded-md border border-border bg-subtle p-3">
            <div className="text-overline text-text-muted">Превью Telegram</div>
            <div className="mt-1.5 rounded-md bg-[color:var(--bg-surface)] p-2.5 text-caption">
              <div className="font-medium">ФАСАД-РП</div>
              <div className="text-text-secondary">
                {r.author}, отчёт {r.id} возвращен на доработку. {comment || "…"}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Отмена</Button>
            <Button
              disabled={!comment.trim()}
              onClick={() => {
                returnReport(r.id, comment.trim());
                setReturnOpen(false);
                setComment("");
                toast.success("Отчёт возвращен прорабу (демо)", { description: "Сообщение не отправлялось." });
              }}
            >
              Вернуть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
